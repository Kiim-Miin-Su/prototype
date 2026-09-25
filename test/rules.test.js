/* rules.js 회귀 테스트 — node test/rules.test.js
   2026-08-27 대표 결정 (docs/decisions/DECISIONS-2026-08-27.md) 을 한 줄씩 검증한다.
     · D-R7  정산 조건 = 「썼는가」 하나. 승인 여부를 보지 않는다
     · D-R32 지각 차감 = 수업 종료 후 1시간↑ 5,000 · 4시간↑ 10,000, 그 위로 안 늘어난다
     · D-R35 출결 = 강사는 당일 최초 체크 1회. 지난 회차는 매니저 이상만

   rules.js 는 브라우저 전역 스크립트라 require 가 없다.
   vm 으로 money.js → data.js → rules.js 를 한 컨텍스트에 올려 실제 파일을 그대로 검증한다. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const JS = f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');

const ctx = vm.createContext({ console, Math, Date, JSON, Intl, String, Number, Array, Object });
for (const f of ['money.js', 'data.js', 'rules.js']) {
  vm.runInContext(JS(f).replace(/^'use strict';$/m, ''), ctx, { filename: f });
}
const G = name => vm.runInContext(name, ctx);
const call = (fn, ...args) => {
  ctx.__args = args;
  return vm.runInContext(`${fn}(...__args)`, ctx);
};

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '\n      → ' + JSON.stringify(extra) : '')); }
};
const sec = t => console.log('\n' + t);

const TODAY = G('TODAY');          // '2026-08-21'
const NOW_MIN = G('NOW_MIN');      // 15:35

/* 회차 하나 만들기 — 09:00~10:00 (60분) */
const S = (over = {}) => Object.assign({
  id: 9001, date: TODAY, start: '09:00', dur: 60,
  studentId: 1, kind: 'regular', report: 'none', canceled: false,
  submittedAt: null, att: null, statusChanged: null,
}, over);

/* ══ 1. 정산 조건 — 「썼는가」 하나다 (D-R7) ══════════════════════════ */
sec('1. 정산 조건 — 「썼는가」 하나 (D-R7 · 대표 결정 1번)');
{
  const c = s => call('countsForSettlement', s);
  ok(c(S({ report: 'approved' }))  === true,  '승인된 리포트는 들어간다');
  ok(c(S({ report: 'submitted' })) === true,  '승인 대기도 들어간다 — 승인을 기다리다 깎이지 않는다');
  ok(c(S({ report: 'rejected' }))  === true,  '반려도 들어간다 — 반려로 급여가 깎이지 않는다');
  ok(c(S({ report: 'none' }))      === false, '미작성은 안 들어간다');
  ok(c(S({ report: 'draft' }))     === false, '임시저장은 아직 쓴 것이 아니다');
  ok(c(S({ report: 'approved', canceled: true })) === false, '취소된 수업은 리포트가 있어도 안 들어간다');
}

/* ══ 2. 지각 차감 — 수업 종료 후 시간 (D-R32) ═══════════════════════ */
sec('2. 지각 차감 — 수업 종료 시각 기준 (D-R32 · 대표 결정 5번)');
{
  const T = G('LATE_REPORT_TIERS');
  ok(T.length === 3, '구간은 셋이다 (0 · 1시간 · 4시간)', T.length);
  ok(T.every(t => 'fromMinutes' in t), '기준이 분(fromMinutes)이다 — 더는 날짜가 아니다');

  const tier = m => call('tierFor', m).amount;
  ok(tier(0)    === 0,     '끝나자마자 내면 0원');
  ok(tier(59)   === 0,     '59분은 아직 0원');
  ok(tier(60)   === 5000,  '정확히 1시간이면 5,000원 — "1시간 이상"');
  ok(tier(239)  === 5000,  '3시간 59분은 5,000원');
  ok(tier(240)  === 10000, '정확히 4시간이면 10,000원');
  ok(tier(1440) === 10000, '하루가 지나도 10,000원 — 그 위로 안 늘어난다');
  ok(tier(99999)=== 10000, '한 달이 지나도 10,000원');
}

