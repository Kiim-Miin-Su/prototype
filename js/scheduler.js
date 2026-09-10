/** @file-guide
 * 목적: scheduler.js (historical)
 * 책임/재사용: 읽기 전용 당시 자료다. 현행 명세/구현 근거로 복사하지 않고 최신 docs/CLAUDE.md와 원본을 대조한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/* ══════════════════════════════════════════════════════════════════════════
   scheduler.js — 관리자 리소스 캘린더 (여러 명을 한 화면에서)
   ──────────────────────────────────────────────────────────────────────────
   구현하는 규칙
     docs/CALENDAR.md §2.5  셀을 진짜로 반복해서 그린다 · 세로선
     docs/CALENDAR.md §4.5  라벨 실측 티어 — 겹침 0 · 넘침 0
     docs/CALENDAR.md §5    드래그앤드롭 · 클립보드
     docs/CALENDAR.md §5A   반복 일정 편집 범위 (이번만 · 향후 · 모두)
     docs/CALENDAR.md §5A.5 시나리오 C-1 ~ C-12

   판정은 전부 남의 것을 쓴다. 이 파일에는 규칙이 없다.
     RECUR.*  반복 규칙 · 범위 적용 · 선검사       (js/recurrence.js)
     GUARD.*  자원 충돌 5종                        (js/guard.js)
   ══════════════════════════════════════════════════════════════════════════ */

/* ── 시드 ───────────────────────────────────────────────────────────── */
const STAFF = [
  { id: 11, name: '김민수', role: 'inst' },
  { id: 12, name: '박지연', role: 'inst' },
  { id: 13, name: '이서준', role: 'inst' },
  { id: 14, name: '최윤호', role: 'inst' },
];
const ROOM = [
  { id: 201, name: 'A동 201호' }, { id: 202, name: 'A동 202호' }, { id: 301, name: 'B동 301호' },
];
const STU = [
  { id: 101, name: '한지우' }, { id: 102, name: '오세영' }, { id: 103, name: '정다인' },
  { id: 104, name: '문가온' }, { id: 105, name: '배시우' },
];
const KIND_LABEL = { regular: '정규', trial: '체험', group: '그룹', kinder: '유치부', assess: '진단' };

const MON = '2026-08-17';                       // 이 주의 월요일
const TODAY = '2026-08-19';

let STATE = {
  SER: [
    { id: 1, kind: 'regular', mode: 'offline', title: '수학 A', teacherId: 11, roomId: 201,
      startMin: 600, endMin: 660, rrule: 'WEEKLY:MO,WE', fromDate: '2026-08-03', toDate: null },
    { id: 2, kind: 'regular', mode: 'offline', title: '영어 B', teacherId: 12, roomId: 202,
      startMin: 660, endMin: 750, rrule: 'WEEKLY:MO,TH', fromDate: '2026-08-03', toDate: null },
    { id: 3, kind: 'group', mode: 'offline', title: '국어 그룹', teacherId: 13, roomId: 301,
      startMin: 840, endMin: 930, rrule: 'WEEKLY:TU,TH', fromDate: '2026-08-04', toDate: null },
    { id: 4, kind: 'trial', mode: 'online', title: '체험 상담', teacherId: 14, roomId: null,
      startMin: 780, endMin: 840, rrule: 'ONCE', fromDate: '2026-08-19', toDate: '2026-08-19' },
    { id: 5, kind: 'assess', mode: 'offline', title: '진단 평가', teacherId: 11, roomId: 202,
      startMin: 900, endMin: 990, rrule: 'WEEKLY:FR', fromDate: '2026-08-07', toDate: null },
    { id: 6, kind: 'kinder', mode: 'offline', title: '유치부', teacherId: 12, roomId: 201,
      startMin: 540, endMin: 600, rrule: 'WEEKLY:TU,WE,TH', fromDate: '2026-08-04', toDate: null },
  ],
  SER_STU: [
    { serId: 1, studentId: 101 }, { serId: 1, studentId: 102 },
    { serId: 2, studentId: 103 },
    { serId: 3, studentId: 101 }, { serId: 3, studentId: 104 }, { serId: 3, studentId: 105 },
    { serId: 4, studentId: 105 },
    { serId: 5, studentId: 102 }, { serId: 6, studentId: 104 },
  ],
  EXC: [
    { id: 900, serId: 2, onDate: '2026-08-20', canceled: false, newDate: null,
      startMin: null, endMin: null, teacherId: 13, roomId: null, reason: '강사 교체' },
    { id: 901, serId: 1, onDate: '2026-08-24', canceled: true, newDate: null,
      startMin: null, endMin: null, teacherId: null, roomId: null, reason: '휴강' },
  ],
};
/* 강사가 등록한 불가 시간 · 코디네이터 예약 — guard 의 ctx 재료 */
const UNAV = [{ id: 1, instructorId: 13, dow: 3, startMin: 1020, endMin: 1140, reason: '대학원 수업' }];
const COORD = [{ id: 7001, sessionDate: '2026-08-20', startMin: 960, endMin: 1020,
                 instructorId: null, classroomId: 301, mode: 'offline', studentIds: [103] }];

/* ── 화면 상태 ───────────────────────────────────────────────────────── */
const H0 = 8, H1 = 22;                                  // 08:00 ~ 22:00
const SLOTS = (H1 - H0) * 2;
const SNAP = 15;

const UIS = {
  axis1: 'date', axis2: 'instructor',
  dates: [addD(MON, 2), addD(MON, 3)],                  // 수 · 목
  split: false, focus: 0,
  ratio: .5,
  sel: [],                    // [{serId,onDate,date}]
  clip: null,                 // { items:[], cut:false }
  undo: [],
  paneAxis: [null, { axis1: 'date', axis2: 'room' }],   // 오른쪽 표는 분할 시 자기 축을 가진다
  done: {},                   // 시나리오 통과 표시
};

