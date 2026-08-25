/* ══ 홈 ══════════════════════════════════════════════════════ */
'use strict';

/** 일정 한 줄 — 홈·리포트 목록·히스토리가 공유한다 */
function sessionRow(s, opts = {}) {
  const st = stu(s.studentId), b = blockState(s);
  const pen = opts.penalty ? latePenalty(s) : 0;
  return `<button class="it" onclick="openSession(${s.id})">
    <span class="rail" style="background:${STATE_RAIL[b]}"></span>
    <span class="tm"><b>${s.start}</b><i>${opts.dur ? s.dur / 60 + 'h' : endTime(s)}</i></span>
    <span class="bd"><b style="${b === 'cancel' ? 'text-decoration:line-through' : ''}">${esc(s.subject)}</b>
      <span>${esc(st.name)} 학생 · ${s.mode}${isNow(s) ? ' · <b style="color:var(--red);display:inline">지금 진행 중</b>' : ''}
      ${pen ? ` · <b style="color:var(--red);display:inline">− ${won(pen)} 지각</b>` : ''}</span></span>
    <span class="chip ${STATE_CHIP[b]}">${STATE_LABEL[b]}</span></button>`;
}

VIEWS.home = function () {
  const today = SESS.filter(s => s.date === TODAY).sort((a, b) => a.start.localeCompare(b.start));
  const live = today.filter(s => !isCanceled(s));
  const nowS = today.find(isNow);
  const next = live.find(s => toMin(s.start) > NOW_MIN);
  const miss = missingReports().sort((a, b) => b.date.localeCompare(a.date));
  const unchk = myUncheckedAttendance().reverse();          // 최근 것부터 (A27)
  const pend = pendingReports();
  const open = settle(OPEN_PERIOD);

  return `
  <div class="hero">
    <div class="r1"><div class="d">${+TODAY.slice(8, 10)}</div>
      <div class="dw">${+TODAY.slice(5, 7)}월 · ${WD[wdOf(TODAY)]}요일</div>
      <button class="clock" onclick="openModal('tz')" title="시간대 변경 요청">
        <b class="num">${fromMin(NOW_MIN)}</b>
        <span>${esc(ME.tzLabel.split(' (')[1] ? ME.tzLabel.split(' (')[1].replace(')', '') : 'KST')} 기준
          ${tzPendingActive() ? '· 승인 대기 ●' : '· 변경 ›'}</span></button></div>
    <div class="meta">
      <div class="mi"><i>오늘 수업</i><b class="num">${live.length}건</b></div>
      <div class="mi"><i>오늘 시수</i><b class="num">${live.reduce((a, s) => a + s.dur, 0) / 60}시간</b></div>
      <div class="mi"><i>이번 달 시수</i><b class="num">${open.doneH}시간</b></div>
      <div class="mi"><i>정산 예정</i><b class="num">${won(open.net)}</b></div>
    </div>
  </div>

  ${tzPendingActive() || ME.ratePending ? `<div class="banner wait">
    <span class="ic">⏳</span>
    <span><b>관리자 승인을 기다리는 요청이 있습니다</b>
      <span>${[tzPendingActive() ? `시간대 → ${esc(ME.tzPending.label)}` : null,
              ME.ratePending ? `시급 → ${won(ME.ratePending.to)}` : null].filter(Boolean).join(' · ')}
        · 승인되는 순간 캘린더 · 홈 · 리포트 · 정산이 모두 다시 계산됩니다</span></span>
    <span class="go">⏳</span></div>` : ''}
  ${miss.length ? `<button class="banner" onclick="openSession(${miss[0].id})">
    <span class="ic">!</span>
    <span><b>안 쓴 리포트 ${miss.length}건</b>
      <span>${mdw(miss[0].date)} ${esc(stu(miss[0].studentId).name)} 학생 · 지금 쓰면 ${won(penaltyNow(miss[0]).amount)} 차감</span></span>
    <span class="go">›</span></button>` : ''}
  ${/* A27 — 출결은 리포트와 별개 축이라 배너도 따로 뜬다. 찍지 않으면 시수·페이가 잡히지 않는다 */
    unchk.length ? `<button class="banner amber" onclick="openSession(${unchk[0].id})">
    <span class="ic">◷</span>
    <span><b>출결을 안 찍은 수업 ${unchk.length}건</b>
      <span>${mdw(unchk[0].date)} ${esc(stu(unchk[0].studentId).name)} 학생 · 찍어야 시수와 정산에 들어갑니다 · 회차당 한 번</span></span>
    <span class="go">›</span></button>` : ''}

  <div class="cols side-right">
    <div class="stack">
      ${nowS ? `<div class="card pad" style="background:var(--red-soft);border-color:var(--red-line)">
        <div class="chip red" style="border:0;background:transparent;padding:0">● 지금 진행 중</div>
        <div class="h2" style="margin:4px 0 2px">${esc(nowS.subject)}</div>
        <div class="note">${esc(stu(nowS.studentId).name)} 학생 · ${nowS.start}–${endTime(nowS)} · ${nowS.mode}</div>
        <button class="btn dan full" style="margin-top:11px" onclick="openSession(${nowS.id})">끝나면 바로 리포트 쓰기</button>
      </div>` : next ? `<div class="card pad">
        <div class="note" style="font-weight:800">다음 수업</div>
        <div class="h2" style="margin:3px 0 2px">${next.start} ${esc(next.subject)}</div>
        <div class="note">${esc(stu(next.studentId).name)} 학생 · ${next.mode}</div></div>` : ''}

      <div class="card soft">
        <div class="row nowrap" style="padding:12px 14px 9px"><div class="h3">오늘 전체 스케줄</div>
          <div class="sp"></div><span class="note">시간 순</span></div>
        <div class="list">${today.map(s => sessionRow(s)).join('')
          || '<div class="empty"><div class="e">☕</div><b>오늘 수업이 없습니다</b><span>푹 쉬세요</span></div>'}</div>
      </div>
    </div>

    <div class="stack">
      <div class="card soft">
        <div class="row" style="padding:12px 14px 8px"><div class="h3">오늘 할 일</div></div>
        <div class="list">
          ${todoRow(miss.length, '리포트 미작성', 'red', 'reports')}
          ${todoRow(pend.length, '관리자 승인 대기', 'amber', 'reports')}
          ${todoRow(0, '스케줄 변경 요청 중', 'gray', 'calendar')}
          ${todoRow(0, '교재 변경 요청 중', 'gray', 'guide')}
        </div>
      </div>
      ${settingsCard()}
      <div class="menu">
        ${MENU.filter(m => m.key !== 'home').map(m => `<button onclick="go('${m.key}')">
          <span class="ic">${m.ic}</span><span class="tx"><b>${m.label}</b><span>${m.desc}</span></span>
          <span class="ar">›</span></button>`).join('')}
      </div>
      <div class="box tip"><b>관리자 페이지는 매니저 이상만 열립니다</b>
        강사 계정에는 그 화면으로 가는 버튼도 링크도 없습니다.</div>
    </div>
  </div>`;
};

