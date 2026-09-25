import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let chromium;
for (const p of ['playwright', '/usr/lib/node_modules/playwright', '/usr/local/lib/node_modules/playwright']) {
  try { ({ chromium } = require(p)); break; } catch {}
}
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const pg = await b.newPage({ viewport: { width: 1440, height: 960 } });
const errs = [];
pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
pg.on('pageerror', e => errs.push(String(e)));
await pg.goto('file:///home/claude/out/prototype/index.html');
await pg.waitForTimeout(700);

let pass = 0, fail = 0;
const ok = (c, n, x) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : ''))); };

// 탭 순회
const tabs = await pg.$$eval('[data-nav],[onclick^="go("]', els =>
  [...new Set(els.map(e => (e.getAttribute('onclick')||'').match(/go\('([a-z]+)'/)?.[1]).filter(Boolean))]);
console.log('\n── 화면 순회 ──');
for (const t of tabs.slice(0, 12)) {
  await pg.evaluate(t => window.go && window.go(t), t);
  await pg.waitForTimeout(220);
  const bad = await pg.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!el.offsetParent && el.tagName !== 'BODY') continue;
      const cs = getComputedStyle(el);
      // 의도한 말줄임(text-overflow:ellipsis)은 넘침이 아니다 — 잘린 채 표시되는 것만 센다
      if (cs.textOverflow === 'ellipsis' && cs.overflow !== 'visible') continue;
      if (el.children.length === 0 && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2 &&
          !cs.overflowX.match(/auto|scroll/)) out.push(el.textContent.slice(0, 30));
    }
    return out;
  });
  ok(bad.length === 0, `${t} — 넘침 0건`, bad.slice(0, 3));
}

console.log('\n── 확정 규칙이 화면에 보이는가 ──');
const txt = await pg.evaluate(() => document.body.innerText);
ok(!/정산에서 제외|10일 초과/.test(txt), '"정산 제외" 문구가 사라졌다');
await pg.evaluate(() => window.go && window.go('history'));
await pg.waitForTimeout(300);
const h = await pg.evaluate(() => document.body.innerText);
ok(/1시간 이상/.test(h) && /4시간 이상/.test(h), '지각 차감 표가 시간 기준으로 나온다');
ok(/확정/.test(h) && !/잠정/.test(h), '"잠정" 배지가 "확정" 으로 바뀌었다');
ok(/쓴 리포트가 정산에 들어갑니다/.test(h), '정산 조건 문구가 작성 기준이다');

console.log('\n── 출결 (A27) ──');
await pg.evaluate(() => window.go && window.go('calendar'));
await pg.waitForTimeout(300);
const att = await pg.evaluate(() => {
  const today = SESS.filter(s => s.date === TODAY && !s.canceled);
  const done  = today.filter(s => toMin(s.start) + s.dur <= NOW_MIN);
  const pick  = (done[0] || today[0] || SESS.filter(s => isPast(s) && !s.canceled)[0]);
  if (!pick) return { none: true };
  openSession(pick.id);
  return { id: pick.id, date: pick.date, can: canEditAttendance(pick), enabled: A27_ENABLED };
});
ok(att.enabled === true, 'A27_ENABLED = true', att);
await pg.waitForTimeout(300);
const attTxt = await pg.evaluate(() => document.body.innerText);
ok(/출결/.test(attTxt), '출결 스트립이 패널에 그려진다', { can: att.can, date: att.date });
ok(att.date && att.can === (att.date === await pg.evaluate(() => TODAY) ? 'first' : 'readonly'),
   '판정이 D-R35 대로다 (오늘=first · 지난=readonly)', att.can);

ok(errs.length === 0, '콘솔 오류 0건', errs.slice(0, 3));
console.log('\n' + '─'.repeat(48));
console.log(fail === 0 ? `  실패 0건 — ${pass} 통과` : `  ${pass} 통과 · ${fail} 실패`);
await b.close();
process.exit(fail ? 1 : 0);