function addD(s, n) { return RECUR.addD(s, n); }
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtMin = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const dLabel = d => `${+d.slice(5, 7)}/${+d.slice(8, 10)} (${RECUR.DOW_KO[RECUR.dow(d)]})`;
const staffOf = id => STAFF.find(s => s.id === id);
const roomOf = id => ROOM.find(r => r.id === id);

let toastT;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600);
}

/* ── 축 → 값 목록 ───────────────────────────────────────────────────── */
function axisValues(axis) {
  switch (axis) {
    case 'date':       return UIS.dates.map(d => ({ key: 'date:' + d, label: dLabel(d), date: d }));
    case 'instructor': return STAFF.map(s => ({ key: 'instructor:' + s.id, label: s.name, teacherId: s.id }));
    case 'room':       return ROOM.map(r => ({ key: 'room:' + r.id, label: r.name, roomId: r.id }));
    case 'student':    return STU.map(s => ({ key: 'student:' + s.id, label: s.name, studentId: s.id }));
    case 'subject':    return Object.keys(KIND_LABEL).map(k => ({ key: 'subject:' + k, label: KIND_LABEL[k], kind: k }));
  }
  return [];
}

/** CALENDAR.md §2.2 — 1단 순서를 유지한 카티션 곱 */
function buildLeafColumns(axis1, axis2) {
  const g = axisValues(axis1);
  if (!axis2) return g.map((v, i) => ({ index: i, group: v, leaf: null, isGroupEnd: true }));
  const l = axisValues(axis2);
  const out = [];
  g.forEach(gv => l.forEach((lv, j) => out.push({
    index: out.length, group: gv, leaf: lv, isGroupEnd: j === l.length - 1,
  })));
  return out;
}

/** 회차가 이 컬럼에 그려지는가 */
function inColumn(o, col) {
  const test = v => {
    if (!v) return true;
    if (v.date != null) return o.date === v.date;
    if (v.teacherId != null) return o.teacherId === v.teacherId;
    if (v.roomId != null) return o.roomId === v.roomId;
    if (v.kind != null) return o.kind === v.kind;
    if (v.studentId != null) return studentsOf(o.serId).includes(v.studentId);
    return true;
  };
  return test(col.group) && test(col.leaf);
}
const studentsOf = serId => STATE.SER_STU.filter(r => r.serId === serId).map(r => r.studentId);

/** 컬럼이 가리키는 날짜 (1단이든 2단이든) */
const colDate = col => (col.group && col.group.date) || (col.leaf && col.leaf.date) || UIS.dates[0];

/** 컬럼으로 드롭했을 때 바뀌는 필드 — §4.4 의 "무엇이 바뀌는가" */
function patchFromColumn(col) {
  const p = {};
  [col.group, col.leaf].forEach(v => {
    if (!v) return;
    if (v.teacherId != null) p.teacherId = v.teacherId;
    if (v.roomId != null) p.roomId = v.roomId;
    if (v.date != null) p.date = v.date;
  });
  return p;
}
function axisNote(col) {
  const bits = [];
  [col.group, col.leaf].forEach(v => {
    if (!v) return;
    if (v.teacherId != null) bits.push(`담당 강사 → ${staffOf(v.teacherId).name}`);
    if (v.roomId != null) bits.push(`강의실 → ${roomOf(v.roomId).name}`);
    if (v.studentId != null) bits.push('학생 축 — 참가 학생이 바뀝니다');
    if (v.kind != null) bits.push('종류 축 — 수업 종류가 바뀝니다');
  });
  return bits.join(' · ');
}

/* ── guard ctx ──────────────────────────────────────────────────────── */
function ctxOf(date, excludeSerId) {
  const classes = RECUR.occ(date, STATE)
    .filter(o => o.serId !== excludeSerId)
    .map(o => ({
      id: o.serId, date: o.date, startMin: o.startMin, endMin: o.endMin,
      instructorId: o.teacherId, classroomId: o.roomId, zoomAccountId: o.mode === 'online' ? 'zoom-1' : null,
      mode: o.mode, studentIds: studentsOf(o.serId), subject: o.title, canceled: false,
    }));
  return { classes, coordSessions: COORD, blocks: UNAV };
}
function candOf(o, patch) {
  const p = patch || {};
  const date = p.date || o.date;
  return {
    id: o.serId, date,
    startMin: p.startMin != null ? p.startMin : o.startMin,
    endMin: p.endMin != null ? p.endMin : o.endMin,
    instructorId: p.teacherId != null ? p.teacherId : o.teacherId,
    classroomId: p.roomId !== undefined ? p.roomId : o.roomId,
    mode: o.mode, zoomAccountId: o.mode === 'online' ? 'zoom-1' : null,
    studentIds: studentsOf(o.serId),
  };
}

/* ══════════════════════════════════════════════════════════════════════
   렌더
   ══════════════════════════════════════════════════════════════════════ */
const ADMIN_TABS = ['스케줄', '학생', '강사', '리포트', '수업 현황판', '회계', '승인 대기함', '설정'];

function renderShell() {
  $('tabs').innerHTML = ADMIN_TABS.map((t, i) =>
    `<button ${i === 0 ? 'aria-current="page"' : ''}>${esc(t)}</button>`).join('');
  $('who').textContent = '교수실장 · money 권한 있음';

  $('filterbar').innerHTML = `
    <span class="target">● ${UIS.split ? (UIS.focus === 0 ? '왼쪽' : '오른쪽') + ' 표 선택됨' : '단일 표'}</span>
    <label>1단</label>${sel('axis1', ['date', 'instructor', 'room', 'student', 'subject'], axisOf().axis1)}
    <label>2단</label>${sel('axis2', ['instructor', 'room', 'student', 'subject', 'date'], axisOf().axis2)}
    <button class="btn" onclick="swapAxis()">⇄</button>
    <label>날짜</label>
    <input type="date" value="${UIS.dates[0]}" onchange="setDate(0,this.value)">
    <input type="date" value="${UIS.dates[1]}" onchange="setDate(1,this.value)">
    <button class="btn" onclick="toggleSplit()">${UIS.split ? '분할 해제' : '표 분할'}</button>
    <span class="spacer"></span>
    <span class="hint">
      드래그 이동 · <kbd>Ctrl</kbd>+드래그 복제 · <kbd>Ctrl</kbd><kbd>C</kbd>/<kbd>V</kbd> ·
      <kbd>Del</kbd> 삭제 · <kbd>Ctrl</kbd><kbd>Z</kbd> 되돌리기
    </span>`;
}
function axisOf(i) {
  const k = i == null ? UIS.focus : i;
  return (UIS.split && k === 1) ? UIS.paneAxis[1] : { axis1: UIS.axis1, axis2: UIS.axis2 };
}
function sel(name, opts, cur) {
  return `<select onchange="setAxis('${name}',this.value)">` +
    opts.map(o => `<option value="${o}" ${o === cur ? 'selected' : ''}>${AXIS_KO[o]}</option>`).join('') +
    `</select>`;
}
const AXIS_KO = { date: '날짜', instructor: '강사', room: '강의실', student: '학생', subject: '종류' };