/* 시간대 · 시급 — 홈 설정 카드 (v20 s7). 진입점 네 곳 중 두 번째. */
function settingsCard() {
  const tzWait = tzPendingActive(), rateWait = !!ME.ratePending;
  const t = rateTable(ME.rate);
  return `<div class="card soft">
    <div class="row nowrap" style="padding:12px 14px 8px"><div class="h3">시간대 · 시급</div>
      <div class="sp"></div><span class="note">본인만 조회</span></div>
    <div class="list">
      <button class="it" onclick="openModal('tz')">
        <span class="chip ${tzWait ? 'amber' : 'blue'}">🌐</span>
        <span class="bd"><b>${esc(ME.tzLabel)}</b>
          <span>${tzWait ? `${esc(ME.tzPending.label)}(으)로 변경 요청 · 승인 대기` : `전 세계 ${TZ_TOTAL}개 중 선택 · 관리자 승인제`}</span></span>
        <span class="chip ${tzWait ? 'amber' : 'gray'}">${tzWait ? '승인 대기' : '적용 중'}</span></button>
      <button class="it" onclick="openModal('rate')">
        <span class="chip ${rateWait ? 'amber' : 'green'}">₩</span>
        <span class="bd"><b>기본 시급 ${won(ME.rate)}</b>
          <span>Kinder ${won(t.kinder)} · 그룹 2명 ${won(t.group2)} · 진단·모의 건당 ${won(t.assess)}</span></span>
        <span class="chip ${rateWait ? 'amber' : 'gray'}">${rateWait ? '승인 대기' : '월 1회 신청'}</span></button>
    </div>
    <div class="note" style="padding:0 14px 12px">시간대와 시급은 강사가 직접 바꿀 수 없습니다.
      요청만 접수되고 관리자가 승인해야 적용됩니다. 관리자 화면은 항상 KST입니다.</div>
  </div>`;
}

