/* ══════════════════════════════════════════════════════════════
   도메인 규칙 — 화면은 이 파일을 읽기만 하고 다시 계산하지 않는다.
   정본: docs/V26-SPEC.md  (v26 · 2026-08-25)

   2026-08-27 대표 결정 (docs/decisions/DECISIONS-2026-08-27.md)
     · 정산 조건    승인 → **작성했는가 하나** (D-R7)              ← countsForSettlement()
     · 지각 차감    일수 구간 → **수업 종료 후 시간** (D-R32)      ← LATE_REPORT_TIERS
                    1시간↑ 5,000원 · 4시간↑ 10,000원 · 그 위로 안 늘어난다
     · 출결        보류 → **존치. 매니저 이상만 CRUD** (D-R35)     ← A27_ENABLED = true

   v20 → v26 로 바뀐 것
     · 정산에 들어가는 조건  출결 확정 → 리포트 승인 → **리포트 작성**  ← countsForSettlement()
     · 차감 시계             시간 단위 누진 → 수업일+10일 → **수업 종료 후 시간**  ← tierFor()
     · 원천징수              3.3% 일괄 → **소득세 3% + 지방소득세 0.3% 분리**  ← withholding()
     · 시급                  고정 → **이력(effective_from). 변경은 이후 수업부터**  ← rateAt()
     · 캘린더 색             진행 상태 → **리포트 상태**  ← blockState()
     · 자원 충돌             흩어짐 → **guard.js 한 함수**  ← GUARD.guardResource()
   ══════════════════════════════════════════════════════════════ */
'use strict';

/* ── 회차 파생 ── */
const endMin  = s => toMin(s.start) + s.dur;
const endTime = s => fromMin(endMin(s));
const isCanceled = s => !!s.canceled;
const isPast = s => s.date < TODAY || (s.date === TODAY && endMin(s) <= NOW_MIN);
const isNow  = s => !isCanceled(s) && s.date === TODAY && toMin(s.start) <= NOW_MIN && NOW_MIN < endMin(s);
const dDay   = s => diffDays(TODAY, s.date);

/* 수업 유형 — 네모(일반·Kinder) / 마름모(진단·모의) (v20 s46) */
const kindOf = s => KIND[s.kind] || KIND.regular;
const isDiamond = s => kindOf(s).shape === 'diamond';
const reportForm = s => kindOf(s).form;              // regular | dev | assess

/* ── 시급 체계 (v20 s38) — 기본 시급 하나로 전부 결정된다 ──
   Kinder  = 기본 + 10,000원 / 시간
   그룹    = 학생당 + 5,000원 / 시간
   진단·모의 = 건당 15,000원 (시수에는 포함, 시간 비례 아님)                */
function sessionPay(s) {
  const k = kindOf(s).key, hours = s.dur / 60;
  if (k === 'assess' || k === 'trial')
    return { amount: RATE_RULE.assessFlat, hours, hourly: null, basis: '건당 15,000원 · 시수 집계엔 포함' };
  let hourly = rateAt(s.date);                       // 수업일 기준 (D8)
  if (k === 'kinder') hourly += RATE_RULE.kinderBonus;
  if (s.groupSize > 1) hourly += RATE_RULE.groupPerStudent * (s.groupSize - 1);
  return { amount: Math.round(hours * hourly), hours, hourly,
    basis: `${won(hourly)} × ${hours}시간${k === 'kinder' ? ' (Kinder +10,000)' : ''}${s.groupSize > 1 ? ` (그룹 ${s.groupSize}명)` : ''}` };
}
/* ── 시급 이력 (V26 §4.1.1 · D8 확정) ──────────────────────────────
   시급 변경은 변경 즉시, **그 이후 수업부터** 적용한다. 소급하지 않는다.
   기준은 수업일이지 정산월이 아니다 — 월중에 바뀌면 그 달 안에서 두 단가가 섞인다. */
const RATE_HISTORY = (typeof ME !== 'undefined' && ME.rateHistory)
  ? ME.rateHistory
  : [{ from: '2000-01-01', rate: (typeof ME !== 'undefined' ? ME.rate : 45000) }];
function rateAt(date) {
  let hit = RATE_HISTORY[0];
  for (const r of RATE_HISTORY) if (r.from <= date) hit = r;
  return hit.rate;
}

/* ── 원천징수 (V26 §4.3 · D-15 확정) ───────────────────────────────
   3.3% 를 한 번에 곱하지 않는다. 신고가 소득세와 지방소득세 두 항목으로
   나뉘므로 계산도 나뉘고, 각각 원 단위로 절사한다.                        */
function withholding(base) {
  const income = Math.floor(base * 0.03 / 10) * 10;
  const local  = Math.floor(income * 0.10 / 10) * 10;
  return { income, local, total: income + local };
}

/** 희망 시급을 넣었을 때 나머지 단가가 얼마가 되는지 즉시 환산 (v20 s39) */
const rateTable = base => ({
  base, kinder: base + RATE_RULE.kinderBonus,
  group2: base + RATE_RULE.groupPerStudent, group3: base + RATE_RULE.groupPerStudent * 2,
  assess: RATE_RULE.assessFlat,
});

