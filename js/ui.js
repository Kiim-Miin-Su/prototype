/* ══════════════════════════════════════════════════════════════
   셸 · 상태 · 라우팅 — 폭에 따라 사이드바/탭바를 갈아 끼운다.
   화면 하나가 두 벌 존재하지 않도록, 같은 뷰 함수가 두 배치를 모두 그린다.
   ══════════════════════════════════════════════════════════════ */
'use strict';

const MQ_MOBILE = window.matchMedia('(max-width: 860px)');
const isMobile = () => MQ_MOBILE.matches;

const UI = {
  page: 'home', stack: [],            // 뒤로 가기 (v20 s3)
  weekStart: monOf(TODAY), day: TODAY, calMode: 'week', month: TODAY.slice(0, 7),
  calSeg: 'my', markMode: '대면', markStart: '2026-08-24',
  panel: null, ptab: 'report', modal: null,
  guideSel: 1, histTab: 'last', polOpen: {},
  form: {}, chg: {}, mk: {}, feed: {},
};

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let _toastT;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(_toastT); _toastT = setTimeout(() => t.classList.remove('on'), 2600);
}

/* ── 메뉴 ── */
/* v20 s2 — 강사에게 보이는 메뉴는 일곱 개 */
const MENU = [
  { key: 'home',     ic: '⌂', label: '홈',            desc: '오늘 전체 스케줄과 오늘 할 일' },
  { key: 'calendar', ic: '▤', label: '캘린더',        desc: '내 수업만 주간·월간으로' },
  { key: 'marks',    ic: '⊘', label: '불가 시간', desc: '2주 단위 · 최소 1주 전' },
  { key: 'reports',  ic: '✎', label: '리포트',        desc: '안 쓴 리포트가 맨 위' },
  { key: 'guide',    ic: '▥', label: '수업 안내',      desc: '교재 · 스타일 · 진단 · 지침' },
  { key: 'history',  ic: '↺', label: '수업 히스토리',   desc: '일별 기록과 시급 정산' },
  { key: 'feedback', ic: '✉', label: '건의 사항',      desc: '네 분류로 관리자에게 · 월 3회' },
];
const PAGE_NAME = Object.fromEntries(MENU.map(m => [m.key, m.label]));
/* 모바일 하단 탭 4개 — 나머지는 '더보기'로 접는다 */
const TABS = [
  { key: 'home',     ic: '⌂', label: '홈' },
  { key: 'calendar', ic: '▤', label: '캘린더' },
  { key: 'reports',  ic: '✎', label: '리포트' },
  { key: 'more',     ic: '⋯', label: '더보기' },
];
const MORE_PAGES = ['marks', 'guide', 'history', 'feedback', 'policy', 'me'];
const tabOf = page => (TABS.some(t => t.key === page) ? page : 'more');

function go(page, push = true) {
  if (push && UI.page !== page) UI.stack.push(UI.page);
  UI.page = page; closePanel(true); UI.modal = null;
  render();
  const sc = $('scroll'); if (sc) sc.scrollTop = 0;
}
/** 뒤로 가기 — 드로어를 연 것도 한 단계로 잡는다 (v20 s3) */
function back() {
  if (UI.modal) { closeModal(); return; }
  if (UI.panel != null) { closePanel(); return; }
  if (UI.stack.length) { UI.page = UI.stack.pop(); render(); const sc = $('scroll'); if (sc) sc.scrollTop = 0; }
}
function goHome() { UI.stack = []; go('home', false); }
const canBack = () => !!(UI.modal || UI.panel != null || UI.stack.length);

