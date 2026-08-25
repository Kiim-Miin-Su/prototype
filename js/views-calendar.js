/* ══ 캘린더 — 넓으면 주간 그리드, 좁으면 아젠다. 뷰 함수는 하나다. ══ */
'use strict';

const CAL_MIN_H = 7, CAL_MAX_H = 23;
/** 그 주에 실제로 있는 수업 범위 ±1시간으로 축을 좁힌다 — 빈 새벽·심야 칸을 없앤다 */
function axisFor(list, fallbackLo = 9, fallbackHi = 21) {
  let lo = Infinity, hi = -Infinity;
  for (const s of list) { lo = Math.min(lo, toMin(s.start) / 60); hi = Math.max(hi, endMin(s) / 60); }
  if (!isFinite(lo)) { lo = fallbackLo; hi = fallbackHi; }
  return [Math.max(CAL_MIN_H, Math.floor(lo) - 1), Math.min(CAL_MAX_H, Math.ceil(hi) + 1)];
}

VIEWS.calendar = function () {
  const missAll = missingReports();
  const banner = missAll.length ? `<button class="banner" onclick="jumpToMissing()">
    <span class="ic">!</span>
    <span><b>리포트를 안 쓴 수업이 ${missAll.length}건 있습니다</b>
      <span>빨간 수업을 누르면 그 자리에서 리포트를 쓸 수 있습니다 · 지금 쓰면 ${won(penaltyNow(missAll[0]).amount)} 차감</span></span>
    <span class="go">›</span></button>` : '';
  return banner + (UI.calMode === 'month' ? monthView() : weekView());
};

/* ── 주간 (v20 s11·s12) ── */
function weekView() {
  const wk = Array.from({ length: 7 }, (_, i) => addDays(UI.weekStart, i));
  const inWeek = SESS.filter(s => s.date >= wk[0] && s.date <= wk[6]);
  const live = inWeek.filter(s => !isCanceled(s));
  const missWk = inWeek.filter(s => blockState(s) === 'miss');
  const cancelWk = inWeek.filter(isCanceled);
  const day = wk.includes(UI.day) ? UI.day : wk[0];
  const dayList = SESS.filter(s => s.date === day).sort((a, b) => a.start.localeCompare(b.start));

  return `
  ${calHeader(md(wk[0]) + ' – ' + md(wk[6]),
    `수업 ${live.length}건 · 시수 ${live.reduce((a, s) => a + s.dur, 0) / 60}시간` +
    (missWk.length ? ` · <b style="color:var(--red)">미작성 ${missWk.length}건</b>` : '') +
    (cancelWk.length ? ` · 취소 ${cancelWk.length}건` : ''),
    `<button class="btn sm" onclick="moveWeek(-1)" aria-label="지난 주">‹</button>
     <button class="btn sm" onclick="UI.weekStart=monOf(TODAY);UI.day=TODAY;render()">이번 주</button>
     <button class="btn sm" onclick="moveWeek(1)" aria-label="다음 주">›</button>`)}

  ${weekGrid(wk, inWeek)}
  ${agendaView(wk, day, dayList)}
  ${calLegend()}`;
}