/* 상자 색 규칙 — 캘린더·아젠다·리스트가 모두 이 한 함수를 쓴다 */
/* 색 채널 = **리포트 상태**. 모양(종류)·테두리(대면/비대면)와 섞지 않는다. (V26 §2.3)
   한 채널에 두 뜻을 실으면 읽을 수 없게 된다.                                      */
function blockState(s) {
  if (isCanceled(s)) return 'cancel';
  if (s.report === 'rejected') return 'rej';
  if (s.report === 'approved') return 'done';
  if (s.report === 'submitted') return 'pend';
  if (isPast(s)) return 'miss';
  return 'sched';
}
const STATE_LABEL = { miss: '리포트 미작성', sched: '수업 예정', done: '리포트 작성 완료',
                      pend: '승인 대기', rej: '반려됨', cancel: '취소된 수업' };
const STATE_CHIP  = { miss: 'red', sched: 'blue', done: 'green', pend: 'amber', rej: 'red', cancel: 'gray' };
const STATE_RAIL  = { miss: 'var(--red)', sched: 'var(--blue)', done: 'var(--green)',
                      pend: 'var(--amber)', rej: 'var(--kind-kinder)', cancel: '#cbd5e1' };

/* ── 불변식 I-2 · 정산에 들어가는 조건은 이것 하나다 ──────────────────
   2026-08-27 대표 결정 1번 (D-R7):
     "강사료는 리포트 작성 후 바로 지급 (반려, 최초 승인, 재승인 급여 차감 없음)"

   → 조건은 **「리포트를 썼는가」 하나**다. 승인 여부를 보지 않는다.
     반려되어 다시 쓰거나 승인이 늦어져도 급여가 깎이지 않는다.
     깎이는 것은 **지각 제출뿐**이다 (LATE_REPORT_TIERS).

   화면 코드에서 s.report 를 직접 비교하지 않는다. 이 조건은 이미 두 번 바뀌었고
   (출결 확정 → 리포트 승인 → 리포트 작성), 다음에 또 바뀔 때 고칠 곳이 한 줄이어야 한다.
   (ARCHITECTURE.md R-4) */
const REPORT_WRITTEN = ['submitted', 'approved', 'rejected'];   // 썼다 = 제출했다
const hasReport = s => REPORT_WRITTEN.includes(s.report);
const countsForSettlement = s => !isCanceled(s) && hasReport(s);

/* ── 10일 기한 (V26 §3.3) ─────────────────────────────────────────
   차단이 아니라 **독촉**이다. 늦어도 쓸 수 있고, 쓰면 정산에 들어간다 (D-R7).
   ⚠️ 2026-08-27 결정 이후 이 기한은 **정산 제외 사유가 아니다.**
      깎이는 것은 수업 종료 후 시간으로만 정해진다 (LATE_REPORT_TIERS · D-R32).
      이 값은 「아직 안 쓴 회차」를 독촉 목록에 올리는 기준으로만 쓴다.       */
const REPORT_DEADLINE_DAYS = 10;
const deadlineOf = s => addDays(s.date, REPORT_DEADLINE_DAYS);
const daysLeft   = s => diffDays(TODAY, deadlineOf(s));
const isOverdue  = s => !isCanceled(s) && isPast(s) && daysLeft(s) < 0;

const missingReports  = () => SESS.filter(s => !isCanceled(s) && isPast(s) && (s.report === 'none' || s.report === 'draft'));
const pendingReports  = () => SESS.filter(s => s.report === 'submitted');

/* ── 리포트 지각 제출 차감 (2026-08-27 대표 결정 5번 · D-R32) ────────
   원문: "리포트 지각 제출시 1시간 이상은 5,000원 차감 → 4시간 이상 10,000원 차감
          (자동 회계 정산 및 급여 시수에 반영)"

   ⚠️ 기준이 **날짜에서 시각으로** 바뀌었다.
      v26: 수업일 + N일   →   확정: **수업 종료 시각 + N분**
   두 구간뿐이고, 4시간을 넘어도 10,000원에서 더 늘지 않는다.
   구간을 바꿀 일이 생기면 이 배열 하나만 고친다. (ARCHITECTURE.md R-4)          */
const LATE_REPORT_TIERS = [
  { fromMinutes: 240, amount: 10000, short: '4시간 이상', say: '− 10,000원', tone: 'bad'  },
  { fromMinutes:  60, amount:  5000, short: '1시간 이상', say: '−  5,000원', tone: 'warn' },
  { fromMinutes:   0, amount:     0, short: '1시간 이내', say: '차감 없음',  tone: 'ok'   },
];
/* 표시용은 읽기 쉬운 순서(작은 것부터)로 뒤집어 둔다 — 판정은 위 배열이 한다 */
const PENALTY_RULE = [...LATE_REPORT_TIERS].reverse().map(t => ({
  when: t.short, short: t.short, amount: t.amount, tone: t.tone, say: t.say,
}));