sec('2-b. latePenalty — 실제 회차의 확정 차감액');
{
  const p = s => call('latePenalty', s);
  /* 09:00~10:00 수업. 종료는 10:00 */
  ok(p(S({ report: 'submitted', submittedAt: `${TODAY} 10:00` })) === 0,
     '종료 즉시 제출 — 0원');
  ok(p(S({ report: 'submitted', submittedAt: `${TODAY} 10:59` })) === 0,
     '59분 뒤 제출 — 0원');
  ok(p(S({ report: 'submitted', submittedAt: `${TODAY} 11:00` })) === 5000,
     '1시간 뒤 제출 — 5,000원');
  ok(p(S({ report: 'submitted', submittedAt: `${TODAY} 14:00` })) === 10000,
     '4시간 뒤 제출 — 10,000원');
  ok(p(S({ report: 'submitted', submittedAt: `${G('addDays')(TODAY, 3)} 09:00` })) === 10000,
     '사흘 뒤 제출도 10,000원에서 멈춘다');
  ok(p(S({ report: 'submitted', submittedAt: `${TODAY} 09:30` })) === 0,
     '수업 중에 미리 써 두면 0원 (음수 시간)');
  ok(p(S({ report: 'approved', submittedAt: null })) === 0,
     '제출 시각이 없으면 0원');
  ok(p(S({ report: 'submitted', submittedAt: `${TODAY} 14:00`, canceled: true })) === 0,
     '취소된 수업은 차감하지 않는다');
}

sec('2-c. penaltyNow — 지금 제출하면 얼마인가');
{
  /* NOW_MIN = 15:35. 09:00~10:00 수업이면 종료 후 335분 = 5시간 35분 */
  const now = call('penaltyNow', S());
  ok(now.amount === 10000, '5시간 35분 지났으니 10,000원', now.amount);
  ok(now.next === null, '더 오를 구간이 없다', now.next);
  ok(now.over === false, '"정산 제외"는 더 이상 없다 — 늦어도 쓰면 들어간다 (D-R7)');
  ok(/5시간 35분/.test(now.head), '얼마나 지났는지를 말해 준다', now.head);

  /* 14:00~15:00 수업 → 종료 15:00, 지금 15:35 = 35분 */
  const soon = call('penaltyNow', S({ start: '14:00' }));
  ok(soon.amount === 0, '35분 지났으면 아직 0원', soon.amount);
  ok(soon.next === 5000 && soon.nextIn === 25, '25분 뒤에 5,000원이 붙는다고 알려 준다',
     { next: soon.next, nextIn: soon.nextIn });

  /* 16:00~17:00 수업 → 아직 안 끝났다 */
  const future = call('penaltyNow', S({ start: '16:00' }));
  ok(future.amount === 0, '아직 안 끝난 수업은 0원');
  ok(/수업이 끝나면/.test(future.head), '끝나면 쓰라고 안내한다', future.head);
}

sec('2-d. PENALTY_RULE — 화면에 뿌리는 표는 작은 것부터');
{
  const R = G('PENALTY_RULE');
  ok(R.length === 3, '세 줄');
  ok(R[0].amount === 0 && R[1].amount === 5000 && R[2].amount === 10000,
     '0 → 5,000 → 10,000 순서로 읽힌다', R.map(x => x.amount));
  ok(R.every(x => x.amount !== null), '"정산 제외" 칸이 사라졌다');
}