/* ── 월간 (v20 s13) — 같은 색 규칙, 하루 3건까지 ── */
function monthView() {
  const month = UI.month;
  const [y, m] = month.split('-').map(Number);
  const first = `${month}-01`;
  const lead = wdOf(first) === 0 ? 6 : wdOf(first) - 1;      // 월요일 시작
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= last; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);

  const inMonth = SESS.filter(s => s.date.startsWith(month));
  const live = inMonth.filter(s => !isCanceled(s));
  const missM = inMonth.filter(s => blockState(s) === 'miss');
  const cancelM = inMonth.filter(isCanceled);

  const cellHtml = d => {
    if (!d) return '<div class="mcell empty"></div>';
    const list = SESS.filter(x => x.date === d).sort((a, b) => a.start.localeCompare(b.start));
    const shown = list.slice(0, 3), rest = list.length - shown.length;
    const un = UNAV.filter(u => u.date === d).length;
    return `<button class="mcell ${d === TODAY ? 'today' : ''} ${wdOf(d) === 0 ? 'sun' : ''} ${un ? 'unav' : ''}"
      onclick="UI.calMode='week';UI.weekStart=monOf('${d}');UI.day='${d}';render()">
      <span class="mh"><b>${+d.slice(8, 10)}</b>${list.length ? `<i>${list.length}건</i>` : ''}</span>
      ${shown.map(s => `<span class="mblk blk ${blockState(s)} ${s.mode === '비대면' ? 'online' : ''} ${isDiamond(s) ? 'diamond' : ''}">
        <span class="bt">${isDiamond(s) ? '◆ ' : ''}${s.start} ${esc(s.subject)}</span></span>`).join('')}
      ${rest > 0 ? `<span class="more">+${rest}개 더</span>` : ''}</button>`;
  };

  return `
  ${calHeader(`${y}년 ${m}월`,
    `수업 ${live.length}건 · 시수 ${live.reduce((a, s) => a + s.dur, 0) / 60}시간` +
    (missM.length ? ` · <b style="color:var(--red)">미작성 ${missM.length}건</b>` : '') +
    (cancelM.length ? ` · 취소 ${cancelM.length}건` : ''),
    `<button class="btn sm" onclick="moveMonth(-1)" aria-label="지난달">‹</button>
     <button class="btn sm" onclick="UI.month=TODAY.slice(0,7);render()">이번 달</button>
     <button class="btn sm" onclick="moveMonth(1)" aria-label="다음 달">›</button>`)}
  <div class="month">
    <div class="mweek">${['월','화','수','목','금','토','일'].map((w, i) =>
      `<span class="${i === 6 ? 'sun' : ''}">${w}</span>`).join('')}</div>
    <div class="mgrid">${cells.map(cellHtml).join('')}</div>
  </div>
  <div class="box tip"><b>날짜를 누르면 그 주의 주간 화면으로 갑니다</b>
    주간과 월간이 같은 색 · 테두리 체계를 씁니다. 하루에 4건 이상이면 '+N개 더'로 접힙니다.</div>
  ${calLegend()}`;
}
function moveMonth(n) {
  const [y, m] = UI.month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  UI.month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  render();
}
function jumpToMissing() {
  const m = missingReports()[0]; if (!m) return;
  UI.calMode = 'week'; UI.weekStart = monOf(m.date); UI.day = m.date;
  go('calendar'); openSession(m.id);
}

/* 공통 헤더 — 주간·월간 토글이 항상 붙는다 */
function calHeader(title, sub, nav) {
  return `<div class="card pad row" style="gap:9px">
    <div class="sp"><div class="h3">${title}</div><div class="note">${sub}</div></div>
    <div class="seg" style="flex:0 0 auto;width:auto">
      <button class="${UI.calMode === 'week' ? 'on' : ''}" onclick="UI.calMode='week';render()">주간</button>
      <button class="${UI.calMode === 'month' ? 'on' : ''}" onclick="UI.calMode='month';render()">월간</button></div>
    <div class="hdr-nav">${nav}</div>
  </div>`;
}
function calLegend() {
  return `<div class="card pad">
    <div class="h3" style="margin-bottom:9px">색 · 테두리 · 모양만 보면 됩니다</div>
    <div class="legend">
      ${[['miss', '리포트 미작성', '지금 눌러서 쓰세요'], ['sched', '수업 예정', '아직 안 한 수업'],
         ['done', '리포트 완료', '더 하실 것이 없습니다'], ['pend', '승인 대기', '관리자가 확인 중'],
         ['cancel', '취소된 수업', '시수 · 정산에서 빠집니다']]
        .map(([c, t, d]) => `<div class="li"><span class="blk ${c} sw" style="padding:0"></span>
          <span><span class="n1">${t}</span><span class="n2" style="display:block">${d}</span></span></div>`).join('')}
      <div class="li"><span class="sw" style="border-color:var(--fg-muted);background:#fff"></span>
        <span><span class="n1">대면 수업</span><span class="n2" style="display:block">실선 · 학원에서</span></span></div>
      <div class="li"><span class="sw" style="border-color:var(--fg-muted);border-style:dashed;background:#fff"></span>
        <span><span class="n1">비대면 수업</span><span class="n2" style="display:block">점선 · 줌으로</span></span></div>
      <div class="li"><span class="sw" style="border-color:var(--fg-muted);background:#fff"></span>
        <span><span class="n1">네모 — 일반 · Kinder</span><span class="n2" style="display:block">정규 수업</span></span></div>
      <div class="li"><span class="sw diamond" style="border-color:var(--fg-muted);background:#fff"></span>
        <span><span class="n1">마름모 — 진단 · 모의</span><span class="n2" style="display:block">유형 라벨이 함께 붙습니다</span></span></div>
      <div class="li"><span class="sw" style="background:repeating-linear-gradient(45deg,#e2e8f0,#e2e8f0 4px,#f1f5f9 4px,#f1f5f9 8px);border-color:#cbd5e1"></span>
        <span><span class="n1">회색 빗금 배경</span><span class="n2" style="display:block">내가 등록한 불가 시간</span></span></div>
    </div>
    <div class="note" style="margin-top:9px">블록 안에 '대면' '비대면' 글자도 함께 적어, 점선을 못 알아봐도 읽히게 했습니다.</div>
  </div>`;
}