/** 수업이 끝나고 몇 분 지났을 때 얼마인가 — 위에서부터 처음 걸리는 것 */
function tierFor(minutesAfter) {
  for (const t of LATE_REPORT_TIERS) if (minutesAfter >= t.fromMinutes) return t;
  return LATE_REPORT_TIERS[LATE_REPORT_TIERS.length - 1];
}

/** 수업 종료 → 그 시각까지 몇 분인가. 날짜가 다르면 하루 1440분으로 더한다 */
function minutesSinceEnd(s, atDate, atMin) {
  return diffDays(s.date, atDate) * 1440 + (atMin - endMin(s));
}

/** 제출이 끝난 회차의 확정 차감액 — 기준은 **최초 제출**이다.
    반려 후 재제출은 다시 재지 않는다 (D-R7: 재승인으로 깎이지 않는다). */
function latePenalty(s) {
  if (isCanceled(s) || !s.submittedAt) return 0;
  const at = String(s.submittedAt);
  const d  = at.slice(0, 10);
  const hm = at.length >= 16 ? toMin(at.slice(11, 16)) : 0;   // "YYYY-MM-DD HH:mm"
  const after = minutesSinceEnd(s, d, hm);
  return after <= 0 ? 0 : tierFor(after).amount;
}

/** 지금 제출하면 얼마가 깎이는지 — 리포트 화면이 실시간으로 읽는다 */
function penaltyNow(s) {
  const after = minutesSinceEnd(s, TODAY, NOW_MIN);
  const t = after <= 0 ? LATE_REPORT_TIERS[LATE_REPORT_TIERS.length - 1] : tierFor(after);
  const left = daysLeft(s);

  /* 아직 수업이 끝나지 않았다 */
  if (after <= 0) {
    return { amount: 0, over: false, left, after,
      head: '수업이 끝나면 바로 쓸 수 있습니다 · 1시간 안에 내면 차감이 없습니다',
      next: 5000, nextIn: 60, nextSay: '수업 종료 후 1시간이 지나면' };
  }
  /* 다음 구간까지 몇 분 남았나 — fromMinutes 가 지금보다 큰 것 중 가장 가까운 것 */
  const upper = [...LATE_REPORT_TIERS].reverse().find(x => x.fromMinutes > after);
  return {
    amount: t.amount, over: false, left, after,
    head: t.amount ? `지금 제출하면 ${won(t.amount)}이 깎입니다 · 수업이 끝난 지 ${sinceText(after)}`
                   : `지금 제출하면 차감이 없습니다 · 수업이 끝난 지 ${sinceText(after)}`,
    next:   upper ? upper.amount : null,
    nextIn: upper ? upper.fromMinutes - after : null,
    nextSay: upper ? `${Math.ceil((upper.fromMinutes - after) / 60 * 10) / 10}시간 더 지나면` : null,
  };
}

/** "2시간 15분" 처럼 읽어 준다 */
function sinceText(min) {
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}

/* v20 연강 개념은 v26 에 없다. 남아 있는 호출부를 위해 최소 형태만 남긴다. */
function chainOf(s) { return { size: 1, index: 1, blockEnd: endMin(s) }; }
function penaltyDeadlineBase(s) { return { chain: chainOf(s), baseMin: endMin(s) }; }

/* ── A19 · 표기 권한 ──────────────────────────────────────
   강사는 가능(대면/비대면)·불가만 남긴다. 확정된 회차와 겹치는 불가 표기는 거절한다. */
const UNAV_OPEN = addDays(TODAY, 7);                       // 최소 1주 전
const fixedIn = (date, a, b) =>
  SESS.filter(s => s.date === date && !isCanceled(s) && a < endMin(s) && toMin(s.start) < b);
/** 불가 표기를 막아야 하는 이유를 돌려준다. 통과면 빈 배열. */
function markBlockers(mode, date, start, end) {
  const out = [];
  if (toMin(end) <= toMin(start)) out.push('끝나는 시간이 시작보다 빠릅니다.');
  if (date < UNAV_OPEN) out.push(`${mdw(UNAV_OPEN)}부터 등록할 수 있습니다 — 최소 1주 전까지입니다.`);
  if (mode === '불가') {
    for (const s of fixedIn(date, toMin(start), toMin(end)))
      out.push(`확정된 수업이 있습니다 — ${s.start}–${endTime(s)} ${s.subject} · ${stu(s.studentId).name} 학생`);
  }
  return out;
}

/* ── 스케줄 변경 — 10일 전까지, 네 가지 충돌 ── */
const EARLIEST_CHANGE = addDays(TODAY, 10);
const canRequestChange = s => !isCanceled(s) && dDay(s) >= 10;
function changeConflicts(s, c) {
  const out = [], ns = toMin(c.start), ne = toMin(c.end);
  if (ne <= ns) out.push('끝나는 시간이 시작보다 빠릅니다.');
  if (diffDays(TODAY, c.date) < 10)
    out.push(`10일 이내로는 옮길 수 없습니다 — <b>${mdw(EARLIEST_CHANGE)} 이후</b>로 골라 주세요.`);
  for (const o of SESS) {
    if (o.id === s.id || isCanceled(o) || o.date !== c.date) continue;
    if (!(ne > toMin(o.start) && endMin(o) > ns)) continue;
    out.push(`내 다른 수업과 겹칩니다 — <b>${o.start}–${endTime(o)} ${o.subject} · ${stu(o.studentId).name} 학생</b>`);
  }
  if (s.studentId === 1 && c.date === '2026-09-01' && ns < 21 * 60 && ne > 19 * 60)
    out.push(`${stu(s.studentId).name} 학생이 다른 수업 중입니다 — <b>19:00–21:00 AP Calculus AB · 정하윤 강사</b>`);
  for (const u of UNAV) {
    if (u.date !== c.date) continue;
    if (ne > toMin(u.start) && toMin(u.end) > ns) out.push(`내가 <b>불가</b>로 표기한 시간입니다 — ${u.start}–${u.end}`);
  }
  return out;
}