function todoRow(n, label, tone, page) {
  const color = n === 0 ? 'gray' : tone;
  return `<button class="it" onclick="go('${page}')">
    <span class="chip ${color}" style="min-width:26px;justify-content:center">${n}</span>
    <span class="bd"><b>${label}</b></span><span class="note">›</span></button>`;
}

/* ══ 더보기 (모바일 전용 진입점) ══ */
VIEWS.more = function () {
  const open = settle(OPEN_PERIOD);
  return `
  <div class="card pad row nowrap">
    <div class="me" style="border:0;padding:0"><div class="av">범준</div></div>
    <div class="sp"><b style="font-size:15px;letter-spacing:-.03em">${ME.name}</b>
      <div class="note">${ME.role} · 시급 ${won(ME.rate)} (${ME.rateFrom} 적용)</div></div>
    <button class="btn sm" onclick="go('me')">내 정보</button>
  </div>
  <div class="menu">
    ${[['marks', '⊘', '가능·불가 표기', '2주 단위 · 최소 1주 전'],
       ['guide', '▥', '수업 안내', '담당 학생 교재 · 스타일 · 진단 점수'],
       ['history', '↺', '수업 히스토리 · 급여', `직전 급여 1건 · 이번 달 예정 ${won(open.net)}`],
       ['feedback', '✉', '건의 사항', `이번 달 ${FEEDBACK.length}/3회 사용`],
       ['policy', '§', '정책 모아보기', '차감 · 표기 · 변경 · 조회 범위']]
      .map(([k, ic, t, d]) => `<button onclick="go('${k}')"><span class="ic">${ic}</span>
        <span class="tx"><b>${t}</b><span>${d}</span></span><span class="ar">›</span></button>`).join('')}
  </div>
  ${penaltyBar(true)}
  <div class="menu">
    <button onclick="toast('강사 단톡방으로 이동합니다')"><span class="ic">💬</span>
      <span class="tx"><b>TN Academy 강사 단톡방</b><span>1주 안에 생긴 급한 사정은 여기로</span></span><span class="ar">›</span></button>
    <button onclick="toast('로그아웃')"><span class="ic">⏻</span>
      <span class="tx"><b>로그아웃</b><span>${ME.name} · ${ME.role}</span></span><span class="ar">›</span></button>
  </div>
  <div class="box tip">관리자 페이지는 <b>매니저 이상만</b> 열 수 있습니다.</div>`;
};

VIEWS.me = function () {
  const r = settle(LAST_PAYOUT.period);
  const rows = [['시급', won(ME.rate) + ' (관리자 설정)'], ['적용일', ME.rateFrom],
    ['직전 급여', `${LAST_PAYOUT.label} · ${won(r.net)}`], ['지급일', LAST_PAYOUT.paidAt],
    ['담당 학생', STU.length + '명'], ['조회 범위', '직전 급여 1건']];
  return `
  <div class="card pad row nowrap">
    <div class="me" style="border:0;padding:0"><div class="av" style="width:46px;height:46px;flex:0 0 46px;border-radius:15px;font-size:14px">범준</div></div>
    <div><b style="font-size:17px;letter-spacing:-.03em">${ME.name}</b>
      <div class="note">${ME.role} · 입사 ${HIRE}</div></div>
  </div>
  <div class="card soft"><div class="list">${rows.map(([k, v]) => `<div class="it">
    <span class="bd"><b style="font-weight:600;color:var(--fg-muted)">${k}</b></span>
    <b style="font-size:13px">${v}</b></div>`).join('')}</div></div>
  <div class="box tip"><b>시급은 강사가 고칠 수 없습니다</b>
    관리자가 설정한 값과 적용일만 보입니다. 바뀌어야 한다면 건의 사항 · 시급 관련으로 요청해 주세요.</div>`;
};

VIEWS.policy = function () {
  return permissionView() + policyDetailView();
};

