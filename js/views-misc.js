/* ══ 수업 안내 · 수업 히스토리(급여) · 건의 사항 · 모달 ══ */
'use strict';

VIEWS.guide = function () {
  const st = stu(UI.guideSel);
  const wk = SESS.filter(s => s.studentId === st.id && s.date >= UI.weekStart && s.date <= addDays(UI.weekStart, 6));
  const lvl = (cat, v) => ({ 영어: ['못함', '중간', '잘함'], 수학: ['못함', '중간', '잘함'], 인터뷰: ['적음', '중간', '좋음'] })[cat][v - 1];
  return `
  <div class="cols side-left">
    <div class="stack">
      <div class="card soft">
        <div class="row nowrap" style="padding:12px 14px 8px"><div class="h3">이번 주 담당 학생</div></div>
        <div class="row nowrap" style="padding:0 14px 10px;gap:6px">
          <button class="btn sm" onclick="moveWeek(-1)">‹</button>
          <span class="note sp" style="text-align:center">${md(UI.weekStart)} – ${md(addDays(UI.weekStart, 6))}</span>
          <button class="btn sm" onclick="moveWeek(1)">›</button></div>
        <div class="list">${STU.map(s => {
          const cnt = SESS.filter(x => x.studentId === s.id && x.date >= UI.weekStart
            && x.date <= addDays(UI.weekStart, 6) && !isCanceled(x)).length;
          return `<button class="it ${UI.guideSel === s.id ? 'on' : ''}" onclick="UI.guideSel=${s.id};render()"
            style="${UI.guideSel === s.id ? 'background:var(--blue-soft)' : ''}">
            <span class="me" style="border:0;padding:0"><span class="av">${esc(s.name.slice(1))}</span></span>
            <span class="bd"><b>${esc(s.name)} <span class="chip blue">${s.grade}</span></b>
              <span>${esc(s.subject)}</span></span>
            <span class="note">${cnt || 0}회</span></button>`;
        }).join('')}</div>
      </div>
      <div class="box tip"><b>담당이 아닌 학생은 조회되지 않습니다</b>
        주를 넘기면 그 주에 배정된 학생으로 목록이 다시 채워집니다.</div>
    </div>

    <div class="stack">
      <div class="card pad">
        <div class="row"><div class="h2">${esc(st.name)}</div><span class="chip blue">${st.grade}</span>
          <div class="sp"></div>
          <span class="chip red">${esc(st.intensity)}</span><span class="chip blue">${esc(st.lang)}</span>
          <span class="chip gray">${esc(st.freq)}</span></div>
        <div class="row" style="gap:6px;margin-top:9px">
          ${wk.map(s => `<span class="chip gray" style="${isCanceled(s) ? 'text-decoration:line-through' : ''}">
            ${md(s.date)} (${WD[wdOf(s.date)]}) ${s.start}</span>`).join('') || '<span class="note">이번 주 배정 없음</span>'}</div>
      </div>
      ${st.alert ? `<div class="box warn"><b>⚑ 특이사항</b>${esc(st.alert)}</div>` : ''}

      <div class="card pad">
        <div class="row" style="margin-bottom:9px"><span class="chip blue">1</span><b>학생 교재</b>
          <span class="note">교체 · 종료 이력이 계속 쌓입니다</span></div>
        <button class="btn sm ghost full" style="margin-bottom:9px" onclick="openModal('addbook',${st.id})">
          ＋ 목록에 없는 교재 · 내 자료 추가</button>
        ${st.books.map(g => `<div class="note" style="color:var(--blue);font-weight:800;margin:9px 0 6px">${esc(g.sub)}</div>
          ${g.items.map(i => `<div class="card pad row nowrap" style="padding:9px 11px;margin-bottom:6px">
            <span class="chip" style="background:#dc2626;color:#fff">PDF</span>
            <span class="sp"><b style="font-size:12.5px;display:block">${esc(i.n)}
              ${i.isNew ? '<span class="chip green">새 교재</span>' : ''}</b>
              <span class="note">${i.sz} · ${i.from}부터</span></span>
            ${i.tag ? `<span class="chip blue">${esc(i.tag)}</span>` : ''}
            ${i.req ? `<span class="chip amber">요청함 · 검토 중</span>`
              : '<span class="chip green">사용 중</span>'}
            <button class="btn sm" ${i.req ? 'disabled' : ''} onclick="openModal('bookchange','${esc(i.n)}')">
              ${i.req ? '요청 완료' : '변경 요청'}</button>
            <button class="btn sm pri" onclick="toast('내려받기 시작')">받기</button></div>`).join('')}`).join('')}
        ${st.history.length ? `<div class="row" style="margin:11px 0 6px">
          <span class="note" style="font-weight:800">교재 변경 이력</span><div class="sp"></div>
          <span class="note">${st.history.length}건</span></div>
          ${st.history.map(h => `<div class="card pad row nowrap" style="padding:9px 11px;margin-bottom:6px;opacity:.78;
            background:repeating-linear-gradient(45deg,#f8fafc,#f8fafc 5px,#eef1f4 5px,#eef1f4 10px)">
            <span class="chip gray">PDF</span>
            <span class="sp"><b style="font-size:12px;text-decoration:line-through;display:block">${esc(h.n)}</b>
              <span class="note">${h.span} · ${esc(h.by)}</span></span>
            <span class="chip ${h.tone === 'green' ? 'green' : h.tone === 'amber' ? 'amber' : 'blue'}">${h.tag}</span></div>`).join('')}` : ''}
      </div>

      <div class="card pad">
        <div class="row" style="margin-bottom:9px"><span class="chip blue">2</span><b>학생 스타일</b>
          <span class="note">관리자가 평가한 영역별 수준</span></div>
        <div class="style-grid">${Object.entries(st.style).map(([cat, rows]) => `<div class="card pad">
          <b style="font-size:12.5px">${cat}</b>
          ${rows.map(([n, v]) => `<div class="style-row">
            <span class="note nm">${n}</span>
            <span class="bars">${[0, 1, 2].map(i => `<span class="bar ${i < v ? (v === 1 ? 'low' : v === 2 ? 'mid' : 'high') : ''}"></span>`).join('')}</span>
            <span class="chip ${v === 1 ? 'amber' : v === 2 ? 'blue' : 'green'}">${lvl(cat, v)}</span></div>`).join('')}
        </div>`).join('')}</div>
      </div>

      <div class="card pad">
        <div class="row" style="margin-bottom:9px"><span class="chip blue">3</span><b>진단고사 점수</b>
          <span class="note">English · Math · Interview</span></div>
        <div class="grid3">${Object.entries(st.diag).map(([k, v]) => diagCard(k, v)).join('')}</div>
      </div>

      <div class="card pad" style="background:${st.intensity === '엄격하게' ? 'var(--red-soft)'
        : st.intensity === '북돋우며' ? 'var(--green-soft)' : 'var(--blue-soft)'};border:0">
        <div class="row" style="margin-bottom:7px"><span class="chip blue">4</span><b>티칭 방식</b>
          <span class="note">관리자가 직접 타이핑한 지침</span></div>
        <div style="line-height:1.7">${esc(st.teaching)}</div>
      </div>
    </div>
  </div>`;
};

