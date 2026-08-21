/* ══════════════════════════════════════════════════════════════
   도메인 규칙 — 화면은 이 파일을 읽기만 하고 다시 계산하지 않는다.
   NEW.md A19(표기 권한) · A20(지각 차감) · A21(조회 범위)의 구현부.
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
  if (k === 'assess' || k === 'trial') return { amount: RATE_RULE.assessFlat, hours, basis: '건당 15,000원' };
  let hourly = ME.rate;
  if (k === 'kinder') hourly += RATE_RULE.kinderBonus;
  if (s.groupSize > 1) hourly += RATE_RULE.groupPerStudent * (s.groupSize - 1);
  return { amount: Math.round(hours * hourly), hours,
    basis: `${won(hourly)} × ${hours}시간${k === 'kinder' ? ' (Kinder +10,000)' : ''}${s.groupSize > 1 ? ` (그룹 ${s.groupSize}명)` : ''}` };
}
/** 희망 시급을 넣었을 때 나머지 단가가 얼마가 되는지 즉시 환산 (v20 s39) */
const rateTable = base => ({
  base, kinder: base + RATE_RULE.kinderBonus,
  group2: base + RATE_RULE.groupPerStudent, group3: base + RATE_RULE.groupPerStudent * 2,
  assess: RATE_RULE.assessFlat,
});

/* 상자 색 규칙 — 캘린더·아젠다·리스트가 모두 이 한 함수를 쓴다 */
function blockState(s) {
  if (isCanceled(s)) return 'cancel';
  if (s.report === 'approved') return 'done';
  if (s.report === 'submitted') return 'pend';
  if (isPast(s)) return 'miss';
  return 'sched';
}
const STATE_LABEL = { miss: '리포트 미작성', sched: '수업 예정', done: '리포트 완료',
                      pend: '승인 대기', cancel: '취소 · 시수 제외' };
const STATE_CHIP  = { miss: 'red', sched: 'blue', done: 'green', pend: 'amber', cancel: 'gray' };
const STATE_RAIL  = { miss: 'var(--red)', sched: 'var(--blue)', done: 'var(--green)',
                      pend: 'var(--amber)', cancel: '#cbd5e1' };

const missingReports  = () => SESS.filter(s => !isCanceled(s) && isPast(s) && (s.report === 'none' || s.report === 'draft'));
const pendingReports  = () => SESS.filter(s => s.report === 'submitted');

/* ── A20 · 리포트 지각 차감 ────────────────────────────────
   기준은 회차 종료 시각. 1시간 이내 0원 / 1시간 초과 −5,000 / 4시간 초과 −10,000.
   차감이 붙어도 작성 의무는 사라지지 않는다.                                   */
const PENALTY_RULE = [
  { when: '수업 종료 후 1시간 이내', short: '1시간 이내', amount: 0,     tone: 'ok',   say: '차감 없음' },
  { when: '1시간이 지나면',          short: '1시간↑',    amount: 5000,  tone: 'warn', say: '− 5,000원' },
  { when: '4시간이 지나면',          short: '4시간↑',    amount: 10000, tone: 'bad',  say: '− 10,000원' },
];
/** 연강 블록 — 쉬는 시간 없이 이어지는 수업 묶음 (v20 s40).
    연강 중에는 리포트를 쓸 수 없으므로 마지막 수업이 끝난 시각부터 센다.
    그리고 블록 안 순번만큼 1시간씩 더 준다. */
