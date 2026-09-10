/** @file-guide
 * 목적: guard.js (historical)
 * 책임/재사용: 읽기 전용 당시 자료다. 현행 명세/구현 근거로 복사하지 않고 최신 docs/CLAUDE.md와 원본을 대조한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/* ══════════════════════════════════════════════════════════════════════════
   guard.js — 자원 충돌 방어 함수 (SSOT)
   ──────────────────────────────────────────────────────────────────────────
   대표 지시 (2026-08-25):
     "강사쪽과 코디네이터 쪽이 따로 배정하면 겹치는 거는 캘린더선에서 막고
      방어함수를 짜야 함."

   일정을 만들거나 옮기는 **모든 경로**가 이 함수를 지난다.
     · 캘린더에서 새 수업 만들기 (드래그)
     · 캘린더에서 블록 옮기기 / 리사이즈
     · 복사 · 붙여넣기
     · 관리자 배정 화면
     · 불가 시간 등록 (이미 확정된 수업과 겹치는지)
     · 코디네이터 예약 (같은 자원 풀)

   불변식 (docs/V26-SPEC.md §5.4)
     I-9   프론트에서 막는 것은 안내다. 실제로 막는 것은 서버다.
           같은 판정을 서버가 다시 실행한다.
     I-10  코디네이터 예약(ctx.coordSessions)을 빼면 함수가 조용히 틀린 답을 낸다.
           두 시스템이 자원을 공유하는 한 이 인자는 선택이 아니다.
   ══════════════════════════════════════════════════════════════════════════ */