/* ══ 수업 히스토리 · 급여 — ③ 직전 급여 1건까지 ══ */
VIEWS.history = function () {
  const tab = UI.histTab;
  const period = tab === 'last' ? LAST_PAYOUT.period : OPEN_PERIOD;
  const r = settle(period), M = +period.slice(5, 7);
  const g = {}; r.list.forEach(s => { (g[s.date] = g[s.date] || []).push(s); });

  return `
  <div class="row nowrap" style="gap:9px;align-items:stretch;flex-wrap:wrap">
    <div class="seg sp" style="min-width:250px">
      <button class="${tab === 'last' ? 'on' : ''}" onclick="UI.histTab='last';render()">
        직전 급여 · ${+LAST_PAYOUT.period.slice(5, 7)}월분</button>
      <button class="${tab === 'open' ? 'on' : ''}" onclick="UI.histTab='open';render()">
        이번 달 · 정산 예정</button></div>
    <div class="locked" style="padding:9px 12px"><div class="ic">🔒</div>
      <div><b>${LOCKED_PAYOUTS.map(p => p.label).join(' · ')} 이전</b>
        <span>보관되어 있지만 강사 화면에서는 열리지 않습니다 · 매니저 이상만 조회</span></div></div>
  </div>

  <div class="grid4">
    <div class="stat"><i>진행 수업</i><b class="num">${r.held.length}건</b>
      <span>시수 ${r.held.reduce((a, s) => a + s.dur, 0) / 60}시간</span></div>
    <div class="stat green"><i>리포트 완료</i><b class="num">${r.done.length}건</b>
      <span>시수 ${r.doneH}시간 · 정산 확정</span></div>
    <div class="stat red"><i>리포트 미작성</i><b class="num">${r.miss.length}건</b>
      <span>시수 ${r.missH}시간 · 정산 보류</span></div>
    <div class="stat blue"><i>내 시급 <span class="chip gray">관리자 설정</span></i>
      <b class="num">${won(ME.rate)}</b><span>${ME.rateFrom} 적용</span></div>
  </div>

  <div class="cols side-left">
    <div class="stack">
      <div class="pay">
        <div class="row nowrap"><span class="note" style="color:#93a4bd;white-space:nowrap">${M}월 ${tab === 'last' ? '급여' : '정산 예정액'}</span>
          <div class="sp"></div>
          <span class="chip" style="background:${tab === 'last' ? '#14532d' : '#422006'};
            color:${tab === 'last' ? '#bbf7d0' : '#fde68a'};border:0">
            ${tab === 'last' ? LAST_PAYOUT.paidAt + ' 지급 완료' : '지급 전 · 변동될 수 있음'}</span></div>
        ${Object.entries(r.byKind).map(([k, v]) => `<div class="l">
          <span>${k} ${v.cnt}건 · ${v.hours}시간</span><b>${won(v.amount)}</b></div>`).join('')
          || `<div class="l"><span>리포트 완료 시수 ${r.doneH}시간</span><b>${won(r.gross)}</b></div>`}
        <div class="l"><span>리포트 지각 제출 차감 ${r.penCnt}건</span><b style="color:#fca5a5">− ${won(r.pen)}</b></div>
        <div class="l"><span>원천징수 3.3%</span><b style="color:#fca5a5">− ${won(r.tax)}</b></div>
        <div class="tot"><span>${tab === 'last' ? '실지급액' : '실지급 예정액'}</span><b class="num">${won(r.net)}</b></div>
        ${r.missH ? `<div class="warn"><span>⚠ 리포트 미작성 ${r.missH}시간은 아직 빠져 있습니다</span>
          <b>${won(r.missH * ME.rate)}</b></div>` : ''}
        <div class="note" style="color:#64748b;margin-top:9px">
          ${tab === 'last' ? `이 급여에 포함된 수업 ${r.held.length}건만 아래에 표시됩니다.`
            : `이 달 남은 예정 수업 ${r.future.length}건 · ${r.future.reduce((a, s) => a + s.dur, 0) / 60}시간`}</div>
      </div>
      ${rateSystemCard()}
      <div class="card pad" style="background:var(--amber-soft);border-color:var(--amber-line)">
        <b style="font-size:12.5px">리포트 지각 차감 · 연강 기준</b>
        ${PENALTY_RULE.map(x => `<div class="row nowrap" style="margin-top:7px">
          <span class="sp" style="font-size:12px">${x.when}</span>
          <span class="chip ${x.tone === 'ok' ? 'green' : x.tone === 'warn' ? 'amber' : 'red'}">${x.say}</span></div>`).join('')}
        <div class="note" style="color:var(--amber);margin-top:9px">
          수업이 끝난 시각부터 셉니다. 연강 중에는 리포트를 쓸 수 없으니 <b>마지막 수업이 끝난 시각</b>이 기준이고,
          연강 수업 수만큼 1시간씩 더 드립니다. 2연강이면 첫 수업은 블록 종료 +1시간, 둘째 수업은 +2시간입니다.</div>
      </div>
      <div class="locked">
        <div class="ic">🔒</div>
        <div class="sp"><b>${LOCKED_PAYOUTS.map(p => `${p.label} (${p.paidAt} 지급)`).join(' · ')}</b>
          <span>기록은 삭제되지 않고 보관됩니다. 강사 화면에서는 직전 급여 1건까지만 열리며,
            전체 기간은 매니저 이상만 조회합니다.</span></div>
        <button class="btn sm" onclick="go('feedback')">요청하기</button></div>
    </div>

    <div class="card soft">
      <div class="row nowrap" style="padding:12px 14px 9px"><div class="h3">2026년 ${M}월 수업 기록</div>
        <span class="chip ${tab === 'last' ? 'green' : 'blue'}">${tab === 'last' ? '이 급여에 포함된 수업' : '정산 예정 수업'}</span>
        <div class="sp"></div><span class="note">${r.list.length}건 · 조회 범위 1달</span></div>
      <div class="list">${Object.entries(g).map(([d, ss]) =>
        `<div class="day"><span>${mdw(d)}</span><div class="sp"></div>
          <span>${ss.filter(s => !isCanceled(s)).reduce((a, s) => a + s.dur, 0) / 60}시간</span></div>
         ${ss.map(s => historyRow(s)).join('')}`).join('')
        || '<div class="empty"><b>이 기간에 기록이 없습니다</b></div>'}</div>
    </div>
  </div>

  <div class="box tip"><b>원천징수 3.3%는 지각 차감을 뺀 금액 기준입니다</b>
    내 시급은 관리자가 설정한 값과 적용일만 보이고 강사는 수정할 수 없습니다.
    조회 범위는 <b>직전 급여 1건과 그 급여에 포함된 수업</b>까지입니다.</div>`;
};