/* ══ ① 정책은 화면 맨 위 ══════════════════════════════════ */
const POLICY = {
  home: { tag: '강사 권한', who: '화면에 없으면<br>할 수 없습니다',
    short: '권한을 최소로 줄였습니다. 화면에 없으면 할 수 없습니다.',
    body: `<b>강사 화면에서 할 수 있는 일은 정해져 있습니다.</b> 내 수업 보기 · <span class="yes">불가 시간 등록</span> ·
      리포트 작성 · 교재 내려받기와 변경 요청 · 스케줄 변경 요청 · 특이사항 · 건의 사항 · 내 정산 조회 ·
      시간대와 시급 변경 <span class="yes">요청</span>.
      수업 생성·시간 확정·취소, 다른 강사와 담당이 아닌 학생 조회, 리포트 자체 승인, 시간대·시급 직접 변경은 <span class="no">관리자만</span> 합니다.` },
  calendar: { tag: '캘린더 정책', who: '내가 들어간 수업만<br>보입니다',
    short: '보기 전용 — 표기만 할 수 있습니다.',
    body: `<b>이 화면은 보기 전용입니다.</b> 스케줄 추가·시간 변경·삭제는 <span class="no">관리자만</span> 합니다.
      강사가 할 수 있는 것은 <span class="yes">수업 가능한 시간(대면·비대면)과 불가능한 시간을 표기하는 것</span>뿐입니다.
      이미 잡힌 수업을 옮기려면 수업을 눌러 <b>스케줄 변경 요청</b>을 넣으세요 (수업 10일 전까지).` },
  marks: { tag: '표기 정책', who: '표기해도 확정 수업은<br>사라지지 않습니다',
    short: '확정 수업 위에는 불가 표시를 할 수 없습니다.',
    body: `<b>가능한 시간은 대면·비대면으로 나눠 표기하고, 불가능한 시간은 사유와 함께 표기합니다.</b>
      <span class="no">이미 확정된 수업 시간에는 불가 표시를 할 수 없습니다.</span> 그 시간을 비우려면 먼저 스케줄 변경을 요청해 수업을 옮기세요.
      표기는 2주 단위로 <span class="yes">최소 1주 전</span>에 등록하고, 불가 사유는 15자 이상 적습니다.` },
  reports: { tag: '리포트 정책', who: '승인된 리포트만<br>학부모에게 나갑니다',
    short: '60자 · 세 가지 · 교재는 정식 명칭.',
    body: `<b>리포트는 수업이 끝나면 반드시 작성합니다.</b> 60자 이상 · 진행 내용/학생 반응/다음 계획 세 가지 ·
      교재는 줄임말 없이 정식 명칭으로 씁니다. 작성한 리포트는 바로 학부모에게 가지 않고 <span class="yes">관리자 승인</span>을 거칩니다.
      <span class="yes">강사료는 쓰는 순간 정산에 들어갑니다</span> — 반려되거나 승인이 늦어도 깎이지 않습니다.
      제출하면 <b>전건이 승인 큐</b>에 올라가고, 승인 흐름과 급여는 서로 묶이지 않습니다.` },
  guide: { tag: '수업 안내 정책', who: '학생 명부·결제는<br>강사 화면에 없습니다',
    short: '전부 관리자가 채운 읽기 전용입니다.',
    body: `<b>이 화면의 값은 전부 관리자가 채웁니다.</b> 강사는 읽기 전용이고, 담당이 아닌 학생은 조회되지 않습니다.
      교재를 바꿔야 하면 <span class="yes">교재 변경 요청</span>으로 사유를 남기세요.` },
  history: { tag: '조회 범위', who: '보관은 계속<br>조회는 1달',
    short: '직전 급여 1건까지만 열립니다.',
    body: `<b>강사에게는 직전 급여 1건과, 그 급여에 포함된 수업만 보입니다.</b>
      그 이전 기록은 <span class="yes">삭제되지 않고 보관</span>되지만 강사 화면에서는 열리지 않으며,
      <span class="no">매니저 이상만</span> 전체 기간을 조회합니다. 시급은 관리자가 정한 값과 적용일만 보이고 강사는 고칠 수 없습니다.` },
  feedback: { tag: '건의 정책', who: '급한 일은<br>강사 단톡방으로',
    short: '한 달 3회까지 · 관리자만 봅니다.',
    body: `<b>건의는 한 달에 3회까지 넣을 수 있습니다.</b> 수업·시급·스케줄·기타 네 분류로 관리자에게 바로 전달되며
      다른 강사에게는 보이지 않습니다.` },
};
function policyBar(key) {
  const p = POLICY[key]; if (!p) return '';
  const open = !!UI.polOpen[key];
  // 넓은 화면은 전문을 항상 펼치고, 좁은 화면은 한 줄로 접었다 편다.
  return `<button class="policy" onclick="UI.polOpen['${key}']=${!open};render()" aria-expanded="${open}">
    <span class="tag">${p.tag}</span>
    <span class="bd"><span class="pol-full">${p.body}</span><span class="pol-short"><b>${p.short}</b></span>
      <span class="fold">${open ? '접기 ▲' : '정책 전문 보기 ▼'}</span></span>
    <span class="who">${p.who}</span></button>`;
}