function setAxis(which, v) {
  const t = (UIS.split && UIS.focus === 1) ? UIS.paneAxis[1] : UIS;
  if (which === 'axis1' && t.axis2 === v) { toast('1단과 2단에 같은 축을 넣을 수 없습니다'); return render(); }
  if (which === 'axis2' && t.axis1 === v) { toast('1단과 2단에 같은 축을 넣을 수 없습니다'); return render(); }
  t[which] = v; render();
}
function swapAxis() {
  const t = (UIS.split && UIS.focus === 1) ? UIS.paneAxis[1] : UIS;
  const a = t.axis1; t.axis1 = t.axis2; t.axis2 = a; render();
}
function setDate(i, v) { UIS.dates[i] = v; render(); }
function toggleSplit() {
  UIS.split = !UIS.split;
  if (UIS.split) UIS.paneAxis[1] = { ...axisOf(0) };   // §4.1 — 왼쪽 상태를 복제해서 시작
  UIS.focus = 0; render();
}

function render() {
  renderShell();
  const n = UIS.split ? 2 : 1;
  let html = '';
  for (let i = 0; i < n; i++) {
    html += paneHtml(i);
    if (UIS.split && i === 0) html += `<div class="divider" onpointerdown="startDivider(event)"></div>`;
  }
  $('panes').innerHTML = html;
  for (let i = 0; i < n; i++) measureTier(i);
  renderClipbar();
  renderRunner();
}

function paneHtml(i) {
  const ax = axisOf(i);
  const cols = buildLeafColumns(ax.axis1, ax.axis2);
  const tpl = `var(--gutter-w) repeat(${cols.length}, minmax(var(--col-min),1fr))`;
  const groups = [];
  cols.forEach(c => {
    const last = groups[groups.length - 1];
    if (last && last.key === c.group.key) last.n++;
    else groups.push({ key: c.group.key, label: c.group.label, n: 1 });
  });

  const head =
    `<div class="ghead" style="--tpl:${tpl}">` +
      (ax.axis2 ? `<div class="gh gutter g1"></div>` + groups.map((g, gi) =>
        `<div class="gh g1 ${gi === groups.length - 1 ? 'last' : ''}" style="grid-column:span ${g.n}">
           <span class="trunc">${esc(g.label)}</span>
           <span class="n">컬럼 ${g.n}</span></div>`).join('') : '') +
      `<div class="gh gutter"></div>` +
      cols.map(c => {
        const nm = c.leaf ? c.leaf.label : c.group.label;
        const sub = c.leaf ? c.group.label : countIn(c, cols) + '건';
        return `<div class="gh ${c.isGroupEnd ? 'groupend' : ''}">
          <span class="nm trunc" title="${esc(nm)}">${esc(nm)}</span>
          <span class="sub trunc">${esc(sub)}</span></div>`;
      }).join('') +
    `</div>`;

  const ticks = [];
  for (let h = H0; h < H1; h++) ticks.push(`<div class="tk">${String(h).padStart(2, '0')}:00</div>`);

  const body =
    `<div class="gbody" style="--tpl:${tpl}">` +
      `<div class="gutter">${ticks.join('')}</div>` +
      cols.map(c => colHtml(c, i)).join('') +
    `</div>`;

  const w = UIS.split ? `flex:${i === 0 ? UIS.ratio : 1 - UIS.ratio}` : 'flex:1';
  return `<section class="pane ${UIS.focus === i && UIS.split ? 'focused' : ''}" data-pane="${i}"
            style="${w}" onpointerdown="focusPane(${i})" tabindex="0">
      <div class="pane-head">
        <span class="tag">${i === 0 ? '왼쪽' : '오른쪽'}</span>
        <span>${AXIS_KO[ax.axis1]}${ax.axis2 ? ' › ' + AXIS_KO[ax.axis2] : ''}</span>
        <span class="cnt" style="margin-left:auto">컬럼 ${cols.length}개</span>
      </div>
      <div class="grid-wrap">${head}${body}</div>
    </section>`;
}

function countIn(col) {
  return RECUR.occ(colDate(col), STATE).filter(o => inColumn(o, col)).length;
}

/* §2.5 — 셀을 진짜로 반복해서 그린다 */
function colHtml(col, pane) {
  const date = colDate(col);
  const cells = [];
  for (let s = 0; s < SLOTS; s++) {
    const min = H0 * 60 + s * 30;
    const unav = col.leaf && col.leaf.teacherId != null && UNAV.some(b =>
      b.instructorId === col.leaf.teacherId && b.dow === RECUR.dow(date) &&
      GUARD.overlaps(min, min + 30, b.startMin, b.endMin));
    cells.push(`<div class="cell ${min % 60 === 0 ? 'hour' : ''} ${unav ? 'unav' : ''}"
      data-min="${min}"></div>`);
  }
  const blocks = RECUR.occ(date, STATE).filter(o => inColumn(o, col)).map(o => blkHtml(o, col, pane));
  return `<div class="col ${col.isGroupEnd ? 'groupend' : ''}" data-col="${col.index}" data-pane="${pane}"
            data-date="${date}" onpointerdown="onColDown(event)">${cells.join('')}${blocks.join('')}</div>`;
}