/* 시급 체계 (v20 s38) — 기본 시급 하나로 전부 결정된다 */
function rateSystemCard() {
  const t = rateTable(ME.rate);
  const row = (k, v, d) => `<div class="it"><span class="bd">
    <b style="font-weight:600;color:var(--fg-muted)">${k}</b><span>${d}</span></span>
    <b class="num" style="font-size:13px">${v}</b></div>`;
  return `<div class="card soft">
    <div class="row nowrap" style="padding:12px 14px 8px"><div class="h3">시급 체계</div>
      <div class="sp"></div><span class="chip gray">본인만 조회</span></div>
    <div class="list">
      ${row('기본 시급', won(t.base), `${ME.rateFrom} 적용 · 관리자가 설정`)}
      ${row('Kinder 수업', won(t.kinder), '기본 시급 + 10,000원')}
      ${row('그룹 수업', `${won(t.group2)} ~`, '학생당 + 5,000원')}
      ${row('진단고사 · 모의수업', `${won(t.assess)} / 건`, '건당 정액 · 시수에는 포함')}
    </div>
    <div class="row nowrap" style="padding:10px 14px 12px">
      <span class="note sp">단가 규칙은 관리자가 조정하며, 바꾸면 정산이 즉시 다시 계산됩니다.</span>
      <button class="btn sm" onclick="openModal('rate')">
        ${ME.ratePending ? '승인 대기 중' : '시급 변경 신청'}</button></div>
  </div>`;
}

