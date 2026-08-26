/* recurrence.js 회귀 테스트 — node test/recurrence.test.js
   docs/CALENDAR.md §5A · DEV-SPEC D-R16~D-R20 을 한 줄씩 검증한다. */
const R = require('../js/recurrence.js');

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '\n      → ' + JSON.stringify(extra) : '')); }
};
const sec = t => console.log('\n' + t);

/* 시드 — 매주 월·수 10:00~11:00, 2026-08-03 시작, 종료 없음 */
const base = () => ({
  SER: [
    { id: 1, kind: 'regular', sub: null, mode: 'offline', title: '수학 A',
      teacherId: 11, roomId: 201, startMin: 600, endMin: 660,
      rrule: 'WEEKLY:MO,WE', fromDate: '2026-08-03', toDate: null },
    { id: 2, kind: 'trial', sub: null, mode: 'online', title: '체험',
      teacherId: 12, roomId: null, startMin: 780, endMin: 840,
      rrule: 'ONCE', fromDate: '2026-08-19', toDate: '2026-08-19' },
  ],
  SER_STU: [{ serId: 1, studentId: 101 }, { serId: 1, studentId: 102 }],
  EXC: [],
});

/* ── 1. 규칙 · occ ─────────────────────────────────────────────────────── */
sec('1. 규칙 · occ(date) — D-R1');
{
  const s = base();
  ok(R.ruleHits(s.SER[0], '2026-08-05'), '수요일에 발생한다');
  ok(!R.ruleHits(s.SER[0], '2026-08-06'), '목요일에는 없다');
  ok(!R.ruleHits(s.SER[0], '2026-07-27'), 'from_date 이전에는 없다');
  ok(R.occ('2026-08-19', s).length === 2, '8/19(수)에 2건 — 반복 1 + 단발 1');
  ok(R.occ('2026-08-20', s).length === 0, '8/20(목)에 0건');
}

/* ── 2. 「이번만」 = EXC upsert ────────────────────────────────────────── */
sec('2. 「이번만」 — EXC upsert');
{
  const s = base();
  const n = R.applyEdit(s, { serId: 1, onDate: '2026-08-19', scope: 'this', patch: { startMin: 660, endMin: 720 } });
  ok(n.SER[0].startMin === 600, 'SER 원본은 그대로다');
  ok(n.EXC.length === 1 && n.EXC[0].startMin === 660, 'EXC 1건이 생긴다');
  const o = R.occ('2026-08-19', n).find(x => x.serId === 1);
  ok(o.startMin === 660, '그날만 11:00 으로 보인다');
  const o2 = R.occ('2026-08-17', n).find(x => x.serId === 1);
  ok(o2.startMin === 600, '다른 날은 10:00 그대로다');
}

/* ── 3. 「향후」 = SER 분할 (D-R17) ────────────────────────────────────── */
sec('3. 「향후」 — SER 분할');
{
  const s = base();
  const n = R.applyEdit(s, { serId: 1, onDate: '2026-08-19', scope: 'future', patch: { teacherId: 99 } });
  ok(n.SER.length === 3, 'SER 이 하나 늘어난다', n.SER.map(x => x.id));
  const orig = n.SER.find(x => x.id === 1), copy = n.SER.find(x => x.id > 2);
  ok(orig.toDate === '2026-08-18', '원본 to_date = 기준일 − 1');
  ok(copy.fromDate === '2026-08-19' && copy.teacherId === 99, '새 SER 이 기준일부터 새 강사');
  ok(orig.teacherId === 11, '기준일 이전은 원래 강사');
  ok(n.SER_STU.filter(r => r.serId === copy.id).length === 2, 'SER_STU 가 복제된다');
  ok(R.occ('2026-08-17', n)[0].teacherId === 11, '8/17 은 옛 강사');
  ok(R.occ('2026-08-19', n).find(x => x.serId === copy.id).teacherId === 99, '8/19 은 새 강사');
  ok(R.occ('2026-08-19', n).filter(x => x.kind === 'regular').length === 1, '분할 경계에서 중복 발생 없음');
}

/* ── 4. 첫 회차의 「향후」는 「모두」다 (D-R17) ─────────────────────────── */
sec('4. 기준일 == from_date → 「모두」로 처리');
{
  const s = base();
  const n = R.applyEdit(s, { serId: 1, onDate: '2026-08-03', scope: 'future', patch: { teacherId: 99 } });
  ok(n.SER.length === 2, '분할하지 않는다', n.SER.length);
  ok(n.__effScope === 'all', '실제 적용 범위가 all 로 바뀐다');
  ok(R.scopesFor(s.SER[0], '2026-08-03').join() === 'this,all', '버튼도 2개만 뜬다');
  ok(R.scopesFor(s.SER[0], '2026-08-19').join() === 'this,future,all', '중간 회차는 3개');
}