function blkHtml(o, col, pane) {
  const ser = STATE.SER.find(s => s.id === o.serId);
  const top = (o.startMin - H0 * 60) / 30 * slotH();
  const h = Math.max(10, (o.endMin - o.startMin) / 30 * slotH());
  const isSel = UIS.sel.some(s => s.serId === o.serId && s.onDate === o.onDate);
  const rep = RECUR.parseRule(ser.rrule).freq !== 'ONCE';
  const tiny = h < 30, one = h < 44;
  const st = staffOf(o.teacherId), rm = roomOf(o.roomId);
  return `<div class="blk ${isSel ? 'sel' : ''} ${o.isException ? 'exc' : ''} ${rep ? 'rep' : ''}
      ${tiny ? 'tiny' : ''} ${one ? 'one' : ''}"
      data-ser="${o.serId}" data-on="${o.onDate}" data-date="${o.date}" data-pane="${pane}"
      data-kind="${o.kind}" data-mode="${o.mode}"
      style="top:${top}px;height:${h}px"
      title="${esc(o.title)} ${fmtMin(o.startMin)}–${fmtMin(o.endMin)}${st ? ' · ' + st.name : ''}${rm ? ' · ' + rm.name : ''}">
      <div class="hnd top"></div>
      <span class="t trunc">${esc(o.title)}</span>
      <span class="m trunc">${fmtMin(o.startMin)}–${fmtMin(o.endMin)}</span>
      <span class="m2 trunc">${esc((st ? st.name : '미배정') + (rm ? ' · ' + rm.name : ' · 온라인'))}</span>
      <div class="hnd bot"></div>
    </div>`;
}
function slotH() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--slot-h');
  return parseFloat(v) || 30;
}

/* §4.5 — 컬럼 폭을 재서 티어를 내린다 */
function measureTier(i) {
  const pane = document.querySelector(`.pane[data-pane="${i}"]`);
  if (!pane) return;
  const col = pane.querySelector('.col');
  const w = col ? col.getBoundingClientRect().width : 999;
  pane.dataset.tier = w >= 168 ? 'l' : w >= 132 ? 'm' : w >= 104 ? 's' : 'xs';
  pane.dataset.colw = Math.round(w);
  // §4.5 — 하한에 걸려 가로 스크롤이 생기면 경고한다. 조용히 잘리게 두지 않는다.
  const wrap = pane.querySelector('.grid-wrap');
  const over = wrap.scrollWidth > wrap.clientWidth + 1;
  const cnt = pane.querySelector('.pane-head .cnt');
  const n = pane.querySelectorAll('.col').length;
  if (cnt) cnt.outerHTML = over
    ? `<span class="xscroll cnt">컬럼 ${n}개 → 가로 스크롤</span>`
    : `<span class="cnt" style="margin-left:auto">컬럼 ${n}개</span>`;
}
window.addEventListener('resize', () => { render(); });

function focusPane(i) { if (UIS.focus !== i) { UIS.focus = i; render(); } }

/* ── 표 분할 divider ────────────────────────────────────────────────── */
function startDivider(e) {
  e.preventDefault();
  const host = $('panes'), r = host.getBoundingClientRect();
  const move = ev => {
    UIS.ratio = Math.min(.8, Math.max(.2, (ev.clientX - r.left) / r.width));
    const p = document.querySelectorAll('.pane');
    if (p[0]) p[0].style.flex = UIS.ratio; if (p[1]) p[1].style.flex = 1 - UIS.ratio;
    measureTier(0); measureTier(1);
  };
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
}

/* ══════════════════════════════════════════════════════════════════════
   드래그 — 이동 · 리사이즈 · 복제 · 새 일정   (C-1 ~ C-7)
   ══════════════════════════════════════════════════════════════════════ */
let DRAG = null;

function colRects(pane) {
  return [...document.querySelectorAll(`.col[data-pane="${pane}"]`)].map(el => ({
    el, idx: +el.dataset.col, r: el.getBoundingClientRect(),
  }));
}
function hitCol(rects, x) {
  return rects.find(c => x >= c.r.left && x < c.r.right) || rects[0];
}
function minAt(rect, y) {
  const raw = H0 * 60 + (y - rect.top) / slotH() * 30;
  return Math.max(H0 * 60, Math.min(H1 * 60 - SNAP, Math.round(raw / SNAP) * SNAP));
}

function onColDown(e) {
  if (e.button !== 0) return;
  const blk = e.target.closest('.blk');
  const pane = +e.currentTarget.dataset.pane;
  focusPane(pane);
  if (blk) return onBlockDown(e, blk, pane);
  startCreate(e, pane);                                   // C-5 빈 칸 드래그
}

function onBlockDown(e, blk, pane) {
  e.preventDefault(); e.stopPropagation();
  const serId = +blk.dataset.ser, onDate = blk.dataset.on;
  const o = RECUR.occ(blk.dataset.date, STATE).find(x => x.serId === serId && x.onDate === onDate);
  if (!o) return;

  // 선택 (C-7 다중 선택)
  const key = { serId, onDate, date: blk.dataset.date };
  if (e.shiftKey || (e.ctrlKey && !e.altKey && e.type === 'pointerdown' && e.detail === 0)) { /* noop */ }
  if (e.shiftKey) {
    if (!UIS.sel.some(s => s.serId === serId && s.onDate === onDate)) UIS.sel.push(key);
  } else if (!UIS.sel.some(s => s.serId === serId && s.onDate === onDate)) {
    UIS.sel = [key];
  }
  document.querySelectorAll('.blk').forEach(b => b.classList.toggle('sel',
    UIS.sel.some(s => s.serId === +b.dataset.ser && s.onDate === b.dataset.on)));

  const mode = e.target.classList.contains('hnd')
    ? (e.target.classList.contains('top') ? 'top' : 'bot') : 'move';
  const rects = colRects(pane);
  const home = rects.find(c => c.el.contains(blk));
  DRAG = {
    kind: mode, o, blk, pane, rects, home,
    grabOffset: minAt(home.r, e.clientY) - o.startMin,
    copy: e.ctrlKey || e.metaKey,
    ghost: null, moved: false, last: null,
  };
  blk.setPointerCapture(e.pointerId);
  blk.addEventListener('pointermove', onDragMove);
  blk.addEventListener('pointerup', onDragUp, { once: true });
}