/* 히스토리 한 줄 — 연강 표시와 특이사항 버튼이 붙는다 (v20 s37·s40·s41) */
function historyRow(s) {
  const st = stu(s.studentId), b = blockState(s), pen = latePenalty(s);
  const c = chainOf(s), pay = sessionPay(s);
  return `<div class="it">
    <span class="rail" style="background:${STATE_RAIL[b]}"></span>
    <span class="tm"><b>${s.start}</b><i>${s.dur / 60}h</i></span>
    <span class="bd"><b>${esc(st.name)} · ${esc(s.subject)}</b>
      <span>${s.mode} · ${kindOf(s).label}${s.groupSize > 1 ? ` · 그룹 ${s.groupSize}명` : ''}
        ${c.size > 1 ? ` · <b style="color:var(--blue);display:inline">${c.size}연강 ${c.index}번째</b>` : ''}
        ${pen ? ` · <b style="color:var(--red);display:inline">− ${won(pen)} 지각</b>` : ''}</span></span>
    <span class="note num" style="min-width:78px;text-align:right">${isCanceled(s) ? '—' : won(pay.amount)}</span>
    <span class="chip ${STATE_CHIP[b]}">${STATE_LABEL[b]}</span>
    <button class="btn sm ${s.note ? 'pri' : 'ghost'}" onclick="openModal('note',${s.id})"
      title="특이사항 — 관리자만 봅니다">${s.note ? '특이사항 ✓' : '특이사항'}</button>
  </div>`;
}

/* ══ 건의 사항 — 월 3회 ══ */
VIEWS.feedback = function () {
  const left = 3 - FEEDBACK.length;
  const tone = left === 0 ? 'red' : left === 1 ? 'amber' : 'green';
  return `
  <div class="card pad row nowrap" style="border-color:var(--${tone === 'red' ? 'red' : tone === 'amber' ? 'amber' : 'line'}-line, var(--line))">
    <span class="chip ${tone}">${FEEDBACK.length} / 3</span>
    <div class="sp"><div class="h3">이번 달 ${FEEDBACK.length}회 사용</div>
      <div class="note">${left > 0 ? `${left}회 남았습니다 · 매달 1일에 초기화됩니다`
        : '이번 달 한도를 모두 썼습니다 · 입력칸이 잠깁니다. 다음 달 1일에 다시 열립니다.'}</div></div>
    <button class="btn pri" ${left > 0 ? '' : 'disabled'} onclick="openModal('feed')">
      ${left > 0 ? '건의하기' : '한도 소진'}</button>
  </div>
  <div class="row nowrap" style="gap:6px;flex-wrap:wrap">
    ${['접수됨', '확인 중', '답변 완료'].map((x, i) => `<span class="chip ${i === 2 ? 'green' : i === 1 ? 'amber' : 'gray'}">${x}</span>
      ${i < 2 ? '<span class="note">›</span>' : ''}`).join('')}
    <span class="note">보낸 건의는 아래에 쌓이고 관리자 답변이 그 자리에 붙습니다.</span>
  </div>
  <div class="grid2">${CATS.map(([c, d, t]) => `<div class="card pad">
    <span class="chip ${t}">${c}</span>
    <div class="note" style="margin-top:5px">${d}</div></div>`).join('')}</div>
  ${FEEDBACK.map(f => `<div class="card pad">
    <div class="row" style="margin-bottom:7px">
      <span class="chip ${(CATS.find(c => c[0] === f.cat) || [, , 'gray'])[2]}">${f.cat}</span>
      <span class="note">${f.at}</span><div class="sp"></div>
      <span class="chip ${f.status === '답변 완료' ? 'green' : f.status === '확인 중' ? 'amber' : 'gray'}">${f.status}</span></div>
    <div style="line-height:1.7">${esc(f.body)}</div>
    ${f.reply ? `<div class="card pad" style="margin-top:10px;background:var(--blue-soft);border-color:var(--blue-line)">
      <b class="note" style="color:var(--blue);font-weight:800">${esc(f.reply.by)} · ${esc(f.reply.at)}</b>
      <div style="margin-top:4px;line-height:1.7">${esc(f.reply.body)}</div></div>` : ''}
  </div>`).join('')}
  <div class="box tip">시급 · 정산 관련 문의는 관리자만 확인하며 다른 강사에게 공개되지 않습니다.
    1주 안에 생긴 급한 사정은 건의가 아니라 <b>강사 단톡방</b>으로 알려 주세요.</div>`;
};

/* ══ 모달 ══ */
function openModal(type, arg) {
  if (type === 'feed') UI.modal = { type, cat: null, body: '' };
  else if (type === 'bookchange') UI.modal = { type, reason: null, book: arg || null };
  else if (type === 'tz') UI.modal = { type, region: '자주 쓰는 곳', q: '', sel: ME.tz };
  else if (type === 'rate') UI.modal = { type, to: ME.rate, reason: '' };
  else if (type === 'note') UI.modal = { type, id: arg, body: (sess(arg).note || '') };
  else if (type === 'addbook') UI.modal = { type, kind: '부교재', name: '', file: null, sid: arg };
  renderLayer();
}
function modalHtml() {
  const m = UI.modal;
  if (m.type === 'mark') return markModal(m);
  if (m.type === 'feed') return feedModal(m);
  if (m.type === 'bookchange') return bookModal(m);
  if (m.type === 'tz') return tzModal(m);
  if (m.type === 'rate') return rateModal(m);
  if (m.type === 'note') return noteModal(m);
  if (m.type === 'addbook') return addBookModal(m);
  return '';
}