/* ── 5. 「모두」가 EXC 를 초기화한다 (D-R18 · N-8) ──────────────────────── */
sec('5. 「모두」 — EXC 초기화');
{
  let s = base();
  s = R.applyEdit(s, { serId: 1, onDate: '2026-08-19', scope: 'this', patch: { startMin: 660, endMin: 720 } });
  s = R.applyEdit(s, { serId: 1, onDate: '2026-08-17', scope: 'this', patch: { teacherId: 55 } });
  s = R.applyDelete(s, { serId: 1, onDate: '2026-08-24', scope: 'this' });
  ok(s.EXC.length === 3, '예외 3건 준비 (시간 · 강사 · 휴강)');

  const pv = R.resetPreview(s, 1, { startMin: 540, endMin: 600 }, 'all', '2026-08-19');
  ok(pv.count === 1, '초기화 미리보기 = 1건 (시간 예외만)', pv);

  const n = R.applyEdit(s, { serId: 1, onDate: '2026-08-19', scope: 'all', patch: { startMin: 540, endMin: 600 } });
  ok(n.SER[0].startMin === 540, 'SER 이 09:00 으로 바뀐다');
  const e19 = n.EXC.find(e => e.onDate === '2026-08-19');
  ok(!e19, '시간만 담고 있던 예외는 사라진다');
  const e17 = n.EXC.find(e => e.onDate === '2026-08-17');
  ok(e17 && e17.teacherId === 55, '강사 예외는 살아 있다 (N-8 ①)');
  const e24 = n.EXC.find(e => e.onDate === '2026-08-24');
  ok(e24 && e24.canceled, '휴강은 남는다');
  ok(R.occ('2026-08-17', n)[0].startMin === 540 && R.occ('2026-08-17', n)[0].teacherId === 55,
     '8/17 은 새 시간 + 옛 강사 예외');
}

/* ── 6. 삭제 3범위 (5A.2) ─────────────────────────────────────────────── */
sec('6. 삭제 — 이번만 · 향후 · 모두');
{
  const s = base();
  const a = R.applyDelete(s, { serId: 1, onDate: '2026-08-19', scope: 'this' });
  ok(R.occ('2026-08-19', a).length === 1, '이번만 → 그날만 사라진다');
  ok(R.occ('2026-08-24', a).length === 1, '다음 회차는 남는다');

  const b = R.applyDelete(s, { serId: 1, onDate: '2026-08-19', scope: 'future' });
  ok(b.SER.find(x => x.id === 1).toDate === '2026-08-18', '향후 → to_date 마감');
  ok(R.occ('2026-08-17', b).length === 1 && R.occ('2026-08-24', b).length === 0, '경계가 맞다');

  const c = R.applyDelete(s, { serId: 1, onDate: '2026-08-19', scope: 'all' });
  ok(!c.SER.find(x => x.id === 1), '모두 → SER 삭제');
  ok(c.SER_STU.length === 0, 'SER_STU 도 정리된다');

  const d = R.applyDelete(s, { serId: 1, onDate: '2026-08-19', scope: 'all', hasRefs: true });
  ok(d.SER.find(x => x.id === 1), '참조가 있으면 지우지 않고');
  ok(d.SER.find(x => x.id === 1).toDate === '2026-08-18', 'to_date 로 닫는다');
}

/* ── 7. 붙여넣기 3범위 (D-R19 · N-10) ─────────────────────────────────── */
sec('7. 붙여넣기 — 이번만 · 향후 · 모두');
{
  let s = base();
  s = R.applyEdit(s, { serId: 1, onDate: '2026-08-17', scope: 'this', patch: { teacherId: 55 } });
  const src = R.occ('2026-08-19', s).find(o => o.serId === 1);
  const clip = R.copyPayload(s, src);
  ok(clip.excCount === 1, '복사 시점에 예외 건수를 담는다 (프리뷰용)');

  const p1 = R.applyPaste(s, { items: clip, targetDate: '2026-09-01', targetMin: 840, scope: 'this' });
  const np1 = p1.SER[p1.SER.length - 1];
  ok(np1.rrule === 'ONCE' && np1.fromDate === '2026-09-01' && np1.toDate === '2026-09-01', '이번만 → 단발 1건');
  ok(np1.startMin === 840 && np1.endMin === 900, '길이가 보존된다');
  ok(p1.SER_STU.filter(r => r.serId === np1.id).length === 2, '학생이 복제된다 (N-10 ①)');
  ok(p1.EXC.length === s.EXC.length, 'EXC 는 따라오지 않는다 (D-R19)');

  const p2 = R.applyPaste(s, { items: clip, targetDate: '2026-09-01', targetMin: 600, scope: 'future' });
  const np2 = p2.SER[p2.SER.length - 1];
  ok(np2.fromDate === '2026-09-01' && np2.rrule.startsWith('WEEKLY'), '향후 → 규칙 유지, 붙인 날부터');
  ok(R.ruleHits(np2, '2026-09-01'), '붙인 날(화)에 실제로 발생한다');

  const p3 = R.applyPaste(s, { items: clip, targetDate: '2026-09-01', targetMin: 600, scope: 'all' });
  const np3 = p3.SER[p3.SER.length - 1];
  ok(R.diffD(np3.fromDate, s.SER[0].fromDate) === R.diffD('2026-09-01', '2026-08-19'),
     '모두 → 창 전체가 같은 일수만큼 평행 이동');
}