function onDragMove(e) {
  if (!DRAG) return;
  const d = DRAG;
  const col = hitCol(d.rects, e.clientX);
  const m = minAt(col.r, e.clientY);
  let start = d.o.startMin, end = d.o.endMin, target = col;

  if (d.kind === 'move') { start = m - d.grabOffset; end = start + (d.o.endMin - d.o.startMin); }
  else if (d.kind === 'top') { start = Math.min(m, d.o.endMin - SNAP); target = d.home; }
  else { end = Math.max(m, d.o.startMin + SNAP); target = d.home; }
  start = Math.max(H0 * 60, start); end = Math.min(H1 * 60, end);
  if (end - start < 10) return;
  if (!d.moved && Math.abs(start - d.o.startMin) < 1 && target.idx === d.home.idx && d.kind === 'move') return;
  d.moved = true;
  d.blk.classList.add('dragging');

  const ax = axisOf(d.pane);
  const cols = buildLeafColumns(ax.axis1, ax.axis2);
  const patch = { ...patchFromColumn(cols[target.idx]), startMin: start, endMin: end };
  if (d.kind !== 'move') { delete patch.teacherId; delete patch.roomId; delete patch.date; }
  d.last = { target, patch, cols };

  const cand = candOf(d.o, patch);
  const g = GUARD.guardResource(cand, ctxOf(patch.date || d.o.date, d.copy ? -1 : d.o.serId));
  const note = d.kind === 'move' ? axisNote(cols[target.idx]) : '';
  drawGhost(target.el, start, end, g, note, d.copy);
}

function drawGhost(colEl, start, end, g, note, copy) {
  clearGhost();
  const el = document.createElement('div');
  el.className = 'ghost' + (g && !g.ok ? ' bad' : '') + (copy ? ' copy' : '');
  el.style.top = ((start - H0 * 60) / 30 * slotH()) + 'px';
  el.style.height = Math.max(14, (end - start) / 30 * slotH()) + 'px';
  const msg = g && !g.ok ? g.blocking[0].message : (g && g.warnings.length ? g.warnings[0].message : note);
  el.innerHTML = `${copy ? '복제 ' : ''}${fmtMin(start)}–${fmtMin(end)}` +
    (msg ? `<span class="note trunc">${esc(msg)}</span>` : '');
  colEl.appendChild(el);
  DRAG.ghost = el;
}
function clearGhost() { document.querySelectorAll('.ghost').forEach(e => e.remove()); }

function onDragUp(e) {
  const d = DRAG; DRAG = null;
  if (!d) return;
  d.blk.removeEventListener('pointermove', onDragMove);
  d.blk.classList.remove('dragging');
  clearGhost();
  if (!d.moved || !d.last) { render(); return; }

  const { patch } = d.last;
  if (d.copy) return commitCopy(d.o, patch);                    // C-6
  if (UIS.sel.length > 1 && d.kind === 'move') return commitMulti(d, patch); // C-7
  commitEdit(d.o, patch, d.kind === 'move' ? 'move' : 'resize');            // C-1 ~ C-4
}

/* 빈 칸 드래그 → 새 일정 (C-5). 새 일정은 묻지 않는다. */
function startCreate(e, pane) {
  const rects = colRects(pane);
  const col = hitCol(rects, e.clientX);
  const a = minAt(col.r, e.clientY);
  const el = document.createElement('div');
  el.className = 'draft'; col.el.appendChild(el);
  const paint = b => {
    const s = Math.min(a, b), t = Math.max(a, b) + (b === a ? 60 : 0);
    el.style.top = ((s - H0 * 60) / 30 * slotH()) + 'px';
    el.style.height = Math.max(14, (t - s) / 30 * slotH()) + 'px';
    el.textContent = `${fmtMin(s)}–${fmtMin(t)}`;
    return [s, t];
  };
  let span = paint(a);
  const move = ev => { span = paint(minAt(col.r, ev.clientY)); };
  const up = () => {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
    el.remove();
    if (span[1] - span[0] < SNAP) { render(); return; }
    const ax = axisOf(pane), cols = buildLeafColumns(ax.axis1, ax.axis2);
    const p = patchFromColumn(cols[col.idx]);
    const date = p.date || col.el.dataset.date;
    const draft = { date, startMin: span[0], endMin: span[1], kind: 'regular', mode: 'offline',
                    title: '새 일정', teacherId: p.teacherId ?? STAFF[0].id, roomId: p.roomId ?? null, students: [] };
    const g = GUARD.guardResource(candOf({ ...draft, serId: -1, date }, {}), ctxOf(date, -1));
    if (!g.ok) return conflictDialog({ ok: false, dates: [{ date, reasons: g.blocking.map(b => b.message) }] });
    push(); STATE = RECUR.applyCreate(STATE, { draft });
    toast(`새 일정 — ${dLabel(date)} ${fmtMin(draft.startMin)}–${fmtMin(draft.endMin)}`);
    mark('C-5'); render();
  };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
}

/* ══════════════════════════════════════════════════════════════════════
   저장 — 반복이면 범위를 묻는다 (§5A)
   ══════════════════════════════════════════════════════════════════════ */
function push() { UIS.undo.push(JSON.parse(JSON.stringify(STATE))); if (UIS.undo.length > 30) UIS.undo.shift(); }