function moveWeek(n) { UI.weekStart = addDays(UI.weekStart, 7 * n); UI.day = UI.weekStart; render(); }

/* ── 주간 그리드 (≥861px) ── */
function weekGrid(wk, inWeek) {
  const [CAL_H0, CAL_H1] = axisFor(inWeek);
  const hours = CAL_H1 - CAL_H0;
  const cols = wk.map(d => {
    const list = SESS.filter(s => s.date === d);
    // 내가 등록한 불가 시간을 회색 빗금 배경으로 깐다 (v20 s11)
    const unav = UNAV.filter(u => u.date === d).map(u => {
      const top = (toMin(u.start) - CAL_H0 * 60) / 60, h = (toMin(u.end) - toMin(u.start)) / 60;
      return `<div class="unavbg" style="top:calc(${top} * var(--hour-h));height:calc(${h} * var(--hour-h))"
        title="내가 등록한 불가 시간 — ${u.start}–${u.end}"></div>`;
    }).join('');
    const blocks = list.map(s => {
      const b = blockState(s), st = stu(s.studentId), k = kindOf(s);
      const top = (toMin(s.start) - CAL_H0 * 60) / 60;
      const h = s.dur / 60;
      return `<button class="blk ${b} ${s.mode === '비대면' ? 'online' : ''} ${isDiamond(s) ? 'diamond' : ''}"
        style="top:calc(${top} * var(--hour-h));height:calc(${h} * var(--hour-h) - 3px)"
        onclick="openSession(${s.id})" title="${esc(s.subject)} · ${esc(st.name)} 학생 · ${k.label} · ${s.mode} · ${STATE_LABEL[b]}">
        ${k.band ? `<span class="band" style="background:${k.band}"></span>` : ''}
        <span class="bt">${isDiamond(s) ? '◆ ' : ''}${s.start} ${esc(s.subject)}</span>
        <span class="bs">${esc(st.name)} · ${s.mode}${k.key !== 'regular' ? ' · ' + k.label : ''}</span></button>`;
    }).join('');
    const nowLine = d === TODAY && NOW_MIN >= CAL_H0 * 60 && NOW_MIN <= CAL_H1 * 60
      ? `<div class="nowline" style="top:calc(${(NOW_MIN - CAL_H0 * 60) / 60} * var(--hour-h))"></div>` : '';
    return `<div class="col">
      <div class="chead ${wdOf(d) === 0 ? 'sun' : ''} ${d === TODAY ? 'today' : ''}">
        <span class="w">${WD[wdOf(d)]}</span><span class="d">${+d.slice(8, 10)}</span></div>
      <div class="cbody" style="height:calc(${hours} * var(--hour-h))">
        ${Array.from({ length: hours }, (_, i) => `<div class="hl" style="top:calc(${i + 1} * var(--hour-h))"></div>`).join('')}
        ${unav}${blocks}${nowLine}</div></div>`;
  }).join('');
  return `<div class="grid">
    <div class="gutter"><div class="ghead"></div>
      ${Array.from({ length: hours + 1 }, (_, i) => `<div class="lb">${String(CAL_H0 + i).padStart(2, '0')}:00</div>`).join('')}</div>
    <div class="cols">${cols}</div></div>`;
}