/* 강사가 할 수 있는 것과 없는 것 (v20 s44) — 화면에 보이지 않으면 할 수 없습니다 */
function permissionView() {
  const can = ['내 수업만 조회 (홈 · 주간 · 월간)', '리포트 작성 및 수정 후 재제출',
    '담당 학생의 교재 내려받기', '교재 추가 · 부교재 자료 업로드', '교재 변경 요청 (난이도 · 적합성)',
    '스케줄 변경 요청 (충돌 없을 때)', '가능·불가 시간 표기 (1주 전까지)', '특이사항 작성',
    '건의 사항 작성 (월 3회)', '내 정산 내역 조회', `시간대 변경 요청 (전 세계 ${TZ_TOTAL}개)`,
    '시급 변경 신청 (월 1회)'];
  const cannot = ['수업 생성 · 시간 확정 · 취소', '다른 강사의 수업 조회', '담당이 아닌 학생 조회',
    '학생 스타일 · 진단 점수 수정', '티칭 방식 · 지도 강도 수정', '교재 종료 처리 (요청만 가능)',
    '취소된 수업의 리포트 작성', '수업 10일 이내 스케줄 변경', '확정 수업 위 불가 표시',
    '시간대 · 시급 직접 변경 (요청만 가능)', '다른 강사의 시급 · 정산 조회', '리포트 자체 승인'];
  const col = (title, items, tone, ic) => `<div class="card pad">
    <div class="row nowrap" style="margin-bottom:9px"><span class="chip ${tone}">${ic}</span>
      <b style="font-size:13.5px;letter-spacing:-.02em">${title}</b>
      <div class="sp"></div><span class="note">${items.length}가지</span></div>
    <div class="list">${items.map(t => `<div class="it" style="padding:8px 0">
      <span class="chip ${tone}" style="min-width:20px;justify-content:center">${ic}</span>
      <span class="bd"><b style="font-weight:600">${t}</b></span></div>`).join('')}</div></div>`;
  return `<div class="box tip"><b>화면에 보이지 않으면 할 수 없습니다</b>
      애매한 권한은 아예 노출하지 않았습니다. 기존 화면에 있던 학생·부모 명부, 전체 수업 관리,
      통합 검색창은 강사 계정에서 제거했습니다.</div>
    <div class="grid2">
      ${col('할 수 있는 것', can, 'green', '○')}
      ${col('할 수 없는 것 — 관리자 권한', cannot, 'red', '✕')}
    </div>
    <div class="sechead"><h2>일곱 화면, 네 가지 원칙</h2></div>
    <div class="grid2">${[['1', '안 읽어도 알게 만든다', '색 · 테두리 · 빗금 · 모양으로 상태를 표현하고, 안내문은 짧게 옆에 둡니다.'],
      ['2', '할 일을 숨기지 않는다', '리포트 미작성은 배너 · 뱃지 · 색 · 금액 네 군데에서 반복해 걸립니다.'],
      ['3', '규칙은 도구에 심는다', '교재 Full Name, 기호 제거, 최소 글자 수를 검증과 AI 프롬프트에 넣었습니다.'],
      ['4', '권한은 화면으로 자른다', '할 수 없는 일은 버튼 자체를 두지 않고, 우회 저장도 막았습니다.']]
      .map(([n, t, d]) => `<div class="card pad"><div class="row nowrap" style="margin-bottom:5px">
        <span class="chip blue">${n}</span><b style="font-size:13px">${t}</b></div>
        <div class="note">${d}</div></div>`).join('')}</div>`;
}

function policyDetailView() {
  const nums = [['리포트 최소 길이', '60자'], ['리포트 필수 요소', '3가지'],
    ['지각 차감', '−5,000 / −10,000원'], ['스케줄 변경 요청', '수업 10일 전까지'],
    ['가능·불가 표기', '2주 단위 · 1주 전'], ['불가 사유', '15자 이상'],
    ['건의 사항', '월 3회'], ['히스토리 조회', '직전 급여 1건'], ['원천징수', '3.3%']];
  return `${penaltyBar(false)}
  <div class="stack">${Object.entries(POLICY).map(([k, p]) =>
    `<div class="policy"><span class="tag">${p.tag}</span><span class="bd">${p.body}</span></div>`).join('')}</div>
  <div class="card pad"><div class="h3" style="margin-bottom:4px">숫자로 보는 규칙</div>
    <div class="list">${nums.map(([k, v]) => `<div class="it">
      <span class="bd"><b style="font-weight:600;color:var(--fg-muted)">${k}</b></span>
      <b class="num" style="font-size:13.5px;letter-spacing:-.02em">${v}</b></div>`).join('')}</div></div>`;
};