function commitEdit(o, patch, op) {
  const ser = STATE.SER.find(s => s.id === o.serId);
  const scopes = RECUR.scopesFor(ser, o.onDate);
  const run = scope => {
    const pre = RECUR.precheck(STATE, { serId: o.serId, onDate: o.onDate, scope,
      patch, today: TODAY, guard: (c, ctx) => GUARD.guardResource(c, ctx),
      ctxOf: d => ctxOf(d, o.serId) });
    if (!pre.ok) return conflictDialog(pre);
    push();
    STATE = RECUR.applyEdit(STATE, { serId: o.serId, onDate: o.onDate, scope,
      patch: { ...patch, __onDate: o.onDate } });
    toast(`${op === 'resize' ? '길이 변경' : '이동'} — ${RECUR.SCOPE_LABEL[scope] || '적용'}\n${STATE.__log.join(' · ')}`);
    mark(op === 'resize' ? 'C-3' : (patch.teacherId != null || patch.roomId != null ? 'C-4' : (scopes.length ? 'C-2' : 'C-1')));
    render();
  };
  if (!scopes.length) return run('this');                       // 단발 — 묻지 않는다
  scopeDialog({ ser, onDate: o.onDate, scopes, patch, title: op === 'resize' ? '길이를 바꿉니다' : '일정을 옮깁니다', run });
}

function commitCopy(o, patch) {                                  // C-6 Ctrl+드래그
  const ser = STATE.SER.find(s => s.id === o.serId);
  const scopes = RECUR.scopesFor(ser, o.onDate);
  const item = RECUR.copyPayload(STATE, o);
  const run = scope => {
    push();
    STATE = RECUR.applyPaste(STATE, { items: item, targetDate: patch.date || o.date,
      targetMin: patch.startMin, patch, scope });
    toast(`복제 — ${RECUR.SCOPE_LABEL[scope]}\n${STATE.__log.join(' · ')}`);
    mark('C-6'); render();
  };
  if (!scopes.length) return run('this');
  scopeDialog({ ser, onDate: o.onDate, scopes, patch, title: '복제할 범위', paste: true, run });
}

function commitMulti(d, patch) {                                 // C-7 다중 이동
  const dm = patch.startMin - d.o.startMin;
  const items = UIS.sel.slice();
  const anyRep = items.some(s => {
    const ser = STATE.SER.find(x => x.id === s.serId);
    return RECUR.scopesFor(ser, s.onDate).length > 0;
  });
  const run = scope => {
    push();
    items.forEach(s => {
      const oc = RECUR.occ(s.date, STATE).find(x => x.serId === s.serId && x.onDate === s.onDate);
      if (!oc) return;
      const p = { startMin: oc.startMin + dm, endMin: oc.endMin + dm, __onDate: s.onDate };
      if (patch.date) p.date = patch.date;
      const ser = STATE.SER.find(x => x.id === s.serId);
      const sc = RECUR.scopesFor(ser, s.onDate).length ? scope : 'this';
      STATE = RECUR.applyEdit(STATE, { serId: s.serId, onDate: s.onDate, scope: sc, patch: p });
    });
    toast(`${items.length}건 이동 — ${RECUR.SCOPE_LABEL[scope] || '적용'}`);
    mark('C-7'); render();
  };
  if (!anyRep) return run('this');
  scopeDialog({ ser: STATE.SER.find(x => x.id === items[0].serId), onDate: items[0].onDate,
    scopes: ['this', 'future', 'all'], patch, title: `${items.length}건을 옮깁니다`, run });
}

/* ══════════════════════════════════════════════════════════════════════
   클립보드 (C-8 · C-9 · C-10)
   ══════════════════════════════════════════════════════════════════════ */
function selOccs() {
  return UIS.sel.map(s => RECUR.occ(s.date, STATE).find(x => x.serId === s.serId && x.onDate === s.onDate))
    .filter(Boolean);
}
function doCopy(cut) {
  const occs = selOccs();
  if (!occs.length) return toast('선택된 일정이 없습니다');
  UIS.clip = { items: RECUR.copyMany(STATE, occs), cut, from: UIS.sel.slice() };
  renderClipbar();
  toast(`${occs.length}건 ${cut ? '잘라내기' : '복사'} — 붙일 칸을 클릭하고 Ctrl+V`);
}
function doPaste() {
  if (!UIS.clip) return toast('클립보드가 비어 있습니다');
  const anchor = UIS.cursor;
  if (!anchor) return toast('붙여넣을 칸을 먼저 클릭하세요');
  const items = UIS.clip.items;
  const first = items[0];
  const src = STATE.SER.find(s => s.id === first.serId);
  const scopes = src ? RECUR.scopesFor(src, first.onDate) : [];
  const run = scope => {
    push();
    if (UIS.clip.cut) {
      UIS.clip.from.forEach(s => { STATE = RECUR.applyDelete(STATE, { serId: s.serId, onDate: s.onDate, scope: 'this' }); });
    }
    STATE = RECUR.applyPaste(STATE, { items, targetDate: anchor.date, targetMin: anchor.min,
      patch: anchor.patch, scope });
    toast(`${items.length}건 붙여넣기 — ${RECUR.SCOPE_LABEL[scope]}\n${STATE.__log.join('\n')}`);
    UIS.clip = null;
    mark(items.length > 1 ? 'C-10' : (scopes.length ? 'C-9' : 'C-8'));
    render();
  };
  if (!scopes.length) return run('this');
  scopeDialog({ ser: src, onDate: first.onDate, scopes, patch: {}, paste: true,
    title: '무엇을 붙여넣습니까', excCount: first.excCount, run });
}
function renderClipbar() {
  const b = $('clipbar');
  if (!UIS.clip) { b.hidden = true; return; }
  b.hidden = false;
  b.innerHTML = `<span>📋 ${UIS.clip.items.length}건 ${UIS.clip.cut ? '잘라내기' : '복사'}됨</span>
    <span style="opacity:.7">칸을 클릭한 뒤 Ctrl+V</span>
    <span style="flex:1"></span>
    <button class="btn" onclick="UIS.clip=null;renderClipbar()">Esc 취소</button>`;
}