/* ══ 시간대 변경 요청 (v20 s8~9) — 강사는 요청만, 적용은 관리자 승인 ══ */
function tzModal(m) {
  const q = m.q.trim();
  const all = Object.entries(TZ_REGIONS);
  const rows = q
    ? all.flatMap(([, list]) => list).filter(([id, label]) => (label + id).toLowerCase().includes(q.toLowerCase()))
    : (TZ_REGIONS[m.region] || []);
  const changed = m.sel !== ME.tz;
  return wrapModal('시간대 변경 요청',
    `전 세계 ${TZ_TOTAL}개 시간대 · 관리자가 승인해야 적용됩니다`, `
    ${tzPendingActive() ? `<div class="box warn"><b>이미 요청하신 변경이 승인 대기 중입니다</b>
      ${esc(ME.tzPending.label)} · ${esc(ME.tzPending.at)} 요청. 승인되면 캘린더 · 홈 · 리포트 · 정산이 모두 다시 계산됩니다.</div>` : ''}
    <div class="fld"><label>지금 적용 중</label>
      <input class="ro" value="${esc(ME.tzLabel)}" readonly></div>
    <div class="fld"><label>도시 · 지역 검색</label>
      <input type="search" value="${esc(m.q)}" placeholder="예) 밴쿠버, Vancouver, America/"
        oninput="UI.modal.q=this.value;renderLayer()"></div>
    ${q ? '' : `<div class="seg" style="flex-wrap:wrap">${all.map(([r]) => `<button class="${m.region === r ? 'on' : ''}"
      onclick="UI.modal.region='${r}';renderLayer()">${r}</button>`).join('')}</div>`}
    <div class="card soft"><div class="list">${rows.length ? rows.map(([id, label, off]) => `
      <button class="it" onclick="UI.modal.sel='${id}';renderLayer()"
        style="${m.sel === id ? 'background:var(--blue-soft)' : ''}">
        <span class="chip ${m.sel === id ? 'blue' : 'gray'}">UTC${off}</span>
        <span class="bd"><b>${esc(label)}</b><span>${id}</span></span>
        ${id === ME.tz ? '<span class="chip green">적용 중</span>' : m.sel === id ? '<span class="chip blue">선택</span>' : ''}
      </button>`).join('') : '<div class="empty"><b>검색 결과가 없습니다</b><span>도시 이름이나 America/ 처럼 적어 보세요</span></div>'}</div></div>
    <div class="box tip"><b>강사가 직접 바꿀 수는 없습니다</b>
      요청만 접수되고, 관리자가 승인하는 순간 모든 화면이 새 시간대 기준으로 다시 계산됩니다.
      관리자 화면은 항상 KST로 고정됩니다.</div>`,
    `<button class="btn" onclick="closeModal()">취소</button>
     <button class="btn pri" ${changed && !tzPendingActive() ? '' : 'disabled'} onclick="sendTz()">변경 요청 보내기</button>`);
}
function sendTz() {
  const m = UI.modal;
  const row = Object.values(TZ_REGIONS).flat().find(r => r[0] === m.sel);
  const r = requestTz(m.sel, row ? `${row[1]} (UTC${row[2]})` : m.sel);
  if (!r.ok) { toast(r.msg); return; }
  closeModal(); render(); toast(r.msg);
}

/* ══ 시급 변경 신청 (v20 s39) — 한 달에 한 번, 사유 30자 ══ */
function rateModal(m) {
  const t = rateTable(Number(m.to) || 0), cur = rateTable(ME.rate);
  const n = m.reason.trim().length;
  const ok = Number(m.to) > 0 && Number(m.to) !== ME.rate && n >= 30 && !ME.rateRequestedThisMonth;
  const row = (k, a, b) => `<div class="it"><span class="bd"><b style="font-weight:600;color:var(--fg-muted)">${k}</b></span>
    <span class="note num">${won(a)}</span><span class="note">→</span>
    <b class="num" style="color:${b > a ? 'var(--green)' : b < a ? 'var(--red)' : 'var(--fg)'}">${won(b)}</b></div>`;
  return wrapModal('시급 변경 신청', '한 달에 한 번만 신청할 수 있습니다', `
    ${ME.rateRequestedThisMonth ? `<div class="box err"><b>이번 달에는 이미 신청하셨습니다</b>
      ${ME.ratePending ? `${won(ME.ratePending.to)} · ${esc(ME.ratePending.at)} 신청 · 승인 대기` : ''} 다음 달 1일에 다시 열립니다.</div>` : ''}
    <div class="box warn"><b>신청 전에 한 번 더 생각해 주세요</b>
      시급은 입사 시 합의한 조건입니다. 자주 바꾸는 항목이 아닙니다.<br>
      신청은 한 달에 한 번뿐이고, 관리자는 사유만 보고 판단합니다.
      담당 학생 수 · 맡은 과목 · 리포트 성실도 같은 근거를 적어 주세요. 반려되어도 기록은 남습니다.</div>
    <div class="fld"><label>희망 기본 시급</label>
      <input type="number" step="1000" min="0" value="${m.to}" oninput="UI.modal.to=this.value;renderLayer()"></div>
    <div class="card soft"><div class="row nowrap" style="padding:11px 14px 6px">
      <div class="h3">이렇게 바뀝니다</div><div class="sp"></div><span class="note">기본 시급 하나로 전부 결정됩니다</span></div>
      <div class="list">
        ${row('기본 시급', cur.base, t.base)}
        ${row('Kinder 수업 (+10,000)', cur.kinder, t.kinder)}
        ${row('그룹 2명 (학생당 +5,000)', cur.group2, t.group2)}
        ${row('그룹 3명', cur.group3, t.group3)}
        <div class="it"><span class="bd"><b style="font-weight:600;color:var(--fg-muted)">진단고사 · 모의수업</b></span>
          <b class="num">${won(RATE_RULE.assessFlat)} / 건</b><span class="note">변동 없음</span></div>
      </div></div>
    <div class="fld"><label>신청 사유 <span class="chip ${n >= 30 ? 'green' : 'red'}">최소 30자</span></label>
      <textarea class="${n > 0 && n < 30 ? 'bad' : ''}" oninput="UI.modal.reason=this.value;renderLayer()"
        placeholder="예) 3월부터 담당 학생이 4명에서 7명으로 늘었고 AP 과목 두 개를 추가로 맡았습니다. 리포트는 6개월 동안 지각 없이 제출했습니다.">${esc(m.reason)}</textarea>
      <div class="cnt"><span class="v ${n >= 30 ? 'ok' : 'bad'}">${n} / 30자</span></div></div>
    <div class="box tip">다른 강사의 시급과 정산은 조회되지 않습니다. 본인 것만 보입니다.</div>`,
    `<button class="btn" onclick="closeModal()">취소</button>
     <button class="btn pri" ${ok ? '' : 'disabled'} onclick="sendRate()">신중히 검토했습니다 · 신청</button>`);
}
function sendRate() {
  const m = UI.modal, r = requestRate(Number(m.to), m.reason);
  if (!r.ok) { toast(r.msg); return; }
  closeModal(); render(); toast(r.msg);
}

