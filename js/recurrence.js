/* ══════════════════════════════════════════════════════════════════════════
   recurrence.js — 반복 일정(SER) + 예외(EXC) 편집 엔진 (SSOT)
   ──────────────────────────────────────────────────────────────────────────
   대표 지시 (2026-08-26):
     "3, 4 번에 대한 대상이 반복 스케줄인 경우 이번만, 모두, 향후 일정에 대한
      컨펌을 받아야 하며 각각 액션이 달라야 함"

   규칙 출처: docs/CALENDAR.md §5A · docs/DEV-SPEC.md D-R16~D-R20

     D-1    일정(SER)이 사실이고 나머지는 파생이다.
     D-R1   occ(date) = SER 반복 규칙 + EXC. 그날 목록을 만드는 유일한 경로.
     D-R16  편집 범위는 이번만 · 향후 · 모두 3종. 단발이면 묻지 않는다.
     D-R17  「향후」는 SER 를 분할한다. 기준일 == from_date 면 「모두」로 처리.
     D-R18  「모두」는 바뀐 필드를 담은 EXC 를 초기화한다. 휴강은 남긴다.
     D-R19  붙여넣기 결과는 언제나 새 SER. EXC 는 따라오지 않는다.
     D-R20  향후·모두의 선검사 상한은 오늘+90일 또는 to_date 중 이른 쪽.

   이 파일은 **순수 함수만** 담는다. DOM 을 만지지 않고, 전역 상태를 쓰지 않는다.
   화면(scheduler.js)과 서버가 같은 판정을 쓰려면 여기 말고 다른 곳에 두면 안 된다.

   잠정값 (PLANNING-REQUIRED.md N-8 · N-9 · N-10) — 뒤집히면 이 파일만 고친다.
     N-8   EXC 초기화 범위 = 바뀐 필드만            → RESET_MODE = 'changed-fields'
     N-9   선검사 상한 = 90일                        → PRECHECK_DAYS = 90
     N-10  붙여넣기가 SER_STU 를 복제한다            → PASTE_COPIES_STUDENTS = true
   ══════════════════════════════════════════════════════════════════════════ */