/* ── 리포트 검증 (V26 §3 · 검증 1·2·10·11) ────────────────────────
   최소 글자 수는 REPORT_MINIMA 한 곳에만 산다. 화면이 숫자를 다시 적지 않는다.
   제출(submit)에서만 강제하고, 임시 저장(draft)은 몇 자든 통과한다.              */
const reportFormOf = s => (KIND[s.kind] || KIND.regular).form;
const reportMeta   = s => REPORT_FORM[reportFormOf(s)] || REPORT_FORM.normal;

function validateReport(form, draft) {
  const errs = [];
  const need = (field, min, code) => {
    const v = String((draft && draft[field]) || '').trim();
    if (v.length < min) errs.push({ field, code, min, actual: v.length });
  };
  need('did',        REPORT_MINIMA.did,        'REPORT_TOO_SHORT');
  need('leftUndone', REPORT_MINIMA.leftUndone, 'REPORT_LEFT_UNDONE_REQUIRED');
  need('nextPlan',   REPORT_MINIMA.nextPlan,   'REPORT_TOO_SHORT');

  if (form === 'group') {
    if (String(draft.did || '').trim().length < REPORT_MINIMA_EXTRA.groupCommon)
      errs.push({ field: 'did', code: 'GROUP_COMMON_TOO_SHORT', min: REPORT_MINIMA_EXTRA.groupCommon,
                  actual: String(draft.did || '').trim().length });
    (draft.perStudent || []).forEach(p => {
      const n = String(p.comment || '').trim().length;
      if (n < REPORT_MINIMA_EXTRA.groupPerStudent)
        errs.push({ field: 'perStudent:' + p.studentId, code: 'GROUP_PER_STUDENT_TOO_SHORT',
                    min: REPORT_MINIMA_EXTRA.groupPerStudent, actual: n });
    });
  }
  if (form === 'kinder') {
    (draft.sections || []).forEach(sec => {
      if (!sec.level) errs.push({ field: 'level:' + sec.area, code: 'REPORT_TOO_SHORT', min: 1, actual: 0 });
      const n = String(sec.comment || '').trim().length;
      if (n < REPORT_MINIMA_EXTRA.kinderSection)
        errs.push({ field: 'sec:' + sec.area, code: 'REPORT_TOO_SHORT',
                    min: REPORT_MINIMA_EXTRA.kinderSection, actual: n });
    });
  }
  return errs;
}
const canSubmitReport = (form, draft) => validateReport(form, draft).length === 0;

/* 글자 수 카운터 한 줄 — 화면은 이것만 그린다 */
const counterOf = (text, min) => {
  const n = String(text || '').trim().length;
  return { n, min, ok: n >= min, label: `${n} / ${min}자` };
};

/* ── 건의 사항 (V26 §2.8 · D-11 · D-12 확정) ────────────────────── */
const SUGGESTION_CATS = [
  { key: 'lesson',   label: '수업 관련',   sub: '교재 · 진행 · 학생' },
  { key: 'pay',      label: '시급 관련',   sub: '정산 · 보강' },
  { key: 'schedule', label: '스케줄 관련', sub: '시간 · 요일 · 이동' },
  { key: 'etc',      label: '기타',        sub: '그 밖의 이야기' },
];
const SUGGESTION_STATES = { open: '접수됨', reviewing: '확인 중', done: '답변 완료' };
const SUGGESTION_QUOTA = 3;
const suggestionQuotaLeft = (items, ym) =>
  SUGGESTION_QUOTA - (items || []).filter(x => String(x.at || '').startsWith(ym)).length;

/* ── 리포트 내용 검증 — 60자 + 세 가지 + 교재 정식 명칭 (v20 잔재 · 표시용) ── */
const ABBR = [/\bSAT\s?RW\b/i, /\bAP\s?World\b(?!\s?History)/i, /\bMAP\s?G8\b/i, /\bVocab\b(?!ulary)/i, /\bELA\s?Int\b/i];
const hasAbbr = t => ABBR.some(r => r.test(t || ''));
function contentChecks(t) {
  t = t || '';
  return { len: t.trim().length,
    a: /(교재|Week|Unit|Set|Chapter|Quiz|지문|Drill|Workbook)/i.test(t),
    b: /(정답률|집중|반응|맞|틀|이해|막히|잘 따라|헷갈)/.test(t),
    c: /(다음|남았|복습|숙제|다시|이어서|계속)/.test(t) };
}