/* ══ 특이사항 (v20 s41) — 관리자만 봅니다 ══ */
function noteModal(m) {
  const s = sess(m.id), st = stu(s.studentId);
  return wrapModal('특이사항 남기기', `${esc(st.name)} 학생 · ${mdw(s.date)} ${s.start} · ${esc(s.subject)}`, `
    <div class="box tip"><b>여기에 쓰신 내용은 학부모에게 전달되지 않습니다. 관리자만 봅니다.</b>
      필수는 아닙니다. 다만 이런 일이 있었다면 꼭 남겨 주세요.</div>
    <div class="card pad"><div class="list">
      ${['학생이 유난히 지쳐 보이거나 컨디션이 안 좋았을 때',
         '학생이나 학부모가 지나가듯 한 말 중 학원이 알아야 할 것',
         '리포트에 쓰기에는 조심스러운 이야기',
         '학교, 형제자매, 다른 학원과 관련해 들은 이야기',
         '수업과 상관없어 보여도 마음에 걸리는 일']
        .map(t => `<div class="it"><span class="chip blue">·</span><span class="bd"><b style="font-weight:600">${t}</b></span></div>`).join('')}
    </div></div>
    <div class="fld"><label>내용</label>
      <textarea oninput="UI.modal.body=this.value"
        placeholder="예) 오늘 유난히 피곤해 보였습니다. 어제 학교 행사가 늦게 끝났다고 합니다. 다음 시간에는 분량을 조금 줄여 볼 생각입니다.">${esc(m.body)}</textarea></div>`,
    `<button class="btn" onclick="closeModal()">취소</button>
     <button class="btn pri" onclick="saveNote()">남기기</button>`);
}
function saveNote() {
  const m = UI.modal; sess(m.id).note = m.body.trim() || null;
  closeModal(); render(); toast('특이사항을 남겼습니다 — 관리자만 볼 수 있습니다');
}