/* ══ ② 차감은 정책보다 위에, 더 큰 글씨로 ══════════════════ */
function penaltyBar(mini) {
  const amt = n => (n ? '− ' + n.toLocaleString('ko-KR') : '0원');
  if (mini) return `<button class="penalty mini" onclick="go('reports')">
    <span class="bd"><span class="lead">리포트 늦으면 강의료 차감</span>
      <span class="sub">눌러서 안 쓴 리포트 보기 ›</span></span>
    <span class="cases">
      <span class="case"><span class="w">1시간↑</span><span class="a">${amt(5000)}</span></span>
      <span class="case"><span class="w">4시간↑</span><span class="a">${amt(10000)}</span></span></span></button>`;
  const cases = PENALTY_RULE.map(r => `<div class="case ${r.amount ? '' : 'ok'}">
    <div class="w">${r.when}</div><div class="a">${amt(r.amount)}</div></div>`).join('');
  return `<div class="penalty">
    <div class="bd"><div class="lead">리포트를 늦게 쓰면 강의료가 깎입니다</div>
      <div class="sub"><b>수업이 끝난 시각</b>부터 셉니다 — 1시간을 넘기면 5,000원, 4시간을 넘기면 10,000원이고
        그 위로는 더 늘지 않습니다. 차감은 회계 정산과 급여 시수에 <b>자동으로</b> 반영됩니다.
        <b>쓰기만 하면 정산에 들어갑니다</b> — 승인 여부는 보지 않습니다.</div></div>
    <div class="cases">${cases}</div></div>`;
}
const PENALTY_PAGES = ['home', 'reports', 'history'];

/* ── 셸 렌더 ── */
function crumb() {
  const parts = ['홈'];
  if (UI.page !== 'home') parts.push(PAGE_NAME[UI.page] || SUB_NAME[UI.page] || '');
  return parts.map((p, i) => i === parts.length - 1
    ? `<span>${esc(p)}</span>`
    : `<span class="dim">${esc(p)}</span><span class="sep">›</span>`).join('');
}
const SUB_NAME = { more: '더보기', policy: '정책 모아보기', me: '내 정보' };

const VIEWS = {};   // views-*.js 가 채운다