/* ── A21 · 조회 범위 ──────────────────────────────────────
   강사는 직전 급여 1건 + 그 급여의 회차, 그리고 진행 중인 당월까지만 본다.
   그 이전은 삭제하지 않고 보관하되 강사 응답에서 제외한다.                    */
/* V26 §4.4 — 정산은 본인만 본다 (I-6). 기간 제한은 v20 A21 의 잔재라 유지만 한다. */
const canSeePeriod = p => p === LAST_PAYOUT.period || p === OPEN_PERIOD;

/* ── 정산 (V26 §4) ────────────────────────────────────────────────
   불변식 I-2 · **쓴 리포트**가 들어간다 (D-R7). 미작성·draft 만 제외되고,
                대기·반려도 이미 쓴 것이므로 정산에 들어간다.
   불변식 I-8 · 단가는 수업일 기준 시급 스냅샷. 이력이 정정돼도 지난 정산은 안 흔들린다.
   D-15      · 원천징수는 소득세·지방소득세를 따로 계산해 각각 절사한다.              */
function settle(period) {
  const list = SESS.filter(s => s.date.startsWith(period))
    .sort((a, b) => b.date.localeCompare(a.date) || b.start.localeCompare(a.start));

  const past = list.filter(s => !isCanceled(s) && isPast(s));
  const done = past.filter(countsForSettlement);                  // ← 유일한 판정
  const miss = past.filter(s => !countsForSettlement(s));         // 미작성 · draft 만
  const wait = past.filter(s => s.report === 'submitted');
  const rej  = past.filter(s => s.report === 'rejected');
  const over = past.filter(s => !countsForSettlement(s) && isOverdue(s));   // 아직 안 쓴 채 기한이 지난 것

  const doneH = done.reduce((a, s) => a + s.dur, 0) / 60;
  const missH = miss.reduce((a, s) => a + s.dur, 0) / 60;

  const gross = done.reduce((a, s) => a + sessionPay(s).amount, 0);
  const byKind = {};
  for (const s of done) {
    const k = kindOf(s).label;
    byKind[k] = byKind[k] || { cnt: 0, hours: 0, amount: 0, hourly: null };
    byKind[k].cnt++; byKind[k].hours += s.dur / 60;
    byKind[k].amount += sessionPay(s).amount;
    byKind[k].hourly = byKind[k].hourly || sessionPay(s).hourly;
  }

  const pen    = done.reduce((a, s) => a + latePenalty(s), 0);
  const penCnt = done.filter(s => latePenalty(s) > 0).length;
  const lateMin = done.reduce((a, s) => a + (s.lateMin || 0), 0);   // 수업 지각 (late_record)
  const lateCut = lateMin ? Math.round(lateMin / 60 * rateAt(period + '-01')) : 0;

  const afterCut = gross - pen - lateCut;
  const tax = withholding(afterCut);

  const missAmount = miss.reduce((a, s) => a + sessionPay(s).amount, 0);
  const future = list.filter(s => !isCanceled(s) && !isPast(s));
  const futureAmount = future.reduce((a, s) => a + sessionPay(s).amount, 0);
  const futureH = future.reduce((a, s) => a + s.dur, 0) / 60;

  return {
    period, list, past, done, miss, wait, rej, over,
    doneH, missH, missAmount,
    gross, byKind,
    pen, penCnt, lateMin, lateCut, afterCut,
    tax: tax.total, incomeTax: tax.income, localTax: tax.local,
    net: afterCut - tax.total,
    future, futureH, futureAmount,
    /* 하위 호환 — 예전 화면이 읽던 이름 */
    held: done, attPend: [], attPendH: 0,
  };
}


/* ══ AI 프롬프트 (v20 s24·s29) ══════════════════════════════
   양식(일반·발달·진단)과 언어(ko·en)에 따라 라벨과 작성 규칙이 통째로 바뀐다.
   강사가 유의 사항을 안 읽고 복사만 해도 결과물이 규칙을 지키도록, 규칙을 프롬프트에 심는다. */