/* ══ 3. 출결 — 매니저 이상만 CRUD (D-R35) ══════════════════════════ */
sec('3. 출결 — 강사는 당일 최초 체크 1회뿐 (D-R35 · 대표 결정 6번)');
{
  const teacher = { name: '김범준', role: '강사' };
  const manager = { name: '이매니저', role: '매니저' };
  const can = (s, me) => call('canEditAttendance', s, me);
  const yesterday = G('addDays')(TODAY, -1);

  ok(can(S(), teacher) === 'first',
     '오늘 끝난 내 수업 — 최초 체크 1회 가능');
  ok(can(S({ att: { by: '김범준', at: '', result: 'completed' } }), teacher) === 'readonly',
     '이미 찍힌 뒤에는 강사에게 읽기 전용');
  ok(can(S({ date: yesterday }), teacher) === 'readonly',
     '⭐ 어제 수업은 강사가 최초 체크조차 못 한다 — 매니저 몫이다');
  ok(can(S({ start: '16:00' }), teacher) === 'readonly',
     '아직 안 끝난 수업에는 출결이 없다');
  ok(can(S({ canceled: true }), teacher) === 'readonly',
     '관리자가 취소한 수업은 손대지 않는다');

  ok(can(S(), manager) === 'manage', '매니저는 오늘 회차를 언제든 정정한다');
  ok(can(S({ date: yesterday }), manager) === 'manage', '매니저는 어제 회차도 정정한다');
  ok(can(S({ att: { by: '김범준', at: '', result: 'completed' } }), manager) === 'manage',
     '매니저는 이미 찍힌 것도 정정한다');
}

sec('3-b. firstCheck — 거절 사유가 상황마다 다르다');
{
  const r1 = call('firstCheck', S({ date: G('addDays')(TODAY, -1) }), 'completed');
  ok(r1.ok === false && /매니저/.test(r1.msg), '지난 수업은 매니저가 처리한다고 말해 준다', r1.msg);

  const r2 = call('firstCheck', S({ start: '16:00' }), 'completed');
  ok(r2.ok === false && /끝난 뒤/.test(r2.msg), '아직 안 끝났다고 말해 준다', r2.msg);

  const s3 = S();
  const r3 = call('firstCheck', s3, 'completed');
  ok(r3.ok === true, '오늘 회차는 확정된다');
  ok(s3.att && s3.att.result === 'completed', '출결이 기록된다');

  const r4 = call('firstCheck', s3, 'canceled');
  ok(r4.ok === false, '두 번째는 거절된다 — 회차당 한 번');
}

sec('3-c. A27 은 켜져 있다');
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views-report.js'), 'utf8');
  ok(/const A27_ENABLED = true;/.test(src), 'A27_ENABLED = true (D-R35 로 존치 확정)');
}

/* ══ 4. 정산 합계 — 두 규칙이 만나는 자리 ══════════════════════════ */
sec('4. settle() — 쓴 것은 들어가고, 늦은 것만 깎인다');
{
  const SESS = G('SESS');
  ok(Array.isArray(SESS) && SESS.length > 0, '시드 회차가 있다');
  const r = call('settle', TODAY.slice(0, 7));
  ok(r.done.every(s => call('countsForSettlement', s)), 'done 은 전부 판정을 통과한 것');
  ok(r.miss.every(s => !call('countsForSettlement', s)), 'miss 는 전부 통과하지 못한 것');
  ok(r.done.length + r.miss.length === r.past.length, 'done + miss = 지난 회차 전부');
  ok(r.miss.every(s => s.report === 'none' || s.report === 'draft'),
     '⭐ miss 에는 미작성·임시저장만 있다 — 대기·반려는 이제 done 쪽이다',
     r.miss.map(s => s.report));
  ok(r.pen === r.done.reduce((a, s) => a + call('latePenalty', s), 0),
     '지각 차감 합계는 회차별 차감의 합');
  ok(r.net === r.afterCut - r.tax, '실지급 = 차감 후 − 원천징수');
  ok(r.gross >= r.afterCut, '차감은 총액을 넘지 않는다');
}

/* ══ 결과 ══ */
console.log(`\n${'─'.repeat(48)}`);
console.log(fail === 0 ? `  전부 통과 — ${pass}/${pass}` : `  ${pass} 통과 · ${fail} 실패`);
process.exit(fail === 0 ? 0 : 1);