/* ══ 교재 · 자료 추가 (v20 s23) — 추가하면 세 곳이 동시에 바뀐다 ══ */
function addBookModal(m) {
  const s = UI.panel != null ? sess(UI.panel) : null;
  const st = stu(m.sid || (s ? s.studentId : STU[0].id));
  const ok = m.name.trim().length > 4 && !hasAbbr(m.name);
  return wrapModal('교재 · 자료 추가', '목록에 없는 교재를 쓰시거나 직접 만든 자료를 올리실 때', `
    <div class="card pad row nowrap"><span class="chip blue">${esc(st.grade)}</span>
      <span class="sp"><b style="font-size:12.5px;display:block">${esc(st.name)} 학생</b>
        <span class="note">이 학생의 교재 목록에 추가됩니다</span></span></div>
    <div class="fld"><label>어떤 자료인가요</label>
      <div class="grid2">${[['정규 교재', '관리자 교재 목록에 함께 등록'],
        ['부교재', '보조로 쓰는 자료'], ['내 자료', '직접 만든 프린트 · 문제']]
        .map(([k, d]) => `<button class="card pad" style="text-align:left;${m.kind === k ? 'border-color:var(--blue);background:var(--blue-soft)' : ''}"
          onclick="UI.modal.kind='${k}';renderLayer()"><b style="font-size:12.5px;display:block">${k}</b>
          <span class="note">${d}</span></button>`).join('')}</div></div>
    <div class="fld"><label>자료 이름 <span class="chip ${ok ? 'green' : 'red'}">정식 명칭</span></label>
      <input class="${m.name && !ok ? 'bad' : ''}" value="${esc(m.name)}"
        oninput="UI.modal.name=this.value;renderLayer()"
        placeholder="예) SAT Reading and Writing Vocabulary Quiz 12">
      ${m.name && hasAbbr(m.name) ? '<div class="cnt"><span class="v bad">줄임말 없이 정식 명칭으로 적어 주세요</span></div>' : ''}</div>
    <div class="fld"><label>파일 (PDF · 이미지 · 워드 · 한글)</label>
      <button class="btn full ghost" onclick="UI.modal.file='업로드한 파일.pdf';renderLayer()">
        ${m.file ? `📎 ${esc(m.file)} · 다시 고르기` : '＋ 파일 고르기'}</button></div>
    <div class="box tip"><b>추가하면 세 곳이 동시에 바뀝니다</b>
      ① 진도 페이지 칸에 전체 이름이 자동 입력됩니다
      ② 칩 줄에 새 버튼으로 추가되어 다음 리포트부터 바로 누를 수 있습니다
      ③ 수업 안내 교재 목록에 '${esc(m.kind)} · ${ME.name} 강사' 태그를 달고 올라갑니다<br>
      <span class="note" style="color:#94a3b8">강사가 자기 자료로 수업했는데 기록이 없으면, 그만뒀을 때 학생이 무엇을 풀었는지 아무도 모릅니다.</span></div>`,
    `<button class="btn" onclick="closeModal()">취소</button>
     <button class="btn pri" ${ok ? '' : 'disabled'} onclick="saveBook()">추가하기</button>`);
}
function saveBook() {
  const m = UI.modal, s = UI.panel != null ? sess(UI.panel) : null;
  const st = stu(m.sid || (s ? s.studentId : STU[0].id));
  const subject = s ? s.subject : st.books[0].sub;
  let grp = st.books.find(b => b.sub === subject);
  if (!grp) { grp = { sub: subject, items: [] }; st.books.push(grp); }
  grp.items.push({ n: m.name.trim(), sz: '0.4MB', from: TODAY.slice(5), st: '사용 중',
    isNew: true, tag: `${m.kind} · ${ME.name} 강사` });
  if (s) { UI.form.progress = (UI.form.progress ? UI.form.progress.replace(/\s*$/, '') + ' / ' : '') + m.name.trim() + ' '; }
  closeModal(); render(); renderLayer();
  toast('추가했습니다 — 진도 칸 · 칩 줄 · 수업 안내 교재 목록에 함께 반영되었습니다');
}
const wrapModal = (title, sub, body, foot) => `<div class="modal" role="dialog" aria-modal="true">
  <div class="mh"><div class="row nowrap"><div class="sp"><div class="h2">${title}</div>
    <div class="note">${sub}</div></div>
    <button class="iconbtn" onclick="closeModal()" aria-label="닫기">✕</button></div></div>
  <div class="mb">${body}</div><div class="mf">${foot}</div></div>`;

function markModal(m) {
  const isUn = m.mode === '불가';
  const blockers = markBlockers(m.mode, m.date, m.start, m.end);
  const n = m.reason.trim().length;
  const ok = blockers.length === 0 && (!isUn || n >= 15);
  return wrapModal(`${mdw(m.date)} 표기`,
    isUn ? '이 시간에는 관리자가 수업을 넣지 않습니다' : '관리자가 새 수업을 배치할 때 참고합니다', `
    <div class="marks">${MARKS.map(x => `<button class="mk ${m.mode === x.key ? 'on' : ''}"
      onclick="UI.modal.mode='${x.key}';renderLayer()">
      <span class="sw" style="border-color:${x.key === '불가' ? 'var(--navy)' : 'var(--green)'};
        border-style:${x.dash ? 'dashed' : 'solid'};background:${x.key === '불가' ? 'var(--navy)' : 'var(--green-soft)'}"></span>
      <span class="tx">${x.label}<small>${x.hint}</small></span></button>`).join('')}</div>
    <div class="row nowrap" style="gap:9px">
      <div class="fld sp"><label>시작</label>
        <input type="time" step="1800" value="${m.start}" onchange="UI.modal.start=this.value;renderLayer()"></div>
      <div class="fld sp"><label>종료</label>
        <input type="time" step="1800" value="${m.end}" onchange="UI.modal.end=this.value;renderLayer()"></div></div>
    ${blockers.length ? `<div class="box err"><b>이 시간에는 표기할 수 없습니다</b>
      ${blockers.map(b => `<div style="margin-top:3px">· ${b}</div>`).join('')}
      ${isUn ? '<div class="note" style="margin-top:5px">먼저 스케줄 변경을 요청해 수업을 옮긴 뒤 표기하세요.</div>' : ''}</div>` : ''}
    ${isUn ? `<div class="fld"><label>왜 이 시간에는 안 되나요 <span class="chip ${n >= 15 ? 'green' : 'red'}">최소 15자</span></label>
      <textarea class="${n > 0 && n < 15 ? 'bad' : ''}" style="min-height:100px"
        oninput="UI.modal.reason=this.value;renderLayer()"
        placeholder="예) 매주 화요일 저녁은 대학원 수업이 있습니다. 온라인 실시간 강의라 출석이 학점에 반영되어 조정이 어렵습니다.">${esc(m.reason)}</textarea>
      <div class="cnt"><span class="v ${n >= 15 ? 'ok' : 'bad'}">${n} / 15자</span></div></div>
      <div class="rules"><b>이렇게 써 주시면 관리자가 조정하기 쉽습니다</b>
        ${[['1', '무엇 때문인지 — 학교, 병원, 가족, 다른 일정'], ['2', '매주 반복인지 이번만인지'],
           ['3', '조정이 가능한지 불가능한지'], ['4', '언제까지 이어지는 사정인지']]
          .map(([i, t]) => `<div class="r"><i>${i}</i><div>${t}</div></div>`).join('')}</div>`
      : `<div class="box ok"><b>가능 시간은 사유 없이 바로 표기됩니다</b>
          대면은 학원에서, 비대면은 줌으로 할 수 있는 시간입니다. 표기해도 확정된 수업은 사라지지 않습니다.</div>`}`,
    `<button class="btn" onclick="closeModal()">취소</button>
     <button class="btn go" ${ok ? '' : 'disabled'} onclick="saveMark()">표기하기</button>`);
}