/* ── 주 스트립 + 아젠다 (≤860px) ── */
function agendaView(wk, day, list) {
  const dots = d => [...new Set(SESS.filter(s => s.date === d).map(blockState))].map(b => STATE_RAIL[b]);
  const strip = wk.map(d => `<button class="${d === day ? 'on' : ''} ${wdOf(d) === 0 ? 'sun' : ''}"
    onclick="UI.day='${d}';render()"><i>${WD[wdOf(d)]}</i><b>${+d.slice(8, 10)}</b>
    <span class="dots">${dots(d).slice(0, 3).map(c => `<i style="background:${c}"></i>`).join('')}</span></button>`).join('');
  const items = list.map(s => {
    const b = blockState(s), st = stu(s.studentId), k = kindOf(s);
    return `<div class="ag"><div class="tl"><b>${s.start}</b><i>${endTime(s)}</i></div>
      <button class="blk ${b} ${s.mode === '비대면' ? 'online' : ''} ${isDiamond(s) ? 'diamond' : ''}" onclick="openSession(${s.id})">
        ${k.band ? `<span class="band" style="background:${k.band}"></span>` : ''}
        <span class="badge">${STATE_LABEL[b]}</span>
        <span class="bt">${isDiamond(s) ? '◆ ' : ''}${esc(s.subject)}</span>
        <span class="bs">${esc(st.name)} 학생 · ${st.grade} · ${s.mode}${k.key !== 'regular' ? ' · ' + k.label : ''}</span>
        <span class="foot"><span class="chip gray">${s.dur / 60}시간</span>
          ${k.key !== 'regular' ? `<span class="chip gray">${k.label}</span>` : ''}
          ${b === 'miss' ? `<span class="chip solid">지금 쓰면 ${won(penaltyNow(s).amount)} 차감</span>` : ''}
          ${b === 'cancel' && s.canceled.makeup ? `<span class="chip gray">보강 ${esc(s.canceled.makeup)}</span>` : ''}
        </span></button></div>`;
  }).join('');
  return `<div class="agenda-wrap stack">
    <div class="strip">${strip}</div>
    <div class="agenda">${items || '<div class="empty"><div class="e">🗓</div><b>이 날은 수업이 없습니다</b><span>다른 날짜를 눌러 보세요</span></div>'}</div>
  </div>`;
}

/* ══ 불가 시간 ══════════════════════════════════════════
   ① 강사가 남길 수 있는 것은 표기뿐. 확정 수업 위에는 불가를 찍을 수 없다. */
VIEWS.marks = function () {
  const days = Array.from({ length: 14 }, (_, i) => addDays(UI.markStart, i));
  const cycle = Math.floor(diffDays(HIRE, UI.markStart) / 14) + 1;
  const inR = x => x.date >= days[0] && x.date <= days[13];
  const nAv = AVAIL.filter(inR).length, nUn = UNAV.filter(inR).length;
  const openCount = days.filter(d => d >= UNAV_OPEN).length;

  return `
  <div class="card pad row" style="gap:9px">
    <div class="sp"><div class="h3">${md(days[0])} – ${md(days[13])} · 2주</div>
      <div class="note">입사일 ${HIRE} 기준 ${cycle}번째 2주 회차 · 가능 ${nAv}건 · 불가 ${nUn}건 · 열린 날짜 ${openCount}일</div></div>
    <div class="hdr-nav">
      <button class="btn sm" onclick="UI.markStart=addDays(UI.markStart,-14);render()" aria-label="이전 2주">‹</button>
      <button class="btn sm pri" onclick="UI.markStart='2026-08-24';render()">설정 가능한 주</button>
      <button class="btn sm" onclick="UI.markStart=addDays(UI.markStart,14);render()" aria-label="다음 2주">›</button></div>
  </div>

  <div class="card pad">
    <div class="row"><b style="font-size:12.5px">무엇으로 표기할까요</b>
      <div class="marks">${MARKS.map(m => `<button class="mk ${UI.markMode === m.key ? 'on' : ''}"
        onclick="UI.markMode='${m.key}';render()" aria-pressed="${UI.markMode === m.key}">
        <span class="sw" style="border-color:${m.key === '불가' ? 'var(--navy)' : 'var(--green)'};
          border-style:${m.dash ? 'dashed' : 'solid'};background:${m.key === '불가' ? 'var(--navy)' : 'var(--green-soft)'}"></span>
        <span class="tx">${m.label}<small>${m.hint}</small></span></button>`).join('')}</div>
    </div>
    <div class="note" style="margin-top:8px">열려 있는 칸을 누르면 <b>${MARKS.find(m => m.key === UI.markMode).label}</b>(으)로 표기됩니다.
      ${UI.markMode === '불가' ? '불가는 사유를 15자 이상 적어야 등록됩니다.' : '가능 시간은 사유 없이 바로 등록됩니다.'}
      찍은 표기를 누르면 지워집니다. ${mdw(UNAV_OPEN)}부터 등록할 수 있습니다.</div>
  </div>

  <div class="box warn"><b>1주 안에 생긴 사정은 여기서 등록할 수 없습니다</b>
    오늘부터 ${md(addDays(UNAV_OPEN, -1))}까지는 이미 수업이 배정되어 있어 시스템에서 막을 수 없습니다.
    갑작스러운 사정이 생기셨다면 <b>TN Academy 강사 단톡방</b>에 바로 올려 주세요.</div>

  ${markGrid(days)}
  ${markList(days)}

  <div class="box tip"><b>불가로 표기한 시간에는 관리자가 수업을 넣지 않습니다</b>
    파란 칸은 이미 확정된 수업입니다. 확정 수업 위에는 불가 표시를 할 수 없으니, 먼저 스케줄 변경을 요청해 수업을 옮긴 뒤 표기하세요.
    가능 시간(초록)은 관리자가 새 수업을 배치할 때 참고합니다.</div>`;
};