/* 커서 — 붙여넣기 기준점 */
document.addEventListener('pointerdown', e => {
  const cell = e.target.closest('.cell');
  if (!cell) return;
  const col = cell.closest('.col');
  const pane = +col.dataset.pane;
  const ax = axisOf(pane), cols = buildLeafColumns(ax.axis1, ax.axis2);
  const c = cols[+col.dataset.col];
  UIS.cursor = { date: patchFromColumn(c).date || col.dataset.date, min: +cell.dataset.min,
                 patch: patchFromColumn(c) };
  document.querySelectorAll('.cell.hot').forEach(x => x.classList.remove('hot'));
  cell.classList.add('hot');
  if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
    UIS.sel = [];
    document.querySelectorAll('.blk.sel').forEach(b => b.classList.remove('sel'));
  }
});

/* ══════════════════════════════════════════════════════════════════════
   다이얼로그
   ══════════════════════════════════════════════════════════════════════ */
const SCOPE_DESC = {
  this:   { edit: '그날 회차에만 예외를 만듭니다. 나머지 회차는 그대로입니다.',
            paste: '붙인 날 하루짜리 단발 일정 1건이 생깁니다.' },
  future: { edit: '이 날부터 끝까지 바뀝니다. 이전 회차는 그대로 남습니다.',
            paste: '반복 규칙을 그대로 가져와 붙인 날부터 이어집니다.' },
  all:    { edit: '전 회차가 바뀝니다. 예외로 만들어 둔 것이 초기화될 수 있습니다.',
            paste: '반복 구간 전체가 날짜 차이만큼 통째로 옮겨 붙습니다.' },
};

function scopeDialog({ ser, onDate, scopes, patch, title, run, paste, excCount }) {
  const d = $('dlg');
  const pv = paste ? { count: 0 } : RECUR.resetPreview(STATE, ser.id, patch, 'all', onDate);
  const warn = paste
    ? (excCount ? `이 일정에 걸린 <b>예외 ${excCount}건은 복사되지 않습니다.</b> 규칙만 복제됩니다.` : '')
    : (pv.count ? `「모든 일정」을 고르면 <b>예외 ${pv.count}건이 초기화됩니다</b> — ${pv.dates.slice(0, 3).join(' · ')}${pv.dates.length > 3 ? ' 외' : ''}. 휴강은 남습니다.` : '');

  d.innerHTML = `
    <h2>${esc(title)}</h2>
    <p class="sub"><b>${esc(ser.title)}</b> · ${esc(RECUR.ruleLabel(ser))} · 기준일 ${dLabel(onDate)}<br>
      반복 일정입니다. 어디까지 ${paste ? '복사' : '반영'}할까요?</p>
    ${warn ? `<div class="warn">${warn}</div>` : ''}
    <div class="scopes">
      ${scopes.map((s, i) => `<button class="scope ${i === 0 ? 'pre' : ''}" data-scope="${s}">
        <span class="k">${RECUR.SCOPE_LABEL[s]}</span>
        <span class="d">${SCOPE_DESC[s][paste ? 'paste' : 'edit']}</span></button>`).join('')}
    </div>
    <div class="foot"><button class="btn" data-close>취소 (Esc)</button></div>`;
  openDlg();
  d.querySelectorAll('.scope').forEach(b => b.onclick = () => { closeDlg(); run(b.dataset.scope); });
  d.querySelector('[data-close]').onclick = () => { closeDlg(); render(); };
  d.querySelector('.scope').focus();                         // 기본 포커스 = 이번만
}

function conflictDialog(pre) {
  const d = $('dlg');
  d.innerHTML = `
    <h2>겹치는 자원이 있어 저장하지 않았습니다</h2>
    <p class="sub">${pre.checked ? `${pre.checked}일을 검사했고 ` : ''}${pre.dates.length}일이 걸립니다.
      강행 옵션은 없습니다 — 자원은 한 번에 하나만 씁니다.</p>
    <div class="bad">${esc(RECUR.conflictSummary(pre) || pre.dates.map(x => `${x.date} — ${x.reasons[0]}`).join('\n'))}</div>
    <div class="foot"><button class="btn pri" data-close>알겠습니다</button></div>`;
  openDlg();
  d.querySelector('[data-close]').onclick = () => { closeDlg(); render(); };
  d.querySelector('[data-close]').focus();
}

function openDlg() { $('scrim2').hidden = false; $('dlg').hidden = false; }
function closeDlg() { $('scrim2').hidden = true; $('dlg').hidden = true; }
$('scrim2').onclick = () => { closeDlg(); render(); };

/* ══════════════════════════════════════════════════════════════════════
   키보드 (§5A.6)
   ══════════════════════════════════════════════════════════════════════ */
document.addEventListener('keydown', e => {
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  const mod = e.ctrlKey || e.metaKey;

  if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); return doCopy(false); }
  if (mod && e.key.toLowerCase() === 'x') { e.preventDefault(); return doCopy(true); }
  if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); return doPaste(); }
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); return undo(); }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); return doDelete(); }
  if (e.key === 'Escape') {
    if (!$('dlg').hidden) { closeDlg(); return render(); }
    if (UIS.sel.length) { UIS.sel = []; return render(); }
    if (UIS.clip) { UIS.clip = null; return renderClipbar(); }
    return;
  }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    if (!UIS.sel.length) return;
    e.preventDefault();
    const s = UIS.sel[0];
    const o = RECUR.occ(s.date, STATE).find(x => x.serId === s.serId && x.onDate === s.onDate);
    if (!o) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const dm = e.key === 'ArrowUp' ? -SNAP : SNAP;
      commitEdit(o, { startMin: o.startMin + dm, endMin: o.endMin + dm }, 'move');
    } else {
      const ax = axisOf(UIS.focus), cols = buildLeafColumns(ax.axis1, ax.axis2);
      const cur = cols.findIndex(c => inColumn(o, c));
      const nx = cols[Math.max(0, Math.min(cols.length - 1, cur + (e.key === 'ArrowLeft' ? -1 : 1)))];
      commitEdit(o, patchFromColumn(nx), 'move');
    }
  }
});