function feedModal(m) {
  const n = m.body.trim().length, ok = m.cat && n >= 15;
  return wrapModal('건의 사항 보내기', `이번 달 ${FEEDBACK.length}/3회 사용 · 관리자만 봅니다`, `
    <div class="fld"><label>어떤 이야기인가요</label>
      <div class="grid2">${CATS.map(([c, d]) => `<button class="card pad" style="text-align:left;
        ${m.cat === c ? 'border-color:var(--blue);background:var(--blue-soft)' : ''}"
        onclick="UI.modal.cat='${c}';renderLayer()"><b style="font-size:12.5px;display:block">${c}</b>
        <span class="note">${d}</span></button>`).join('')}</div></div>
    <div class="fld"><label>내용 <span class="chip ${n >= 15 ? 'green' : 'red'}">최소 15자</span></label>
      <textarea oninput="UI.modal.body=this.value;renderLayer()"
        placeholder="예) 화요일 16시 수업과 목요일 19시 수업 사이 이동 시간이 빠듯합니다. 화요일 수업을 16시 30분으로 30분만 미룰 수 있을까요?">${esc(m.body)}</textarea>
      <div class="cnt"><span class="v ${n >= 15 ? 'ok' : 'bad'}">${n} / 15자</span></div></div>
    <div class="box tip"><b>한 달에 3회까지</b>관리자에게 바로 전달되며 다른 강사에게는 보이지 않습니다.</div>`,
    `<button class="btn" onclick="closeModal()">취소</button>
     <button class="btn pri" ${ok ? '' : 'disabled'} onclick="sendFeed()">보내기</button>`);
}
function sendFeed() {
  if (FEEDBACK.length >= 3) { toast('이번 달 건의 3회를 모두 사용했습니다'); return; }
  FEEDBACK.unshift({ id: FEED_SEQ++, cat: UI.modal.cat, at: `${+TODAY.slice(5, 7)}월 ${+TODAY.slice(8, 10)}일 (${WD[wdOf(TODAY)]})`,
    body: UI.modal.body.trim(), status: '접수됨', reply: null });
  closeModal(); render(); toast('건의를 보냈습니다 — 관리자가 확인 후 답변합니다');
}

/* 교재 변경 요청 (v20 s35) — 강사는 난이도와 적합성만 이야기합니다 */
function bookModal(m) {
  const pickable = BOOK_REASONS.filter(r => !r.adminOnly);
  return wrapModal('교재 변경 요청',
    m.book ? esc(m.book) : '관리자가 확인 후 교재를 바꿔 드립니다', `
    <div class="fld"><label>왜 바꿔야 하나요</label>
      <div class="grid2">${pickable.map(r => `<button class="card pad" style="text-align:left;
        ${m.reason === r.key ? 'border-color:var(--blue);background:var(--blue-soft)' : ''}"
        onclick="UI.modal.reason='${r.key}';renderLayer()">
        <span class="chip ${r.tone}">${r.label}</span></button>`).join('')}</div></div>
    <div class="box warn"><b>'교재 완료'는 강사 선택지에 없습니다</b>
      진도 종료 판단은 관리자 몫입니다. 강사는 <b>난이도와 적합성</b>만 이야기합니다.</div>
    <div class="box tip"><b>요청 뒤에는 '요청함' 칩이 붙어 중복 요청이 막힙니다</b>
      관리자가 승인하면 그 사유로 종료 처리되어 이력으로 내려가고, 반려해도 흔적이 남습니다.
      교재 교체 이력은 수업 안내 화면에 계속 쌓입니다.</div>`,
    `<button class="btn" onclick="closeModal()">취소</button>
     <button class="btn pri" ${m.reason ? '' : 'disabled'} onclick="sendBookChange()">요청 보내기</button>`);
}
function sendBookChange() {
  const m = UI.modal;
  for (const st of STU) for (const g of st.books) for (const i of g.items)
    if (i.n === m.book) i.req = m.reason;
  const label = (BOOK_REASONS.find(r => r.key === m.reason) || {}).label || '';
  closeModal(); render(); toast(`교재 변경을 요청했습니다 — ${label} · 관리자 검토 중`);
}