function chainOf(s) {
  const sameDay = SESS.filter(x => x.date === s.date && !isCanceled(x))
    .sort((a, b) => toMin(a.start) - toMin(b.start));
  const block = []; let cur = null;
  for (const x of sameDay) {
    if (cur && toMin(x.start) === endMin(cur)) block.push(x);
    else { if (block.some(b => b.id === s.id)) break; block.length = 0; block.push(x); }
    cur = x;
    if (block.some(b => b.id === s.id) && (sameDay.indexOf(x) === sameDay.length - 1
      || toMin(sameDay[sameDay.indexOf(x) + 1].start) !== endMin(x))) break;
  }
  const idx = block.findIndex(b => b.id === s.id);
  return idx < 0 ? { size: 1, index: 1, blockEnd: endMin(s) }
    : { size: block.length, index: idx + 1, blockEnd: endMin(block[block.length - 1]) };
}
/** 이 회차의 차감 기준 시각 — 연강이면 블록 종료 + 순번 시간 */
function penaltyDeadlineBase(s) {
  const c = chainOf(s);
  return { chain: c, baseMin: c.blockEnd + (c.size > 1 ? c.index * 60 : 0) };
}
function latePenalty(s) {
  if (isCanceled(s) || !s.submittedAt) return 0;
  const { baseMin } = penaltyDeadlineBase(s);
  const base = new Date(`${s.date}T${fromMin(Math.min(baseMin, 23 * 60 + 59))}:00+09:00`);
  const h = (new Date(s.submittedAt.replace(' ', 'T') + ':00+09:00') - base) / 3600000;
  if (h <= 1) return 0;
  if (h < 4) return 5000;
  return 10000;
}
const nowTs = () => new Date(`${TODAY}T${fromMin(NOW_MIN)}:00+09:00`);
/** 지금 제출하면 얼마가 깎이는지 — 리포트 화면이 실시간으로 읽는다 */
function penaltyNow(s) {
  const { baseMin } = penaltyDeadlineBase(s);
  const h = (nowTs() - new Date(`${s.date}T${fromMin(Math.min(baseMin, 23 * 60 + 59))}:00+09:00`)) / 3600000;
  if (h <= 0) return { amount: 0,     head: '수업이 끝난 뒤 1시간 안에 쓰면 차감이 없습니다', left: null, next: 5000 };
  if (h < 1)  return { amount: 0,     head: '지금 제출하면 차감이 없습니다',                 left: Math.round((1 - h) * 60), next: 5000 };
  if (h < 4)  return { amount: 5000,  head: '지금 제출하면 5,000원이 깎입니다',              left: Math.round((4 - h) * 60), next: 10000 };
  return        { amount: 10000, head: '지금 제출하면 10,000원이 깎입니다',             left: null, next: null };
}

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

/* ── 리포트 내용 검증 — 60자 + 세 가지 + 교재 정식 명칭 ── */
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
const canSeePeriod = p => p === LAST_PAYOUT.period || p === OPEN_PERIOD;
function settle(period) {
  const list = SESS.filter(s => s.date.startsWith(period))
    .sort((a, b) => b.date.localeCompare(a.date) || b.start.localeCompare(a.start));
  const held = list.filter(s => !isCanceled(s) && isPast(s));
  const done = held.filter(s => s.report === 'approved' || s.report === 'submitted');
  const miss = held.filter(s => s.report === 'none' || s.report === 'draft');
  const doneH = done.reduce((a, s) => a + s.dur, 0) / 60;
  const missH = miss.reduce((a, s) => a + s.dur, 0) / 60;
  const gross = done.reduce((a, s) => a + sessionPay(s).amount, 0);   // 유형별 단가 (v20 s38)
  const byKind = {};
  for (const s of done) { const k = kindOf(s).label;
    byKind[k] = byKind[k] || { cnt: 0, hours: 0, amount: 0 };
    byKind[k].cnt++; byKind[k].hours += s.dur / 60; byKind[k].amount += sessionPay(s).amount; }
  const pen = done.reduce((a, s) => a + latePenalty(s), 0);
  const penCnt = done.filter(s => latePenalty(s) > 0).length;
  const tax = Math.round((gross - pen) * 0.033);
  const future = list.filter(s => !isCanceled(s) && !isPast(s));
  return { period, list, held, done, miss, doneH, missH, gross, byKind, pen, penCnt, tax,
    net: gross - pen - tax, future };
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
