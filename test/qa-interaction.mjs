/** @file-guide
 * 목적: qa-interaction.mjs (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
/* playwright 는 전역/로컬 어디에 있든 찾는다 */
let chromium;
for (const p of ['playwright', 'playwright-core',
                 process.env.HOME + '/.npm-global/lib/node_modules/playwright']) {
  try { chromium = require(p).chromium; break; } catch {}
}
if (!chromium) { console.error('playwright 가 없습니다 — npm i -g playwright'); process.exit(2); }
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const LAUNCH = require('fs').existsSync(EXE)
  ? { executablePath: EXE, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] };
const HERE = path.dirname(fileURLToPath(import.meta.url));
const URL = 'file://' + path.resolve(HERE, '..', 'scheduler.html');
const b = await chromium.launch(LAUNCH);
const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto(URL, { waitUntil: 'load' });
let bad = 0; const say = (ok, m) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + m); };
const SHOT = path.resolve(HERE, 'shots');
require('fs').mkdirSync(SHOT, { recursive: true });

/* ── 실제 마우스 드래그 ──────────────────────────────────────────────── */
const blk = pg.locator('.blk').first();
const r = await blk.boundingBox();
await pg.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
await pg.mouse.down();
await pg.mouse.move(r.x + r.width / 2, r.y + r.height / 2 + 60, { steps: 8 });
await pg.waitForTimeout(60);
const ghost = await pg.evaluate(() => {
  const g = document.querySelector('.ghost');
  return g ? { text: g.textContent, bad: g.classList.contains('bad') } : null;
});
say(!!ghost, `드래그 중 고스트가 뜬다 — ${ghost ? ghost.text.slice(0, 24) : '없음'}`);
await pg.screenshot({ path: SHOT + '/sc_drag.png' });
await pg.mouse.up();
await pg.waitForTimeout(90);
const dlg = await pg.evaluate(() => document.getElementById('dlg').hidden ? null
  : { h: document.querySelector('#dlg h2').textContent, warn: (document.querySelector('#dlg .warn') || {}).textContent || '' });
say(!!dlg, `드롭하면 범위 확인이 뜬다 — ${dlg ? dlg.h : '없음'}`);
await pg.screenshot({ path: SHOT + '/sc_scope.png' });
await pg.evaluate(() => document.querySelector('#dlg .scope[data-scope="future"]').click());
await pg.waitForTimeout(90);
const log = await pg.evaluate(() => document.getElementById('toast').textContent);
say(log.includes('향후') && log.includes('분할'), `「향후」가 SER 을 분할한다 — ${log.replace(/\n/g, ' ⟩ ')}`);

/* ── Ctrl+드래그 복제 ───────────────────────────────────────────────── */
await pg.evaluate(() => window.resetAll());
const r2 = await pg.locator('.blk').first().boundingBox();
await pg.keyboard.down('Control');
await pg.mouse.move(r2.x + r2.width / 2, r2.y + r2.height / 2);
await pg.mouse.down();
await pg.mouse.move(r2.x + r2.width / 2 + 220, r2.y + r2.height / 2 + 40, { steps: 8 });
await pg.waitForTimeout(60);
const cg = await pg.evaluate(() => { const g = document.querySelector('.ghost'); return g ? g.textContent : ''; });
say(cg.includes('복제'), `Ctrl+드래그 고스트가 "복제" 로 바뀐다 — ${cg.slice(0, 20)}`);
await pg.mouse.up(); await pg.keyboard.up('Control');
await pg.waitForTimeout(80);
say(!(await pg.evaluate(() => document.getElementById('dlg').hidden)), '복제도 범위를 묻는다');
await pg.evaluate(() => document.querySelector('#dlg .scope[data-scope="this"]').click());

/* ── 리사이즈 핸들 ──────────────────────────────────────────────────── */
await pg.evaluate(() => window.resetAll());
const r3 = await pg.locator('.blk').first().boundingBox();
await pg.mouse.move(r3.x + r3.width / 2, r3.y + r3.height - 2);
await pg.mouse.down();
await pg.mouse.move(r3.x + r3.width / 2, r3.y + r3.height + 45, { steps: 6 });
await pg.waitForTimeout(50);
const rg = await pg.evaluate(() => { const g = document.querySelector('.ghost'); return g ? g.textContent : ''; });
say(/\d\d:\d\d–\d\d:\d\d/.test(rg), `하단 핸들 드래그로 길이가 늘어난다 — ${rg.slice(0, 16)}`);
await pg.mouse.up(); await pg.waitForTimeout(80);
await pg.evaluate(() => { const s = document.querySelector('#dlg .scope[data-scope="this"]'); if (s) s.click(); });

/* ── 빈 칸 드래그로 새 일정 ─────────────────────────────────────────── */
await pg.evaluate(() => window.resetAll());
const n0 = await pg.evaluate(() => STATE.SER.length);
const cellBox = await pg.locator('.col[data-col="3"] .cell[data-min="720"]').first().boundingBox();
await pg.mouse.move(cellBox.x + cellBox.width / 2, cellBox.y + 3);
await pg.mouse.down();
await pg.mouse.move(cellBox.x + cellBox.width / 2, cellBox.y + 60, { steps: 6 });
await pg.waitForTimeout(50);
say(await pg.evaluate(() => !!document.querySelector('.draft')), '빈 칸 드래그에 드래프트가 그려진다');
await pg.mouse.up(); await pg.waitForTimeout(80);
const n1 = await pg.evaluate(() => STATE.SER.length);
say(n1 === n0 + 1, `새 일정이 묻지 않고 저장된다 (${n0} → ${n1})`);

/* ── 클립보드 바 ────────────────────────────────────────────────────── */
await pg.evaluate(() => window.resetAll());
await pg.locator('.blk').first().click();
await pg.keyboard.press('Control+c');
await pg.waitForTimeout(50);
say(!(await pg.evaluate(() => document.getElementById('clipbar').hidden)), '클립보드 바가 하단에 뜬다');
await pg.screenshot({ path: SHOT + '/sc_clip.png' });
await pg.keyboard.press('Escape');   // 1차 — 선택 해제 (§5A.6 순서)
say(await pg.evaluate(() => UIS.sel.length === 0), 'Esc 1회 — 선택이 풀린다');
await pg.keyboard.press('Escape');   // 2차 — 클립보드
say(await pg.evaluate(() => document.getElementById('clipbar').hidden), 'Esc 2회 — 클립보드가 비워진다');

/* ── 전체 화면 캡처 ─────────────────────────────────────────────────── */
await pg.evaluate(() => window.resetAll());
await pg.screenshot({ path: SHOT + '/sc_grid.png' });
await pg.evaluate(() => window.toggleSplit());
await pg.waitForTimeout(150);
await pg.screenshot({ path: SHOT + '/sc_split.png' });
await pg.evaluate(() => { window.toggleSplit(); UIS.dates = ['2026-08-19', '2026-08-20']; window.runScen('C-11'); });
await pg.waitForTimeout(120);
await pg.screenshot({ path: SHOT + '/sc_conflict.png' });

say(errs.length === 0, `콘솔 오류 0건${errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''}`);
await b.close();
console.log(`\n  실패 ${bad}건`);
process.exit(bad ? 1 : 0);