function markGrid(days) {
  const marks = [...AVAIL, ...UNAV].filter(x => x.date >= days[0] && x.date <= days[13])
    .map(x => ({ start: x.start, dur: toMin(x.end) - toMin(x.start) }));
  const inRange = SESS.filter(s => s.date >= days[0] && s.date <= days[13] && !isCanceled(s));
  const [H0, H1] = axisFor([...inRange, ...marks], 8, 22);
  const hours = H1 - H0;
  const cols = days.map(d => {
    const locked = d < UNAV_OPEN;
    const put = (cls, top, h, title, sub, extra, onclick) =>
      `<button class="blk ${cls}" style="top:calc(${top} * var(--hour-h));height:calc(${h} * var(--hour-h) - 3px);${extra || ''}"
        onclick="${onclick}"><span class="bt">${title}</span>${sub ? `<span class="bs">${sub}</span>` : ''}</button>`;
    const fixed = SESS.filter(s => s.date === d && !isCanceled(s)).map(s =>
      put(`fixed ${s.mode === '비대면' ? 'online' : ''}`, (toMin(s.start) - H0 * 60) / 60, s.dur / 60,
        `${s.start} 수업 확정`, '', 'z-index:3',
        `event.stopPropagation();toast('확정된 수업입니다 — 이 시간에는 불가 표시를 할 수 없습니다. 스케줄 변경을 요청해 주세요')`)).join('');
    const av = AVAIL.filter(a => a.date === d).map(a =>
      put(`avail ${a.mode === '비대면' ? 'online' : ''}`, (toMin(a.start) - H0 * 60) / 60,
        (toMin(a.end) - toMin(a.start)) / 60, `가능 · ${a.mode}`, `${a.start}–${a.end}`, 'z-index:2',
        `event.stopPropagation();dropMark('av',${a.id})`)).join('');
    const un = UNAV.filter(u => u.date === d).map(u =>
      put('unav', (toMin(u.start) - H0 * 60) / 60, (toMin(u.end) - toMin(u.start)) / 60,
        `불가 ${u.start}–${u.end}`, esc(u.reason.slice(0, 14)) + '…', 'z-index:4',
        `event.stopPropagation();dropMark('un',${u.id})`)).join('');
    return `<div class="col">
      <div class="chead ${wdOf(d) === 0 ? 'sun' : ''}"><span class="w">${WD[wdOf(d)]}</span>
        <span class="d">${+d.slice(8, 10)}</span>${locked ? '<span class="w">마감</span>' : ''}</div>
      <div class="cbody ${locked ? 'closed' : ''}" style="height:calc(${hours} * var(--hour-h))"
        data-h0="${H0}" ${locked ? '' : `onclick="pickSlot('${d}',event)"`}>
        ${Array.from({ length: hours }, (_, i) => `<div class="hl" style="top:calc(${i + 1} * var(--hour-h))"></div>`).join('')}
        ${fixed}${av}${un}</div></div>`;
  }).join('');
  return `<div class="grid">
    <div class="gutter"><div class="ghead"></div>
      ${Array.from({ length: hours + 1 }, (_, i) => `<div class="lb">${String(H0 + i).padStart(2, '0')}:00</div>`).join('')}</div>
    <div class="cols">${cols}</div></div>`;
}