function doDelete() {                                            // C-12
  const occs = selOccs();
  if (!occs.length) return toast('선택된 일정이 없습니다');
  const o = occs[0];
  const ser = STATE.SER.find(s => s.id === o.serId);
  const scopes = RECUR.scopesFor(ser, o.onDate);
  const run = scope => {
    push();
    occs.forEach(x => { STATE = RECUR.applyDelete(STATE, { serId: x.serId, onDate: x.onDate, scope }); });
    toast(`삭제 — ${RECUR.SCOPE_LABEL[scope]}\n${STATE.__log.join(' · ')}`);
    UIS.sel = []; mark('C-12'); render();
  };
  if (!scopes.length) { run('this'); return; }
  scopeDialog({ ser, onDate: o.onDate, scopes, patch: {}, title: '일정을 삭제합니다', run });
}
function undo() {
  if (!UIS.undo.length) return toast('되돌릴 것이 없습니다');
  STATE = UIS.undo.pop(); toast('되돌렸습니다'); render();
}

/* ══════════════════════════════════════════════════════════════════════
   시나리오 러너 — CALENDAR.md §5A.5 의 C-1 ~ C-12
   손으로 재현하지 않아도 한 번에 확인할 수 있게 각 시나리오를 코드로도 돌린다.
   ══════════════════════════════════════════════════════════════════════ */
const SCEN = [
  ['C-1', '단발 이동 — 안 묻는다', () => {
    const o = pick(4, '2026-08-19'); commitEdit(o, { startMin: 900, endMin: 960 }, 'move');
  }],
  ['C-2', '반복 이동 — 범위 확인', () => {
    const o = pick(1, '2026-08-19'); commitEdit(o, { startMin: 690, endMin: 750 }, 'move');
  }],
  ['C-3', '길이 변경 — 범위 확인', () => {
    const o = pick(3, '2026-08-20'); commitEdit(o, { endMin: o.endMin + 30 }, 'resize');
  }],
  ['C-4', '강사 축을 넘는 드래그', () => {
    const o = pick(1, '2026-08-19'); commitEdit(o, { teacherId: 14 }, 'move');
  }],
  ['C-5', '빈 칸 드래그로 새 일정', () => {
    push(); STATE = RECUR.applyCreate(STATE, { draft: { date: '2026-08-19', startMin: 1080, endMin: 1140,
      kind: 'regular', mode: 'offline', title: '보충 수업', teacherId: 13, roomId: 301, students: [103] } });
    toast('새 일정 — 8/19 18:00–19:00 (묻지 않았습니다)'); mark('C-5'); render();
  }],
  ['C-6', 'Ctrl+드래그 복제', () => {
    const o = pick(1, '2026-08-19'); commitCopy(o, { date: '2026-08-21', startMin: 960 });
  }],
  ['C-7', '다중 선택 통째 이동', () => {
    UIS.sel = [{ serId: 1, onDate: '2026-08-19', date: '2026-08-19' },
               { serId: 4, onDate: '2026-08-19', date: '2026-08-19' }];
    const d = { o: pick(1, '2026-08-19') };
    commitMulti(d, { startMin: d.o.startMin + 60 });
  }],
  ['C-8', '복사 → 붙여넣기 (단발)', () => {
    UIS.sel = [{ serId: 4, onDate: '2026-08-19', date: '2026-08-19' }];
    doCopy(false); UIS.cursor = { date: '2026-08-20', min: 990, patch: { date: '2026-08-20' } }; doPaste();
  }],
  ['C-9', '복사 → 붙여넣기 (반복)', () => {
    UIS.sel = [{ serId: 1, onDate: '2026-08-19', date: '2026-08-19' }];
    doCopy(false); UIS.cursor = { date: '2026-08-21', min: 600, patch: { date: '2026-08-21' } }; doPaste();
  }],
  ['C-10', '다중 복사 — 간격 유지', () => {
    UIS.sel = [{ serId: 6, onDate: '2026-08-19', date: '2026-08-19' },
               { serId: 1, onDate: '2026-08-19', date: '2026-08-19' },
               { serId: 4, onDate: '2026-08-19', date: '2026-08-19' }];
    doCopy(false); UIS.cursor = { date: '2026-08-21', min: 540, patch: { date: '2026-08-21' } }; doPaste();
  }],
  ['C-11', '충돌 → 되돌림', () => {
    // 단발(체험 상담)을 김민수 강사의 수학 A 자리로 끌어다 놓는다 → 강사 충돌
    const o = pick(4, '2026-08-19');
    commitEdit(o, { teacherId: 11, startMin: 600, endMin: 660 }, 'move');
    mark('C-11');
  }],
  ['C-12', '삭제 — 범위 확인', () => {
    UIS.sel = [{ serId: 3, onDate: '2026-08-20', date: '2026-08-20' }]; doDelete();
  }],
];
function pick(serId, date) {
  return RECUR.occ(date, STATE).find(o => o.serId === serId) ||
         RECUR.occ(date, STATE)[0];
}
function mark(id) { if (id) { UIS.done[id] = true; renderRunner(); } }
function renderRunner() {
  $('runner').innerHTML = `<span class="lb">시나리오 (CALENDAR.md §5A.5)</span>` +
    SCEN.map(([id, name]) =>
      `<button class="${UIS.done[id] ? 'done' : ''}" onclick="runScen('${id}')" title="${esc(name)}">${id}</button>`).join('') +
    `<span style="flex:1"></span>
     <button onclick="resetAll()">초기화</button>`;
}
function runScen(id) {
  const s = SCEN.find(x => x[0] === id);
  if (!s) return;
  UIS.dates = ['2026-08-19', '2026-08-20'];
  try { s[2](); } catch (err) { toast('시나리오 오류: ' + err.message); console.error(err); }
}
let SEED0;
function resetAll() { STATE = JSON.parse(JSON.stringify(SEED0)); UIS.sel = []; UIS.clip = null; UIS.undo = []; UIS.done = {}; render(); }

/* ── 부트 ───────────────────────────────────────────────────────────── */
SEED0 = JSON.parse(JSON.stringify(STATE));
render();