const PROMPT_RULES = {
  ko: ['마크다운 기호(**, ##, - 등)를 절대 사용하지 마세요.',
    '"부족합니다" 같은 직접적인 지적 대신 완곡하고 정중한 어조로 써 주세요.',
    '한영 병기를 하지 마세요. 수압(Water Pressure) ✕ → 수압 ○',
    '교재는 정식 명칭 전체로 적어 주세요.',
    '아이의 성격 · 능력 · 등급 · 합격 가능성 · 다른 학생과의 비교는 쓰지 마세요.',
    '확정형 대신 관찰형으로 쓰세요. "수학이 부족합니다" ✕ → "계산 과정에서 연습이 더 필요해 보입니다" ○',
    '점수와 관찰 내용은 빠뜨리지 말고 모두 넣어 주세요.',
    '350~450자, 세 문단으로 작성해 주세요.'],
  en: ['Never use markdown symbols (**, ##, -).',
    'Avoid blunt criticism. Use a warm, respectful tone.',
    'Do not mix Korean and English in parentheses.',
    'Write textbook names in full.',
    'Do not label the child’s personality, ability, grade, or chances of admission, and never compare with other students.',
    'Describe what you observed rather than stating verdicts.',
    'Include every score and observation you were given.',
    'Write three paragraphs, 350–450 characters.'],
};
function aiPrompt(s, f) {
  const st = stu(s.studentId), lang = (f && f.lang) || 'ko';
  const form = reportForm(s);
  const en = lang === 'en';
  const head = en
    ? `You are the instructor at a Korean academy preparing students for international schools. Write a class report for the parents based on the record below.

[Class]
Student: ${st.name} (${st.grade})
Date: ${md(s.date)}, 2026 (${WD[wdOf(s.date)]})
Time: ${s.start} - ${endTime(s)}
Subject: ${s.subject}
Type: ${kindOf(s).label}`
    : `당신은 국제학교 준비 학원의 담당 강사입니다. 아래 수업 기록을 바탕으로 학부모에게 보낼 수업 리포트를 작성해 주세요.

[수업 정보]
학생: ${st.name} (${st.grade})
날짜: 2026년 ${md(s.date)} (${WD[wdOf(s.date)]})
시간: ${s.start} - ${endTime(s)}
과목: ${s.subject}
유형: ${kindOf(s).label}`;

  let body = '';
  if (form === 'regular') {
    body = en
      ? `\n\n[What we did]\n${f.content || '(please fill in)'}\n\n[Pages covered]\n${f.progress || '(please fill in)'}\n\n[Homework]\n${f.homework || '(please fill in)'}`
      : `\n\n[오늘 수업 내용]\n${f.content || '(입력해 주세요)'}\n\n[진도 페이지]\n${f.progress || '(입력해 주세요)'}\n\n[숙제 페이지]\n${f.homework || '(입력해 주세요)'}`;
  } else if (form === 'dev') {
    const d = f.dev || {};
    const lines = DEV_AREAS.map(a => {
      const v = d[a.key] || {};
      const lv = v.level ? a.levels[v.level - 1][en ? 1 : 0] : (en ? '(not selected)' : '(선택 안 함)');
      return `- ${en ? a.en : a.ko}: ${lv} / ${v.obs || (en ? '(observation needed)' : '(관찰 내용을 적어 주세요)')}`;
    }).join('\n');
    body = `\n\n[${en ? 'Developmental areas' : '발달 4영역'}]\n${lines}\n\n[${en ? 'Overall' : '종합 소견'}]\n${d.summary || (en ? '(please fill in)' : '(입력해 주세요)')}`;
  } else {
    const a = f.assess || {};
    const pick = (list, sel) => (sel || []).map(k => {
      const row = list.find(r => r[0] === k); return row ? row[en ? 2 : 1] : k;
    }).join(', ') || (en ? '(none selected)' : '(선택 안 함)');
    body = `\n\n[${en ? 'Math' : '수학'}] ${a.mathScore ?? '-'}/100`
      + `\n- ${en ? 'Areas missed' : '틀린 영역'}: ${pick(ASSESS_MATH, a.mathArea)}`
      + `\n- ${en ? 'Why' : '틀린 이유'}: ${pick(ASSESS_WHY, a.mathWhy)}`
      + `\n\n[${en ? 'English' : '영어'}] ${a.engScore ?? '-'}/100`
      + `\n- ${en ? 'Areas missed' : '틀린 영역'}: ${pick(ASSESS_ENG, a.engArea)}`
      + `\n- ${en ? 'Why' : '틀린 이유'}: ${pick(ASSESS_WHY, a.engWhy)}`
      + `\n\n[${en ? 'Interview' : '인터뷰'}] `
      + ASSESS_INTERVIEW.map(([k, ko, e]) => `${en ? e : ko} ${a[k] ?? '-'}/100`).join(' · ');
  }
  const rules = PROMPT_RULES[lang].map(r => '- ' + r).join('\n');
  return head + body + `\n\n[${en ? 'Writing rules' : '작성 규칙'}]\n${rules}`;
}

/* ══ 시간대 변경 — 강사는 요청만, 적용은 관리자 승인 (v20 s7~9) ══ */
const tzPendingActive = () => !!ME.tzPending;
function requestTz(id, label) {
  if (id === ME.tz) return { ok: false, msg: '지금 쓰고 있는 시간대입니다' };
  ME.tzPending = { to: id, label, at: `${TODAY} ${fromMin(NOW_MIN)}` };
  return { ok: true, msg: `${label}(으)로 변경을 요청했습니다 — 관리자가 승인하면 모든 화면이 다시 계산됩니다` };
}
/** 우회 저장 차단 — 콘솔에서 직접 불러도 요청 큐에만 들어간다 (v20 s9) */
function setTz() { return { ok: false, msg: '시간대는 관리자 승인으로만 바뀝니다 — 요청만 접수됩니다' }; }

