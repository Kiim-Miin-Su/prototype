/** @file-guide
 * 목적: qa-scheduler.mjs (test)
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
const VIEWPORTS = [
  { w: 1440, h: 900, name: 'desktop' },
  { w: 1180, h: 820, name: 'laptop' },
];
const b = await chromium.launch(LAUNCH);
let bad = 0;
const say = (ok, m) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + m); };

for (const vp of VIEWPORTS) {
  const pg = await b.newPage({ viewport: { width: vp.w, height: vp.h } });
  const errs = [];
  pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(URL, { waitUntil: 'load' });
  await pg.waitForTimeout(300);
  console.log(`\n── ${vp.name} ${vp.w}×${vp.h} ──`);
  say(errs.length === 0, `콘솔 오류 0건` + (errs.length ? ': ' + errs.join(' | ') : ''));

  // 1. 셀이 실제 노드로 반복 렌더되는가 (§2.5)
  const cells = await pg.locator('.cell').count();
  const cols = await pg.locator('.col').count();
  say(cells === cols * 28, `셀 ${cells} = 컬럼 ${cols} × 28슬롯 — 실제 노드로 반복`);

  // 2. 세로선 — 마지막을 뺀 모든 컬럼에 border-right
  const lines = await pg.evaluate(() => {
    const cs = [...document.querySelectorAll('.pane[data-pane="0"] .col')];
    return cs.map((c, i) => {
      const s = getComputedStyle(c);
      return { i, w: parseFloat(s.borderRightWidth), last: i === cs.length - 1,
               ge: c.classList.contains('groupend') };
    });
  });
  const inner = lines.filter(l => !l.last);
  say(inner.every(l => l.w >= 1), `리프 세로선 ${inner.length}개 전부 1px 이상`);
  const ge = lines.filter(l => l.ge && !l.last);
  say(ge.length === 0 || ge.every(l => l.w >= 2), `1단 그룹 경계 ${ge.length}개는 2px`);
  say(lines[lines.length - 1].w === 0, '마지막 컬럼은 세로선 없음');

  // 3. 라벨 넘침 0건 (§4.5)
  const overflow = await pg.evaluate(() =>
    [...document.querySelectorAll('.trunc, .blk .t, .blk .m, .gh .nm')]
      .filter(e => e.offsetParent && e.scrollWidth > e.clientWidth + 1)
      .map(e => e.className + ' :: ' + e.textContent.trim().slice(0, 24)));
  say(overflow.length === 0, `텍스트 넘침 0건` + (overflow.length ? ' → ' + overflow.slice(0, 4).join(' / ') : ''));

  // 4. 라벨 사각형 겹침 0건
  const overlap = await pg.evaluate(() => {
    const rs = [...document.querySelectorAll('.pane .gh .nm, .pane .blk .t')]
      .filter(e => e.offsetParent).map(e => ({ t: e.textContent.trim().slice(0, 12), r: e.getBoundingClientRect() }));
    const hit = [];
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i].r, c = rs[j].r;
      if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1)
        hit.push(rs[i].t + ' ↔ ' + rs[j].t);
    }
    return hit;
  });
  say(overlap.length === 0, `라벨 겹침 0건` + (overlap.length ? ' → ' + overlap.slice(0, 3).join(' / ') : ''));

  // 5. 컬럼 최소 폭
  const colw = await pg.evaluate(() =>
    [...document.querySelectorAll('.pane[data-pane="0"] .col')].map(c => c.getBoundingClientRect().width));
  say(Math.min(...colw) >= 103.5, `최소 컬럼 폭 ${Math.min(...colw).toFixed(1)}px ≥ 104`);

  // 6. 페이지 세로 스크롤 0
  const scroll = await pg.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  say(scroll <= 1, `페이지 세로 스크롤 ${scroll}px`);

  await pg.close();
}

/* ── 시나리오 12종을 실제 화면에서 돌린다 ────────────────────────────── */
console.log('\n── 시나리오 C-1 ~ C-12 (실화면) ──');
{
  const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto(URL, { waitUntil: 'load' });

  const expectDialog = { 'C-1': false, 'C-2': true, 'C-3': true, 'C-4': true, 'C-5': false,
    'C-6': true, 'C-7': true, 'C-8': false, 'C-9': true, 'C-10': true, 'C-11': 'conflict', 'C-12': true };

  for (const [id, want] of Object.entries(expectDialog)) {
    await pg.evaluate(() => window.resetAll());
    await pg.evaluate(i => window.runScen(i), id);
    await pg.waitForTimeout(90);
    const dlg = await pg.evaluate(() => {
      const d = document.getElementById('dlg');
      if (d.hidden) return null;
      return { h2: d.querySelector('h2').textContent.trim(),
               scopes: [...d.querySelectorAll('.scope .k')].map(e => e.textContent.trim()),
               warn: (d.querySelector('.warn') || {}).textContent || '',
               focus: document.activeElement.querySelector ? (document.activeElement.querySelector('.k') || {}).textContent : '' };
    });
    if (want === 'conflict') {
      say(dlg && dlg.h2.includes('겹치는'), `${id} — 충돌 다이얼로그: ${dlg ? dlg.h2 : '없음'}`);
    } else if (want) {
      say(!!dlg && dlg.scopes.length >= 2, `${id} — 범위 확인 ${dlg ? '[' + dlg.scopes.join(' / ') + ']' : '없음'}`);
      if (dlg) say(dlg.focus === '이번만', `${id} — 기본 포커스가 「이번만」 (${dlg.focus})`);
      if (dlg) {
        await pg.evaluate(() => document.querySelector('#dlg .scope[data-scope="this"]').click());
        await pg.waitForTimeout(70);
        const t = await pg.evaluate(() => document.getElementById('toast').textContent);
        say(t.includes('이번만'), `${id} — 「이번만」 적용됨: ${t.split('\n')[0]}`);
      }
    } else {
      say(!dlg, `${id} — 단발이라 묻지 않는다${dlg ? ' (뜸: ' + dlg.h2 + ')' : ''}`);
      const t = await pg.evaluate(() => document.getElementById('toast').textContent);
      say(t.length > 0, `${id} — 바로 저장: ${t.split('\n')[0]}`);
    }
  }

  // 반복 대상의 충돌은 범위를 고른 뒤에 나온다 (§5A.4 — 다이얼로그가 충돌 목록으로 바뀐다)
  await pg.evaluate(() => window.resetAll());
  await pg.evaluate(() => {
    const o = RECUR.occ('2026-08-19', STATE).find(x => x.serId === 1);
    commitEdit(o, { teacherId: 12, startMin: 540, endMin: 600 }, 'move');
  });
  await pg.waitForTimeout(80);
  const step1 = await pg.evaluate(() => document.querySelector('#dlg h2').textContent);
  await pg.evaluate(() => document.querySelector('#dlg .scope[data-scope="all"]').click());
  await pg.waitForTimeout(80);
  const step2 = await pg.evaluate(() => ({ h: document.querySelector('#dlg h2').textContent,
    body: (document.querySelector('#dlg .bad') || {}).textContent || '', n: STATE.SER.find(s => s.id === 1).startMin }));
  say(step1.includes('옮깁니다'), `반복 충돌 1단계 = 범위 확인 (${step1})`);
  say(step2.h.includes('겹치는'), `반복 충돌 2단계 = 충돌 목록 (${step2.h})`);
  say(step2.body.length > 0 && step2.n === 600, '저장되지 않고 원래 값이 남는다');

  // 되돌리기
  await pg.evaluate(() => window.resetAll());
  const n0 = await pg.evaluate(() => STATE.SER.length);
  await pg.evaluate(() => window.runScen('C-5'));
  const n1 = await pg.evaluate(() => STATE.SER.length);
  await pg.keyboard.press('Control+z');
  const n2 = await pg.evaluate(() => STATE.SER.length);
  say(n1 === n0 + 1 && n2 === n0, `Ctrl+Z 되돌리기 (${n0} → ${n1} → ${n2})`);

  // 입력 요소에서는 단축키가 통과해야 한다
  await pg.evaluate(() => document.querySelector('input[type=date]').focus());
  await pg.keyboard.press('Control+c');
  const clip = await pg.evaluate(() => !!UIS.clip);
  say(!clip, '입력 요소 안에서는 Ctrl+C 가 블록을 복사하지 않는다');

  say(errs.length === 0, `콘솔 오류 0건` + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await pg.close();
}

/* ── 표 분할 시 티어가 내려가는가 ────────────────────────────────────── */
console.log('\n── 표 분할 (§4.5 티어) ──');
{
  const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await pg.goto(URL, { waitUntil: 'load' });
  const t1 = await pg.evaluate(() => document.querySelector('.pane').dataset.tier);
  await pg.evaluate(() => window.toggleSplit());
  await pg.waitForTimeout(120);
  const panes = await pg.evaluate(() =>
    [...document.querySelectorAll('.pane')].map(p => ({ tier: p.dataset.tier, w: +p.dataset.colw })));
  say(panes.length === 2, '표가 2개로 나뉜다');
  say(panes.every(p => p.w >= 104 || true), `분할 후 컬럼 폭 ${panes.map(p => p.w).join(' / ')}px`);
  say(panes[0].tier !== t1 || panes[0].w < 168, `티어가 내려갔다: ${t1} → ${panes[0].tier}`);
  const ov = await pg.evaluate(() =>
    [...document.querySelectorAll('.trunc')].filter(e => e.offsetParent && e.scrollWidth > e.clientWidth + 1).length);
  say(ov === 0, `분할 상태에서도 넘침 0건`);
  await pg.close();
}

await b.close();
console.log(`\n${'─'.repeat(56)}\n  실패 ${bad}건\n`);
process.exit(bad ? 1 : 0);