const RECUR = (() => {

  /* ── 잠정 상수 ──────────────────────────────────────────────────────── */
  const RESET_MODE = 'changed-fields';   // N-8
  const PRECHECK_DAYS = 90;              // N-9
  const PASTE_COPIES_STUDENTS = true;    // N-10

  /* ── 날짜 ───────────────────────────────────────────────────────────── */
  const MS = 86400000;
  const toD = iso => new Date(iso + 'T00:00:00Z');
  const iso = d => d.toISOString().slice(0, 10);
  const addD = (s, n) => iso(new Date(toD(s).getTime() + n * MS));
  const diffD = (a, b) => Math.round((toD(a) - toD(b)) / MS);   // a - b (일)
  const dow = s => toD(s).getUTCDay();                          // 0=일
  const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];
  const DOW_KEY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

  /* ── 반복 규칙 ───────────────────────────────────────────────────────
     'ONCE'                 단발
     'WEEKLY:MO,WE,FR'      매주 월·수·금
     'WEEKLY:TU/2'          격주 화
     'DAILY'  ·  'DAILY/3'  매일 · 3일마다                                 */
  function parseRule(rrule) {
    const raw = String(rrule || 'ONCE').trim().toUpperCase();
    if (raw === 'ONCE' || raw === '') return { freq: 'ONCE', days: [], interval: 1 };
    const [head, tail] = raw.split(':');
    const body = tail == null ? '' : tail;
    const [listPart, intPart] = body.split('/');
    const headInt = head.split('/')[1];
    const interval = Math.max(1, parseInt(intPart || headInt || '1', 10) || 1);
    if (head.startsWith('DAILY')) return { freq: 'DAILY', days: [], interval };
    const days = (listPart || '')
      .split(',').map(t => DOW_KEY.indexOf(t.trim()))
      .filter(i => i >= 0).sort((a, b) => a - b);
    return { freq: 'WEEKLY', days: days.length ? days : [], interval };
  }

  function formatRule(rule) {
    if (rule.freq === 'ONCE') return 'ONCE';
    if (rule.freq === 'DAILY') return rule.interval > 1 ? `DAILY/${rule.interval}` : 'DAILY';
    const list = rule.days.map(i => DOW_KEY[i]).join(',');
    return `WEEKLY:${list}` + (rule.interval > 1 ? `/${rule.interval}` : '');
  }

  /** 사람이 읽는 한 줄 — 다이얼로그 제목에 쓴다 */
  function ruleLabel(ser) {
    const r = parseRule(ser.rrule);
    if (r.freq === 'ONCE') return '단발';
    const every = r.interval > 1 ? `${r.interval}주마다 ` : '매주 ';
    if (r.freq === 'DAILY') return r.interval > 1 ? `${r.interval}일마다` : '매일';
    return every + r.days.map(i => DOW_KO[i]).join('·');
  }

  /** 규칙만 본다 — EXC 는 보지 않는다 */
  function ruleHits(ser, date) {
    if (date < ser.fromDate) return false;
    if (ser.toDate && date > ser.toDate) return false;
    const r = parseRule(ser.rrule);
    if (r.freq === 'ONCE') return date === ser.fromDate;
    if (r.freq === 'DAILY') return diffD(date, ser.fromDate) % r.interval === 0;
    if (!r.days.includes(dow(date))) return false;
    if (r.interval === 1) return true;
    // 격주 — 시작 주의 월요일 기준으로 주 번호를 센다
    const mon = d => addD(d, dow(d) === 0 ? -6 : 1 - dow(d));
    const weeks = Math.round(diffD(mon(date), mon(ser.fromDate)) / 7);
    return weeks >= 0 && weeks % r.interval === 0;
  }

  /* ── occ(date) — 그날 목록을 만드는 유일한 경로 (D-R1) ───────────────── */
  function occ(date, state) {
    const sers = state.SER || [];
    const excs = state.EXC || [];
    const out = [];

    const excAt = (serId, onDate) =>
      excs.find(e => e.serId === serId && e.onDate === onDate) || null;

    sers.forEach(ser => {
      // 1) 규칙상 오늘 발생 → 예외를 얹는다
      if (ruleHits(ser, date)) {
        const e = excAt(ser.id, date);
        if (!e) { out.push(mk(ser, date, date, null)); }
        else if (e.canceled) { /* 휴강 — 그리지 않는다 */ }
        else if (e.newDate && e.newDate !== date) { /* 다른 날로 옮겨 감 */ }
        else out.push(mk(ser, date, date, e));
      }
      // 2) 다른 날에서 오늘로 옮겨 온 것
      excs.forEach(e => {
        if (e.serId !== ser.id || e.canceled) return;
        if (e.newDate !== date || e.onDate === date) return;
        if (!ruleHits(ser, e.onDate)) return;
        out.push(mk(ser, date, e.onDate, e));
      });
    });

    return out.sort((a, b) => a.startMin - b.startMin || a.serId - b.serId);
  }

  function mk(ser, date, onDate, e) {
    return {
      serId: ser.id,
      date,                       // 화면에 그려질 날짜
      onDate,                     // 규칙상 원래 날짜 — EXC 의 키
      startMin: (e && e.startMin != null) ? e.startMin : ser.startMin,
      endMin:   (e && e.endMin   != null) ? e.endMin   : ser.endMin,
      teacherId:(e && e.teacherId!= null) ? e.teacherId: ser.teacherId,
      roomId:   (e && e.roomId   != null) ? e.roomId   : ser.roomId,
      kind: ser.kind, sub: ser.sub, mode: ser.mode, title: ser.title,
      isException: !!e,
      movedFrom: (e && e.newDate && e.newDate !== e.onDate) ? e.onDate : null,
      canceled: false,
    };
  }

  /* ── 반복인가 — 이게 곧 "물어볼 것인가" 다 (D-R16) ────────────────────── */
  function remainingCount(ser, fromDate, cap = 400) {
    const r = parseRule(ser.rrule);
    if (r.freq === 'ONCE') return 1;
    const start = fromDate && fromDate > ser.fromDate ? fromDate : ser.fromDate;
    const end = ser.toDate || addD(start, cap);
    let n = 0;
    for (let d = start; d <= end && n < 3; d = addD(d, 1)) if (ruleHits(ser, d)) n++;
    return n;
  }

  /** true 면 Overlay/Recurrence Scope 를 띄운다. false 면 바로 저장한다. */
  function isRecurring(ser, fromDate) {
    if (!ser) return false;
    if (parseRule(ser.rrule).freq === 'ONCE') return false;
    return remainingCount(ser, fromDate) >= 2;
  }

  /** 이 시점에 고를 수 있는 범위. 단발이면 빈 배열 = 묻지 않는다. */
  function scopesFor(ser, onDate) {
    if (!isRecurring(ser, onDate)) return [];
    // 첫 회차에서 「향후」는 「모두」와 같다 (D-R17) — 버튼을 두 개 두지 않는다
    return onDate <= ser.fromDate ? ['this', 'all'] : ['this', 'future', 'all'];
  }

  const SCOPE_LABEL = { this: '이번만', future: '향후 일정', all: '모든 일정' };

  /* ── 영향받는 날짜 (D-R20) ───────────────────────────────────────────── */
  function affectedDates(ser, scope, onDate, today, cap = PRECHECK_DAYS) {
    if (scope === 'this') return [onDate];
    const start = scope === 'future' ? onDate : ser.fromDate;
    const horizonBase = (today && today > start) ? today : start;
    let end = addD(horizonBase, cap);
    if (ser.toDate && ser.toDate < end) end = ser.toDate;
    const out = [];
    for (let d = start; d <= end; d = addD(d, 1)) if (ruleHits(ser, d)) out.push(d);
    return out;
  }

  /* ── 「모두」가 초기화할 EXC (D-R18 · N-8) ───────────────────────────── */
  const PATCH_TO_EXC = { startMin: 'startMin', endMin: 'endMin', teacherId: 'teacherId', roomId: 'roomId' };

  function resetTargets(state, serId, patch, fromDate) {
    const fields = Object.keys(patch || {}).map(k => PATCH_TO_EXC[k]).filter(Boolean);
    if (!fields.length) return [];
    return (state.EXC || []).filter(e =>
      e.serId === serId &&
      !e.canceled &&                                       // 휴강은 남긴다
      (!fromDate || e.onDate >= fromDate) &&
      fields.some(f => e[f] != null));
  }

  /** 다이얼로그에 숫자로 보여줄 것 — "예외 3건이 초기화됩니다" */
  function resetPreview(state, serId, patch, scope, onDate) {
    if (scope === 'this') return { count: 0, dates: [] };
    const from = scope === 'future' ? onDate : null;
    const hit = resetTargets(state, serId, patch, from);
    return { count: hit.length, dates: hit.map(e => e.onDate).sort() };
  }

  /* ── 편집 적용 ───────────────────────────────────────────────────────
     state 를 바꾸지 않고 새 {SER, SER_STU, EXC} 를 돌려준다.
     patch 키: startMin · endMin · teacherId · roomId · date(옮긴 날짜)         */
  function applyEdit(state, { serId, onDate, scope, patch, nextId }) {
    const S = clone(state);
    const ser = S.SER.find(s => s.id === serId);
    if (!ser) throw new Error('SER not found: ' + serId);
    const eff = (scope === 'future' && onDate <= ser.fromDate) ? 'all' : scope;
    const log = [];
    const genId = mkGen(S, nextId);

    if (eff === 'this') {
      const e = upsertExc(S, serId, onDate, genId);
      if (patch.startMin != null) e.startMin = patch.startMin;
      if (patch.endMin   != null) e.endMin   = patch.endMin;
      if (patch.teacherId!= null) e.teacherId= patch.teacherId;
      if (patch.roomId   !== undefined) e.roomId = patch.roomId;
      if (patch.date && patch.date !== onDate) e.newDate = patch.date;
      e.canceled = false;
      log.push(`EXC upsert (${serId}, ${onDate})`);
      return { ...S, __log: log, __effScope: eff };
    }

    let target = ser;
    if (eff === 'future') {
      const copy = { ...ser, id: genId(), fromDate: onDate, toDate: ser.toDate };
      ser.toDate = addD(onDate, -1);
      S.SER.push(copy);
      (S.SER_STU || []).filter(r => r.serId === ser.id).slice()
        .forEach(r => S.SER_STU.push({ serId: copy.id, studentId: r.studentId }));
      S.EXC.filter(e => e.serId === ser.id && e.onDate >= onDate).forEach(e => { e.serId = copy.id; });
      log.push(`SER ${ser.id} 분할 → ${copy.id} (${onDate}~)`);
      target = copy;
    }

    applyPatchToSer(target, patch, log);
    resetTargets(S, target.id, patch, null).forEach(e => {
      Object.keys(patch).forEach(k => { const f = PATCH_TO_EXC[k]; if (f) e[f] = null; });
      log.push(`EXC (${target.id}, ${e.onDate}) 초기화`);
    });
    S.EXC = S.EXC.filter(e => e.canceled || e.newDate != null ||
      e.startMin != null || e.endMin != null || e.teacherId != null || e.roomId != null);

    return { ...S, __log: log, __effScope: eff };
  }

  function applyPatchToSer(ser, patch, log) {
    if (patch.startMin != null) { ser.startMin = patch.startMin; log.push(`start_min=${patch.startMin}`); }
    if (patch.endMin   != null) { ser.endMin   = patch.endMin;   log.push(`end_min=${patch.endMin}`); }
    if (patch.teacherId!= null) { ser.teacherId= patch.teacherId; log.push(`teacher_id=${patch.teacherId}`); }
    if (patch.roomId !== undefined) { ser.roomId = patch.roomId; log.push(`room_id=${patch.roomId}`); }
    if (patch.date && patch.__onDate && patch.date !== patch.__onDate) {
      shiftSer(ser, diffD(patch.date, patch.__onDate));
      log.push(`날짜 ${diffD(patch.date, patch.__onDate)}일 이동`);
    }
  }

  /** 요일 반복을 통째로 n일 밀어 준다 — 규칙 요일도 같이 돈다 */
  function shiftSer(ser, days) {
    if (!days) return ser;
    const r = parseRule(ser.rrule);
    if (r.freq === 'WEEKLY') {
      r.days = r.days.map(d => ((d + days) % 7 + 7) % 7).sort((a, b) => a - b);
      ser.rrule = formatRule(r);
    }
    ser.fromDate = addD(ser.fromDate, days);
    if (ser.toDate) ser.toDate = addD(ser.toDate, days);
    return ser;
  }

  /* ── 삭제 (5A.2) ────────────────────────────────────────────────────── */
  function applyDelete(state, { serId, onDate, scope, nextId, hasRefs }) {
    const S = clone(state);
    const ser = S.SER.find(s => s.id === serId);
    if (!ser) throw new Error('SER not found: ' + serId);
    const eff = (scope === 'future' && onDate <= ser.fromDate) ? 'all' : scope;
    const log = [];
    const genId = mkGen(S, nextId);

    if (eff === 'this') {
      const e = upsertExc(S, serId, onDate, genId);
      e.canceled = true;
      log.push(`EXC (${serId}, ${onDate}) canceled=true`);
    } else if (eff === 'future') {
      ser.toDate = addD(onDate, -1);
      S.EXC = S.EXC.filter(e => !(e.serId === serId && e.onDate >= onDate));
      log.push(`SER ${serId} to_date=${ser.toDate}`);
    } else if (hasRefs) {
      ser.toDate = addD(onDate, -1);
      log.push(`SER ${serId} 참조 있음 → 삭제 대신 to_date 마감`);
    } else {
      S.SER = S.SER.filter(s => s.id !== serId);
      S.SER_STU = (S.SER_STU || []).filter(r => r.serId !== serId);
      S.EXC = S.EXC.filter(e => e.serId !== serId);
      log.push(`SER ${serId} 삭제`);
    }
    return { ...S, __log: log, __effScope: eff };
  }

  /* ── 복사 · 붙여넣기 (5A.3 · D-R19) ─────────────────────────────────── */
  function copyPayload(state, occurrence) {
    const ser = (state.SER || []).find(s => s.id === occurrence.serId);
    return {
      serId: ser.id, onDate: occurrence.onDate,
      startMin: occurrence.startMin, endMin: occurrence.endMin,
      teacherId: occurrence.teacherId, roomId: occurrence.roomId,
      kind: ser.kind, sub: ser.sub, mode: ser.mode, title: ser.title,
      rrule: ser.rrule, fromDate: ser.fromDate, toDate: ser.toDate,
      students: (state.SER_STU || []).filter(r => r.serId === ser.id).map(r => r.studentId),
      offsetDays: 0, offsetMinutes: 0,
      excCount: (state.EXC || []).filter(e => e.serId === ser.id).length,
    };
  }

  /** 여러 건을 복사하면 첫 건 대비 상대 간격을 남긴다 (5.2) */
  function copyMany(state, occurrences) {
    const items = occurrences.map(o => copyPayload(state, o));
    if (!items.length) return items;
    const base = items.reduce((a, b) =>
      (a.onDate < b.onDate || (a.onDate === b.onDate && a.startMin <= b.startMin)) ? a : b);
    items.forEach(it => {
      it.offsetDays = diffD(it.onDate, base.onDate);
      it.offsetMinutes = it.startMin - base.startMin;
    });
    return items;
  }

  function applyPaste(state, { items, targetDate, targetMin, patch, scope, nextId }) {
    const S = clone(state);
    const genId = mkGen(S, nextId);
    const log = [];
    const list = Array.isArray(items) ? items : [items];

    list.forEach(it => {
      const date = addD(targetDate, it.offsetDays || 0);
      const start = (targetMin != null ? targetMin : it.startMin) + (it.offsetMinutes || 0);
      const dur = it.endMin - it.startMin;
      const eff = scope || 'this';
      const ser = {
        id: genId(), kind: it.kind, sub: it.sub, mode: it.mode, title: it.title,
        teacherId: (patch && patch.teacherId != null) ? patch.teacherId : it.teacherId,
        roomId: (patch && patch.roomId !== undefined) ? patch.roomId : it.roomId,
        startMin: start, endMin: start + dur,
        rrule: 'ONCE', fromDate: date, toDate: date,
      };
      if (eff === 'future') {
        ser.rrule = it.rrule; ser.fromDate = date;
        ser.toDate = (it.toDate && it.toDate > date) ? it.toDate : null;
        shiftRuleTo(ser, date);
      } else if (eff === 'all') {
        const delta = diffD(date, it.onDate);
        ser.rrule = it.rrule;
        ser.fromDate = addD(it.fromDate, delta);
        ser.toDate = it.toDate ? addD(it.toDate, delta) : null;
        shiftSer(ser, 0);
        const r = parseRule(ser.rrule);
        if (r.freq === 'WEEKLY') {
          r.days = r.days.map(d => ((d + delta) % 7 + 7) % 7).sort((a, b) => a - b);
          ser.rrule = formatRule(r);
        }
      }
      S.SER.push(ser);
      if (PASTE_COPIES_STUDENTS) {
        (it.students || []).forEach(sid => S.SER_STU.push({ serId: ser.id, studentId: sid }));
      }
      log.push(`SER ${ser.id} 생성 (${SCOPE_LABEL[eff]}) ${ser.fromDate} ${ser.rrule}`);
    });
    // D-R19 — EXC 는 따라오지 않는다
    return { ...S, __log: log, __effScope: scope || 'this' };
  }

  /** 붙여넣기 「향후」에서 첫 발생이 붙인 날이 되도록 요일을 맞춘다 */
  function shiftRuleTo(ser, date) {
    const r = parseRule(ser.rrule);
    if (r.freq !== 'WEEKLY' || !r.days.length) return ser;
    if (r.days.includes(dow(date))) return ser;
    const delta = dow(date) - r.days[0];
    r.days = r.days.map(d => ((d + delta) % 7 + 7) % 7).sort((a, b) => a - b);
    ser.rrule = formatRule(r);
    return ser;
  }

  /* ── 새 일정 (빈 칸 드래그) — 묻지 않는다 ───────────────────────────── */
  function applyCreate(state, { draft, nextId }) {
    const S = clone(state);
    const genId = mkGen(S, nextId);
    const ser = {
      id: genId(), kind: draft.kind || 'regular', sub: draft.sub || null,
      mode: draft.mode || 'offline', title: draft.title || '새 일정',
      teacherId: draft.teacherId ?? null, roomId: draft.roomId ?? null,
      startMin: draft.startMin, endMin: draft.endMin,
      rrule: draft.rrule || 'ONCE', fromDate: draft.date, toDate: draft.rrule && draft.rrule !== 'ONCE' ? (draft.toDate || null) : draft.date,
    };
    S.SER.push(ser);
    (draft.students || []).forEach(sid => S.SER_STU.push({ serId: ser.id, studentId: sid }));
    return { ...S, __log: [`SER ${ser.id} 신규`], __effScope: 'this' };
  }

  /* ── 충돌 선검사 (5A.4) ──────────────────────────────────────────────
     범위 안의 모든 발생일에 guardResource 를 돌린다. 클라이언트와 서버가
     같은 함수를 쓴다 — 두 벌로 나뉘는 순간 어긋난다.                       */
  function precheck(state, { serId, onDate, scope, patch, today, guard, ctxOf, cap }) {
    const ser = (state.SER || []).find(s => s.id === serId);
    if (!ser) return { ok: true, dates: [], checked: 0 };
    const dates = affectedDates(ser, scope, onDate, today, cap || PRECHECK_DAYS);
    const bad = [];
    dates.forEach(d => {
      const day = patch && patch.date && scope === 'this' ? patch.date : d;
      const cand = {
        id: ser.id, date: day,
        startMin: patch.startMin != null ? patch.startMin : ser.startMin,
        endMin:   patch.endMin   != null ? patch.endMin   : ser.endMin,
        instructorId: patch.teacherId != null ? patch.teacherId : ser.teacherId,
        roomId: patch.roomId !== undefined ? patch.roomId : ser.roomId,
        mode: ser.mode, studentIds: (state.SER_STU || []).filter(r => r.serId === ser.id).map(r => r.studentId),
      };
      const r = guard(cand, ctxOf(day));
      if (!r.ok) bad.push({ date: day, reasons: r.blocking.map(b => b.message) });
    });
    return { ok: bad.length === 0, dates: bad, checked: dates.length, horizon: cap || PRECHECK_DAYS };
  }

  /** 다이얼로그 문구 — 최대 5개 + "외 N일" (5A.4) */
  function conflictSummary(pre) {
    if (pre.ok) return '';
    const head = pre.dates.slice(0, 5).map(d => `${d.date} — ${d.reasons[0]}`);
    const rest = pre.dates.length - head.length;
    return head.join('\n') + (rest > 0 ? `\n외 ${rest}일` : '');
  }

  /* ── 유틸 ───────────────────────────────────────────────────────────── */
  function clone(state) {
    return {
      SER: (state.SER || []).map(o => ({ ...o })),
      SER_STU: (state.SER_STU || []).map(o => ({ ...o })),
      EXC: (state.EXC || []).map(o => ({ ...o })),
    };
  }
  function mkGen(S, nextId) {
    if (typeof nextId === 'function') return nextId;
    let n = Math.max(0, ...S.SER.map(s => s.id || 0), ...S.EXC.map(e => e.id || 0));
    return () => ++n;
  }
  function upsertExc(S, serId, onDate, genId) {
    let e = S.EXC.find(x => x.serId === serId && x.onDate === onDate);
    if (!e) {
      e = { id: genId(), serId, onDate, canceled: false, newDate: null,
            startMin: null, endMin: null, teacherId: null, roomId: null, reason: null };
      S.EXC.push(e);
    }
    return e;
  }

  return {
    // 규칙
    parseRule, formatRule, ruleLabel, ruleHits, occ,
    // 범위 판정
    isRecurring, scopesFor, remainingCount, affectedDates, SCOPE_LABEL,
    resetPreview,
    // 적용
    applyEdit, applyDelete, applyPaste, applyCreate,
    // 클립보드
    copyPayload, copyMany,
    // 충돌
    precheck, conflictSummary,
    // 상수 (잠정)
    RESET_MODE, PRECHECK_DAYS, PASTE_COPIES_STUDENTS,
    // 날짜 헬퍼 (scheduler.js 가 같은 것을 쓴다)
    addD, diffD, dow, DOW_KO,
  };
})();

if (typeof module !== 'undefined') module.exports = RECUR;