/* ══ 시급 변경 신청 — 한 달에 한 번, 사유 30자 (v20 s39) ══ */
function requestRate(to, reason) {
  if (ME.rateRequestedThisMonth) return { ok: false, msg: '이번 달에는 이미 신청하셨습니다 — 다음 달 1일에 다시 열립니다' };
  if (!(to > 0)) return { ok: false, msg: '희망 시급을 입력해 주세요' };
  if (reason.trim().length < 30) return { ok: false, msg: '신청 사유를 30자 이상 적어 주세요' };
  ME.ratePending = { to, reason: reason.trim(), at: `${TODAY} ${fromMin(NOW_MIN)}` };
  ME.rateRequestedThisMonth = true;
  return { ok: true, msg: '시급 변경을 신청했습니다 — 관리자가 사유를 보고 승인 또는 반려합니다' };
}

/* ══ 리포트 양식별 검증 ══════════════════════════════════════
   regular — 60자 + 세 가지 + 교재 Full Name
   dev     — 발달 4영역 각 3단계 선택 + 관찰 30자, 종합 소견 60자 (v20 s27)
   assess  — 문항·영역·이유가 하나라도 비면 제출 차단 (v20 s28)               */
function devChecks(dev) {
  const out = { areas: {}, ok: true };
  for (const a of DEV_AREAS) {
    const v = (dev && dev[a.key]) || {};
    const r = { level: !!v.level, obs: (v.obs || '').trim().length >= 30, len: (v.obs || '').trim().length };
    r.ok = r.level && r.obs; if (!r.ok) out.ok = false;
    out.areas[a.key] = r;
  }
  out.summary = (dev && (dev.summary || '').trim().length) || 0;
  out.summaryOk = out.summary >= 60;
  if (!out.summaryOk) out.ok = false;
  return out;
}
function assessChecks(a) {
  const v = a || {};
  const num = x => x !== '' && x != null && !isNaN(Number(x));
  const out = {
    math: num(v.mathScore), mathArea: !!(v.mathArea || []).length, mathWhy: !!(v.mathWhy || []).length,
    eng: num(v.engScore), engArea: !!(v.engArea || []).length, engWhy: !!(v.engWhy || []).length,
    interview: ASSESS_INTERVIEW.every(([k]) => num(v[k])),
  };
  out.ok = Object.values(out).every(Boolean);
  return out;
}
/** 제출을 막는 첫 번째 칸 — 자동 스크롤·포커스 대상 (v20 s22) */
function firstInvalid(s, f) {
  const form = reportForm(s);
  if (form === 'regular') {
    const c = contentChecks(f.content);
    if (c.len < 60) return { id: 'cbox', msg: "'수업 내용'을 60자 이상 적어 주세요" };
    if (!(c.a && c.b && c.c)) return { id: 'cbox', msg: '무엇을 · 어땠는지 · 남은 것 세 가지가 모두 들어가야 합니다' };
    if (hasAbbr(f.progress)) return { id: 'pbox', msg: '진도 페이지의 교재를 정식 명칭으로 적어 주세요' };
    if (!(f.progress || '').trim()) return { id: 'pbox', msg: '진도 페이지를 비워 두실 수 없습니다' };
    if (hasAbbr(f.homework)) return { id: 'hbox', msg: '숙제 페이지의 교재를 정식 명칭으로 적어 주세요' };
    if (!(f.homework || '').trim()) return { id: 'hbox', msg: '숙제 페이지를 비워 두실 수 없습니다' };
    return null;
  }
  if (form === 'dev') {
    const c = devChecks(f.dev);
    for (const a of DEV_AREAS) {
      const r = c.areas[a.key];
      if (!r.level) return { id: `dev-${a.key}`, msg: `${a.ko} 영역의 단계를 골라 주세요` };
      if (!r.obs) return { id: `dev-obs-${a.key}`, msg: `${a.ko} 관찰 내용을 30자 이상 적어 주세요 (${r.len}/30)` };
    }
    if (!c.summaryOk) return { id: 'dev-summary', msg: `종합 소견을 60자 이상 적어 주세요 (${c.summary}/60)` };
    return null;
  }
  const c = assessChecks(f.assess);
  if (!c.math) return { id: 'as-math', msg: '수학 점수를 입력해 주세요' };
  if (!c.mathArea) return { id: 'as-math-area', msg: '수학에서 틀린 영역을 하나 이상 골라 주세요' };
  if (!c.mathWhy) return { id: 'as-math-why', msg: '수학에서 틀린 이유를 하나 이상 골라 주세요' };
  if (!c.eng) return { id: 'as-eng', msg: '영어 점수를 입력해 주세요' };
  if (!c.engArea) return { id: 'as-eng-area', msg: '영어에서 틀린 영역을 하나 이상 골라 주세요' };
  if (!c.engWhy) return { id: 'as-eng-why', msg: '영어에서 틀린 이유를 하나 이상 골라 주세요' };
  if (!c.interview) return { id: 'as-interview', msg: '인터뷰 세 항목을 모두 입력해 주세요' };
  return null;
}

/* ══ 학부모용 톤 규칙 (v20 s30) — 확정형을 관찰형으로 ══ */
const TONE_RULES = [
  ['수학이 부족합니다', '계산 과정에서 연습이 더 필요해 보입니다'],
  ['집중을 못 합니다', '20분이 지나며 집중이 흔들리는 모습이었습니다'],
  ['이 점수면 어렵습니다', '지금부터 준비하면 채워 나갈 수 있는 구간입니다'],
];
const TONE_BANNED = '성격 · 능력 · 등급 · 합격 가능성 · 다른 학생과의 비교';