const GUARD = (() => {

  /* 에러 코드 — docs/CONTRACTS.md §5 와 같은 문자열을 쓴다 */
  const CODE = {
    INSTRUCTOR:  'CONFLICT_INSTRUCTOR',
    CLASSROOM:   'CONFLICT_CLASSROOM',
    ZOOM:        'CONFLICT_ZOOM',
    UNAVAILABLE: 'CONFLICT_UNAVAILABLE',
    STUDENT:     'CONFLICT_STUDENT',
  };

  /* ── 시간 겹침 ─────────────────────────────────────────────────────────
     [aS, aE) 와 [bS, bE) 가 겹치는가. 경계가 맞닿는 것은 겹침이 아니다.
     10:00–11:00 과 11:00–12:00 은 연달아 붙은 수업이지 충돌이 아니다.        */
  function overlaps(aS, aE, bS, bE) {
    return aS < bE && bS < aE;
  }

  const fmt = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  const span = o => `${fmt(o.startMin)}–${fmt(o.endMin)}`;

  /** 같은 날짜 · 취소되지 않음 · 자기 자신 제외 */
  function candidates(list, cand, dateKey) {
    return (list || []).filter(o =>
      !o.canceled &&
      o[dateKey] === cand.date &&
      !(cand.id != null && o.id === cand.id && o.__kind !== 'coord')
    );
  }

  /* 강사 수업과 코디 예약을 같은 모양으로 본다 — 자원 점유는 둘 다 같기 때문 */
  function asOccupancy(ctx, cand) {
    const classes = candidates(ctx.classes, cand, 'date')
      .map(c => ({ ...c, __kind: 'class', __label: `${c.subject || '수업'}` }));
    const coord = candidates(ctx.coordSessions, cand, 'sessionDate')
      .map(c => ({ ...c, __kind: 'coord', __label: `코디네이터 예약` }));
    return classes.concat(coord);
  }

  const V = (code, message, meta) => ({ code, message, meta: meta || {} });

  /* ── 개별 검사 5종 ─────────────────────────────────────────────────── */

  /** 1 · 같은 강사가 같은 시간에 두 수업 — 차단 */
  function checkInstructor(cand, occ) {
    const hit = occ.filter(o =>
      o.__kind === 'class' &&
      o.instructorId === cand.instructorId &&
      overlaps(cand.startMin, cand.endMin, o.startMin, o.endMin));
    return hit.map(o => V(CODE.INSTRUCTOR,
      `이미 ${span(o)} 에 「${o.__label}」 수업이 있습니다`,
      { classId: o.id, startMin: o.startMin, endMin: o.endMin }));
  }

  /** 2 · 같은 강의실 — 차단. 코디네이터 예약도 함께 본다 */
  function checkClassroom(cand, occ) {
    if (cand.mode !== 'offline' || !cand.classroomId) return [];
    const hit = occ.filter(o =>
      o.classroomId === cand.classroomId &&
      overlaps(cand.startMin, cand.endMin, o.startMin, o.endMin));
    return hit.map(o => V(CODE.CLASSROOM,
      o.__kind === 'coord'
        ? `이 강의실은 ${span(o)} 에 코디네이터가 쓰고 있습니다`
        : `이 강의실은 ${span(o)} 에 「${o.__label}」 이 쓰고 있습니다`,
      { classroomId: cand.classroomId, conflictId: o.id, source: o.__kind }));
  }

  /** 3 · 같은 줌 계정 — 차단. 계정 하나 = 회의 하나 */
  function checkZoom(cand, occ) {
    if (cand.mode !== 'online' || !cand.zoomAccountId) return [];
    const hit = occ.filter(o =>
      o.zoomAccountId === cand.zoomAccountId &&
      overlaps(cand.startMin, cand.endMin, o.startMin, o.endMin));
    return hit.map(o => V(CODE.ZOOM,
      o.__kind === 'coord'
        ? `이 줌 계정은 ${span(o)} 에 코디네이터가 쓰고 있습니다`
        : `이 줌 계정은 ${span(o)} 에 「${o.__label}」 이 쓰고 있습니다`,
      { zoomAccountId: cand.zoomAccountId, conflictId: o.id, source: o.__kind }));
  }

  /** 4 · 등록된 불가 시간과 겹침 — 차단 + 사유 표시 */
  function checkUnavailable(cand, ctx) {
    const dow = ctx.dowOf ? ctx.dowOf(cand.date) : new Date(cand.date + 'T00:00:00').getDay();
    const cycle = ctx.cycleOf ? ctx.cycleOf(cand.date) : null;
    const hit = (ctx.blocks || []).filter(b =>
      b.instructorId === cand.instructorId &&
      b.dow === dow &&
      (cycle === null || b.cycle === cycle) &&
      overlaps(cand.startMin, cand.endMin, b.startMin, b.endMin));
    return hit.map(b => V(CODE.UNAVAILABLE,
      `강사가 등록한 불가 시간입니다 — ${b.reason || '사유 없음'}`,
      { blockId: b.id, reason: b.reason, startMin: b.startMin, endMin: b.endMin }));
  }

  /** 5 · 같은 학생이 같은 시간에 다른 수업 — 경고 후 확인 (유일하게 통과 가능) */
  function checkStudent(cand, occ) {
    const mine = cand.studentIds || (cand.studentId ? [cand.studentId] : []);
    if (!mine.length) return [];
    const out = [];
    occ.forEach(o => {
      if (!overlaps(cand.startMin, cand.endMin, o.startMin, o.endMin)) return;
      const theirs = o.studentIds || (o.studentId ? [o.studentId] : []);
      const shared = mine.filter(id => theirs.includes(id));
      if (!shared.length) return;
      out.push(V(CODE.STUDENT,
        o.__kind === 'coord'
          ? `이 학생은 ${span(o)} 에 코디네이터 일정이 있습니다`
          : `이 학생은 ${span(o)} 에 「${o.__label}」 수업이 있습니다`,
        { studentIds: shared, conflictId: o.id, source: o.__kind }));
    });
    return out;
  }

  /* ── 본체 ───────────────────────────────────────────────────────────── */

  /**
   * @param {object} cand  { id?, instructorId, studentIds[], date, startMin, endMin,
   *                         mode:'offline'|'online', classroomId?, zoomAccountId? }
   * @param {object} ctx   { classes[], coordSessions[], blocks[], dowOf?, cycleOf? }
   * @returns {{ok:boolean, blocking:Array, warnings:Array}}
   */
  function guardResource(cand, ctx) {
    ctx = ctx || {};

    if (!ctx.coordSessions) {
      // 조용히 틀린 답을 내는 대신 눈에 띄게 만든다 (불변식 I-10)
      console.warn('[guard] ctx.coordSessions 가 없습니다 — 코디네이터 예약과의 충돌을 검사하지 못합니다.');
    }
    if (cand.startMin >= cand.endMin) {
      return { ok: false, blocking: [V('INVALID_RANGE', '종료 시각이 시작 시각보다 빨라요', {})], warnings: [] };
    }

    const occ = asOccupancy(ctx, cand);
    const blocking = [
      ...checkInstructor(cand, occ),
      ...checkClassroom(cand, occ),
      ...checkZoom(cand, occ),
      ...checkUnavailable(cand, ctx),
    ];
    const warnings = checkStudent(cand, occ);

    return { ok: blocking.length === 0, blocking, warnings };
  }

  /** 드래그 중 실시간 표시용 — 첫 위반 한 줄만 */
  function guardHint(cand, ctx) {
    const r = guardResource(cand, ctx);
    if (r.blocking.length) return { tone: 'block', text: r.blocking[0].message };
    if (r.warnings.length) return { tone: 'warn',  text: r.warnings[0].message };
    return { tone: 'ok', text: '' };
  }

  /** 불가 시간을 등록할 때 — 이미 확정된 수업과 겹치는지 (반대 방향 검사) */
  function guardBlockRegistration(block, ctx) {
    const hit = (ctx.classes || []).filter(c =>
      !c.canceled &&
      c.instructorId === block.instructorId &&
      (ctx.dowOf ? ctx.dowOf(c.date) : new Date(c.date + 'T00:00:00').getDay()) === block.dow &&
      overlaps(block.startMin, block.endMin, c.startMin, c.endMin));
    return {
      ok: hit.length === 0,
      blocking: hit.map(c => V(CODE.UNAVAILABLE,
        `${c.date} ${span(c)} 에 이미 확정된 수업이 있습니다 — 관리자에게 변경을 요청하세요`,
        { classId: c.id, date: c.date })),
      warnings: [],
    };
  }

  return { guardResource, guardHint, guardBlockRegistration, overlaps, CODE };
})();

if (typeof module !== 'undefined') module.exports = GUARD;