/* ── 8. 다중 복사 — 상대 간격 유지 (5.2) ──────────────────────────────── */
sec('8. 다중 복사 — 간격 유지');
{
  const s = base();
  const items = R.copyMany(s, [
    R.occ('2026-08-19', s).find(o => o.serId === 1),
    R.occ('2026-08-19', s).find(o => o.serId === 2),
    R.occ('2026-08-24', s).find(o => o.serId === 1),
  ]);
  ok(items[0].offsetDays === 0 && items[0].offsetMinutes === 0, '첫 건이 기준');
  ok(items[1].offsetMinutes === 180, '같은 날 3시간 뒤');
  ok(items[2].offsetDays === 5, '5일 뒤');
  const p = R.applyPaste(s, { items, targetDate: '2026-09-07', targetMin: 600, scope: 'this' });
  const made = p.SER.slice(-3);
  ok(made[0].fromDate === '2026-09-07' && made[1].fromDate === '2026-09-07' && made[2].fromDate === '2026-09-12',
     '붙인 뒤에도 날짜 간격이 유지된다', made.map(m => m.fromDate));
  ok(made[1].startMin === 780, '시간 간격도 유지된다', made[1].startMin);
}

/* ── 9. 묻는가 / 안 묻는가 (D-R16) ────────────────────────────────────── */
sec('9. 확인창을 띄우는 조건');
{
  const s = base();
  ok(R.isRecurring(s.SER[0], '2026-08-19'), '반복이면 묻는다');
  ok(!R.isRecurring(s.SER[1], '2026-08-19'), '단발이면 묻지 않는다');
  ok(R.scopesFor(s.SER[1], '2026-08-19').length === 0, '단발은 범위 버튼이 없다');
  const tail = { ...s.SER[0], toDate: '2026-08-19' };
  ok(!R.isRecurring(tail, '2026-08-19'), '마지막 회차 하나만 남으면 묻지 않는다');
}

/* ── 10. 충돌 선검사 (D-R20 · 5A.4) ───────────────────────────────────── */
sec('10. 충돌 선검사 — 범위별 검사 대상');
{
  const s = base();
  const ser = s.SER[0];
  ok(R.affectedDates(ser, 'this', '2026-08-19', '2026-08-19').length === 1, '이번만 → 1일');
  const fut = R.affectedDates(ser, 'future', '2026-08-19', '2026-08-19');
  ok(fut[0] === '2026-08-19' && fut.length > 20, '향후 → 90일 지평선', fut.length);
  const all = R.affectedDates(ser, 'all', '2026-08-19', '2026-08-19');
  ok(all[0] === '2026-08-03', '모두 → from_date 부터');
  ok(all.length > fut.length, '모두가 향후보다 많다');

  // 8/24 에만 다른 강사 일정이 박혀 있다고 치고 검사
  const guard = (cand) => (cand.date === '2026-08-24' && cand.instructorId === 11)
    ? { ok: false, blocking: [{ message: '강사 일정이 겹칩니다' }], warnings: [] }
    : { ok: true, blocking: [], warnings: [] };
  const pre = R.precheck(s, { serId: 1, onDate: '2026-08-19', scope: 'future',
    patch: { startMin: 600 }, today: '2026-08-19', guard, ctxOf: () => ({}) });
  ok(!pre.ok && pre.dates.length === 1 && pre.dates[0].date === '2026-08-24', '충돌 날짜를 집어낸다', pre.dates);
  ok(R.conflictSummary(pre).includes('2026-08-24'), '요약 문구에 날짜가 들어간다');

  const preThis = R.precheck(s, { serId: 1, onDate: '2026-08-19', scope: 'this',
    patch: { startMin: 600 }, today: '2026-08-19', guard, ctxOf: () => ({}) });
  ok(preThis.ok, '「이번만」은 그날만 보므로 통과한다');
}

/* ── 11. 요일을 넘는 이동 ─────────────────────────────────────────────── */
sec('11. 요일을 넘는 이동');
{
  const s = base();
  const n = R.applyEdit(s, { serId: 1, onDate: '2026-08-19', scope: 'all',
    patch: { date: '2026-08-20', __onDate: '2026-08-19' } });
  ok(n.SER[0].rrule === 'WEEKLY:TU,TH', '월·수 → 화·목 으로 규칙이 돈다', n.SER[0].rrule);
  ok(n.SER[0].fromDate === '2026-08-04', 'from_date 도 같이 밀린다');

  const t = R.applyEdit(s, { serId: 1, onDate: '2026-08-19', scope: 'this',
    patch: { date: '2026-08-20' } });
  ok(R.occ('2026-08-19', t).filter(o => o.serId === 1).length === 0, '이번만 → 원래 날에서 사라지고');
  const moved = R.occ('2026-08-20', t).find(o => o.serId === 1);
  ok(moved && moved.movedFrom === '2026-08-19', '옮긴 날에 나타난다 (movedFrom 표시)');
}

console.log(`\n${'─'.repeat(56)}\n  통과 ${pass} · 실패 ${fail}\n`);
process.exit(fail ? 1 : 0);