/* ══ A27 · 출결 축 ══════════════════════════════════════════
   첫 체크는 담당 강사가 **딱 한 번**, 그 뒤 CRUD 는 매니저 이상.
   진행 축(시계)·리포트 축과 서로를 보지 않는다 (A9).
   - s.att          {by, at, result}  강사 1차 체크. 한 번 쓰이면 다시 안 바뀐다
   - s.statusChanged{by, at}          그 뒤의 변경. 매니저 이상만
   - 매니저가 "대신" 확정하면 s.att 는 비어 있고 statusChanged 만 찬다.
     이 구분이 있어야 "강사 확인 없이 처리된 회차"를 나중에도 셀 수 있다.        */

/** 출결 현재값 — pending | completed | canceled */
function attendanceState(s) {
  if (isCanceled(s)) return 'canceled';          // 관리자 취소는 그 자체로 확정이다
  if (s.statusChanged) return s.status;          // 매니저가 마지막으로 정한 값
  if (s.att) return s.att.result;                // 강사 1차 체크값
  return 'pending';
}
const attConfirmed = s => attendanceState(s) !== 'pending';
/** 시수·페이에 잡히는 회차인가 (A10) — 리포트 축은 보지 않는다 */
const attCounts = s => attendanceState(s) === 'completed';

/** 지금 이 사용자가 출결에 무엇을 할 수 있는가 — 화면마다 다시 쓰지 않는다 (A27) */
/* 2026-08-27 대표 결정 6번 (D-R35) — "오늘 및 이전 스케줄에 대한 출결 사항은 매니저 이상만 CRUD"
   강사에게 열어 두는 것은 **당일 최초 체크 딱 한 번**뿐이다.
   지난 회차는 최초 체크조차 강사가 못 한다 — 매니저가 대신 찍는다.
   화면 코드에서 me.role 을 직접 비교하지 않는다. 판정은 여기 한 곳이다. */
function canEditAttendance(s, me = ME) {
  if (!s) return 'readonly';
  if (me.role !== '강사') return 'manage';             // 매니저 이상은 언제든 정정 (canCrudAll)
  if (isCanceled(s)) return 'readonly';                // 관리자 취소분은 손대지 않는다
  if (!isPast(s)) return 'readonly';                   // 아직 안 끝났다 — 출결이 없다
  if (s.date !== TODAY) return 'readonly';             // ← 지난 회차는 매니저만 (D-R35)
  if (s.att || s.statusChanged) return 'readonly';     // 이미 한 번 찍혔다
  return 'first';                                      // 오늘, 지금, 딱 한 번
}

/** 강사 1차 체크 — 성공하면 {ok:true}, 아니면 이유를 돌려준다 (서버가 같은 판정을 다시 한다) */
function firstCheck(s, result) {
  const can = canEditAttendance(s);
  if (can === 'readonly') {
    if (!isPast(s)) return { ok: false, msg: '수업이 끝난 뒤에 체크할 수 있습니다' };
    if (s.date !== TODAY) return { ok: false, msg: '지난 수업의 출결은 매니저가 처리합니다' };   // D-R35
    return { ok: false, msg: '이미 체크된 출결입니다 — 정정은 매니저에게 요청하세요' };
  }
  if (can === 'manage') return { ok: false, msg: '매니저 정정 경로로 처리하세요' };
  if (result !== 'completed' && result !== 'canceled') return { ok: false, msg: '알 수 없는 값입니다' };
  s.att = { by: ME.name, at: `${TODAY} ${fromMin(NOW_MIN)}`, result };
  s.status = result;
  return { ok: true, msg: result === 'completed' ? '출결을 완료로 확정했습니다' : '출결을 취소로 확정했습니다' };
}

/** 매니저 '출결 대기' 큐 (A10 · A27) — 종료 경과 ∧ 아직 아무도 안 찍음. 오래된 순 */
const pendingAttendance = () => SESS
  .filter(s => !isCanceled(s) && isPast(s) && attendanceState(s) === 'pending')
  .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));

/** 강사 화면에서 "내가 아직 안 찍은 것" — 홈 배너용 */
const myUncheckedAttendance = () => pendingAttendance().filter(s => canEditAttendance(s) === 'first');

/** 출결 잠금 사유 문구 — 왜 못 고치는지 그 자리에 적는다 */
function attendanceLockNote(s) {
  if (isCanceled(s)) return '관리자가 취소한 수업입니다';
  if (s.att) return `${s.att.by} 님이 ${s.att.at}에 ${s.att.result === 'completed' ? '완료' : '취소'}로 확정했습니다`;
  if (s.statusChanged) return `${s.statusChanged.by} 님이 ${s.statusChanged.at}에 처리했습니다 · 강사 확인 없음`;
  if (!isPast(s)) return '수업이 끝나면 체크할 수 있습니다';
  if (s.date !== TODAY) return '지난 수업의 출결은 매니저가 처리합니다';   // D-R35
  return '';
}