function markList(days) {
  return `<div class="agenda-wrap"><div class="daylist">${days.map(d => {
    const lock = d < UNAV_OPEN;
    const fx = SESS.filter(s => s.date === d && !isCanceled(s)).sort((a, b) => a.start.localeCompare(b.start));
    const av = AVAIL.filter(a => a.date === d), un = UNAV.filter(u => u.date === d);
    return `<div class="dayrow ${lock ? 'lock' : ''}">
      <div class="dt ${wdOf(d) === 0 ? 'sun' : ''}"><b>${+d.slice(8, 10)}</b><i>${WD[wdOf(d)]}</i>
        ${lock ? '<i>마감</i>' : ''}</div>
      <div class="bd">
        ${fx.map(s => `<button class="tag fx ${s.mode === '비대면' ? 'online' : ''}"
          onclick="toast('확정된 수업입니다 — 이 시간에는 불가 표시를 할 수 없습니다')">${s.start}–${endTime(s)} 수업 확정</button>`).join('')}
        ${av.map(a => `<button class="tag av ${a.mode === '비대면' ? 'online' : ''}"
          onclick="dropMark('av',${a.id})">가능·${a.mode} ${a.start}–${a.end} ✕</button>`).join('')}
        ${un.map(u => `<button class="tag un" onclick="dropMark('un',${u.id})">불가 ${u.start}–${u.end} ✕</button>`).join('')}
        ${lock ? '<span class="tag add" style="opacity:.55">등록 마감</span>'
               : `<button class="tag add" onclick="openMark('${d}')">＋ ${UI.markMode} 표기</button>`}
      </div></div>`;
  }).join('')}</div></div>`;
}

/* 그리드에서 칸을 눌렀을 때 — 기본 3시간 구간으로 모달을 연다 */
function pickSlot(date, e) {
  const box = e.currentTarget, y = e.clientY - box.getBoundingClientRect().top;
  const hourH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hour-h'));
  const h0 = Number(box.dataset.h0 || 8);
  const start = Math.min(Math.floor((h0 * 60 + (y / hourH) * 60) / 30) * 30, 21 * 60);
  openMark(date, fromMin(start), fromMin(Math.min(start + 180, 23 * 60)));
}
function openMark(date, start, end) {
  UI.modal = { type: 'mark', date, start: start || '13:00', end: end || '16:00', mode: UI.markMode, reason: '' };
  renderLayer();
}
function saveMark() {
  const m = UI.modal;
  const blockers = markBlockers(m.mode, m.date, m.start, m.end);
  if (blockers.length) { toast(blockers[0].replace(/<[^>]+>/g, '')); renderLayer(); return; }
  if (m.mode === '불가') {
    if (m.reason.trim().length < 15) { toast('사유를 15자 이상 적어 주세요'); return; }
    UNAV.push({ id: UN_SEQ++, date: m.date, start: m.start, end: m.end, reason: m.reason.trim() });
    closeModal(); render();
    toast('불가 시간을 표기했습니다 — 이 시간에는 수업이 배정되지 않습니다');
    return;
  }
  AVAIL.push({ id: AV_SEQ++, date: m.date, start: m.start, end: m.end, mode: m.mode });
  closeModal(); render();
  toast(`가능 시간(${m.mode})을 표기했습니다 — 관리자가 배치할 때 참고합니다`);
}
function dropMark(kind, id) {
  const arr = kind === 'av' ? AVAIL : UNAV;
  const i = arr.findIndex(x => x.id === id); if (i < 0) return;
  arr.splice(i, 1); render();
  toast(kind === 'av' ? '가능 시간 표기를 지웠습니다' : '불가 시간 표기를 지웠습니다');
}