function render() {
  const miss = missingReports().length, pend = pendingReports().length;
  const page = UI.page;
  const body = (VIEWS[page] || (() => '<div class="empty"><b>준비 중입니다</b></div>'))();
  const head = (PENALTY_PAGES.includes(page) ? penaltyBar(page === 'home') : '') + policyBar(page);

  $('sidebar').innerHTML = `
    <div class="brand"><div class="mark">TN</div>
      <div class="txt"><div class="t1">TACO ERP</div><div class="t2">TN Academy</div></div></div>
    <nav class="nav">
      ${MENU.map(m => `<button class="${page === m.key ? 'on' : ''}" onclick="go('${m.key}')" title="${m.label}">
        <span class="ic">${m.ic}</span><span class="lb">${m.label}</span>
        ${m.key === 'reports' && miss ? `<span class="cnt">${miss}</span>` : ''}</button>`).join('')}
    </nav>
    <button class="me" onclick="openModal('tz')" title="시간대 · 시급">
      <div class="av">범준</div>
      <div class="txt"><div class="n">${ME.name}</div>
        <div class="r ${tzPendingActive() || ME.ratePending ? 'wait' : ''}">
          ${tzPendingActive() || ME.ratePending ? '승인 대기 ●' : ME.tzLabel.split(' · ')[0] + ' · ' + won(ME.rate)}</div></div></button>`;

  const tzWait = tzPendingActive(), rateWait = !!ME.ratePending;
  $('topbar').innerHTML = `
    <button class="iconbtn home-btn" onclick="back()" ${canBack() ? '' : 'disabled'} title="뒤로 가기 (ESC)" aria-label="뒤로 가기">‹</button>
    <button class="btn sm home-btn" onclick="goHome()">홈으로</button>
    <div class="crumb">${crumb()}</div>
    <div class="m-title">${page === 'home' ? esc(ME.name) + ' 님' : esc(PAGE_NAME[page] || SUB_NAME[page] || '')}</div>
    <div class="sp"></div>
    <button class="chip ${tzWait ? 'amber' : 'gray'} tz-chip" onclick="openModal('tz')" title="시간대 변경 요청">
      🌐 ${tzWait ? '시간대 승인 대기 ●' : ME.tzLabel.split(' · ')[0]}</button>
    <button class="chip ${rateWait ? 'amber' : 'gray'} tz-chip" onclick="openModal('rate')" title="시급 변경 신청">
      ${rateWait ? '시급 승인 대기 ●' : won(ME.rate) + '/시간'}</button>
    <div class="who">${ME.name} <span>· ${ME.role}</span></div>
    <button class="iconbtn" onclick="go('reports')" title="알림" aria-label="알림">🔔
      ${miss + pend ? `<span class="dot">${miss + pend}</span>` : ''}</button>`;

  $('scroll').innerHTML = `<div class="stack">${head}${body}</div>`;

  $('tabbar').innerHTML = TABS.map(t => `<button class="${tabOf(page) === t.key ? 'on' : ''}"
    onclick="go('${t.key}')"><span class="ic">${t.ic}</span><span class="lb">${t.label}</span>
    ${t.key === 'reports' && miss ? `<span class="cnt">${miss}</span>` : ''}</button>`).join('');

  renderLayer();
}

/* ── 패널(드로어·시트) / 모달 ── */
function renderLayer() {
  const p = $('panel'), sc = $('scrim'), md2 = $('modalHost');
  if (UI.modal) { md2.innerHTML = modalHtml(); md2.hidden = false; sc.classList.add('on'); }
  else { md2.hidden = true; md2.innerHTML = ''; }
  if (UI.panel != null) {
    p.innerHTML = panelHtml();
    p.hidden = false;
    requestAnimationFrame(() => { p.classList.add('on'); sc.classList.add('on'); });
  } else {
    p.classList.remove('on');
    if (!UI.modal) sc.classList.remove('on');
    setTimeout(() => { if (UI.panel == null) { p.hidden = true; p.innerHTML = ''; } }, 280);
  }
}
function closePanel(silent) { UI.panel = null; if (!silent) renderLayer(); }
function closeModal() { UI.modal = null; renderLayer(); }
function onScrim() { if (UI.modal) closeModal(); else closePanel(); }

/* ESC — 드로어가 열려 있으면 닫고, 닫혀 있으면 뒤로 (v20 s3) */
document.addEventListener('keydown', e => { if (e.key === 'Escape') back(); });
/* 폭이 바뀌면 배치가 바뀌므로 열려 있던 패널을 닫고 다시 그린다 */
MQ_MOBILE.addEventListener('change', () => { closePanel(true); UI.modal = null; render(); });
