/* ══ 리포트 목록 · 수업 패널(리포트 작성 / 수업 안내 / 스케줄 변경) ══ */
'use strict';

VIEWS.reports = function () {
  const miss = missingReports().sort((a, b) => b.date.localeCompare(a.date));
  // ③ 조회 범위: 직전 급여 기간 + 진행 중인 당월까지만
  const written = SESS.filter(s => !isCanceled(s) && canSeePeriod(s.date.slice(0, 7))
    && (s.report === 'submitted' || s.report === 'approved'))
    .sort((a, b) => b.date.localeCompare(a.date) || b.start.localeCompare(a.start));
  const pend = written.filter(s => s.report === 'submitted');
  const open = settle(OPEN_PERIOD);

  const group = list => {
    const g = {}; list.forEach(s => { (g[s.date] = g[s.date] || []).push(s); });
    return Object.entries(g).map(([d, ss]) =>
      `<div class="day"><span>${mdw(d)}</span><div class="sp"></div><span>${ss.length}건</span></div>
       ${ss.map(s => sessionRow(s, { penalty: true })).join('')}`).join('');
  };

  return `
  <div class="grid3">
    <div class="stat ${miss.length ? 'red' : 'green'}"><i>리포트 미작성</i><b class="num">${miss.length}건</b>
      <span>${miss.length ? '차감이 진행 중입니다' : '차감 없이 잘 하고 계십니다'}</span></div>
    <div class="stat"><i>관리자 승인 대기</i><b class="num">${pend.length}건</b><span>확인 중</span></div>
    <div class="stat blue"><i>이번 달 지각 차감</i><b class="num">${won(open.pen)}</b><span>${open.penCnt}건</span></div>
  </div>

  <div class="card soft">
    <div class="row nowrap" style="padding:12px 14px 9px"><div class="h3">아직 안 쓴 리포트</div>
      <div class="sp"></div><span class="chip ${miss.length ? 'red' : 'green'}">${miss.length}건</span></div>
    <div class="list">${miss.map(s => sessionRow(s, { penalty: true })).join('')
      || '<div class="empty"><div class="e">🎉</div><b>안 쓴 리포트가 없습니다</b><span>차감 없이 잘 하고 계십니다</span></div>'}</div>
  </div>

  <div class="card soft">
    <div class="row nowrap" style="padding:12px 14px 9px"><div class="h3">작성한 리포트</div>
      <div class="sp"></div><span class="note">${written.length}건 · 조회 범위 1달</span></div>
    <div class="list">${group(written) || '<div class="empty"><b>아직 없습니다</b></div>'}</div>
  </div>

  <div class="locked"><div class="ic">🔒</div>
    <div><b>${LOCKED_PAYOUTS[0].label} 이전 리포트</b>
      <span>보관되어 있지만 강사 화면에서는 열리지 않습니다 · 매니저 이상만 조회</span></div></div>`;
};

/* ── 수업 패널 열기 ── */
function openSession(id) {
  const s = sess(id); if (!s) return;
  UI.panel = id;
  UI.ptab = isCanceled(s) ? 'guide' : 'report';
  UI.form = { content: s.content, progress: s.progress, homework: s.homework,
    dev: s.dev ? JSON.parse(JSON.stringify(s.dev)) : {},
    assess: s.assess ? JSON.parse(JSON.stringify(s.assess)) : { mathArea: [], mathWhy: [], engArea: [], engWhy: [] },
    lang: s.lang || 'ko', touched: false };
  UI.chg = { date: s.date, start: s.start, end: endTime(s), reason: '' };
  renderLayer();
}
const ddLabel = s => { const d = dDay(s); return d >= 0 ? `D-${d}` : `D+${-d} (지난 수업)`; };

function panelHtml() {
  const s = sess(UI.panel); if (!s) return '';
  const st = stu(s.studentId), cancel = isCanceled(s);
  if (cancel && UI.ptab !== 'guide') UI.ptab = 'guide';

  let body = '', foot = '';
  if (UI.ptab === 'report') {
    const form = reportForm(s);
    body = form === 'dev' ? tabDev(s) : form === 'assess' ? tabAssess(s) : tabReport(s);
    foot = `<button class="btn ghost" onclick="saveDraft(${s.id})">임시 저장</button>
      <button class="btn go sp" onclick="submitReport(${s.id})">작성 완료 · 승인 요청</button>`;
  } else if (UI.ptab === 'change') {
    body = tabChange(s);
    foot = `<button class="btn ghost" onclick="closePanel()">닫기</button>
      <button class="btn pri sp" ${canRequestChange(s) ? '' : 'disabled'} onclick="submitChange(${s.id})">변경 요청 보내기</button>`;
  } else {
    body = tabGuide(s);
    foot = `<button class="btn ghost sp" onclick="closePanel()">닫기</button>`;
  }

  const k = kindOf(s);
  return `<div class="grab"></div>
    ${k.band ? `<div class="pband" style="background:${k.band}">${k.label} 리포트 · ${reportForm(s) === 'assess' ? '점수와 틀린 유형' : '발달 4영역'}</div>` : ''}
    <div class="ph"><div class="row nowrap">
      <div class="sp"><div class="t">${esc(st.name)} · ${esc(s.subject)}</div>
        <div class="s">${mdw(s.date)} ${s.start}–${endTime(s)} · ${s.mode} · ${st.grade} · ${k.label}</div></div>
      ${cancel ? '' : `<div class="seg lang"><button class="${UI.form.lang === 'ko' ? 'on' : ''}"
        onclick="UI.form.lang='ko';renderLayer()">한국어</button><button class="${UI.form.lang === 'en' ? 'on' : ''}"
        onclick="UI.form.lang='en';renderLayer()">English</button></div>`}
      <button class="iconbtn" onclick="closePanel()" aria-label="닫기">✕</button></div></div>
    <div class="ptabs">
      <button class="${UI.ptab === 'report' ? 'on' : ''}" ${cancel ? 'disabled' : ''}
        onclick="UI.ptab='report';renderLayer()">${cancel ? '작성 불가' : '리포트 작성'}</button>
      <button class="${UI.ptab === 'guide' ? 'on' : ''}" onclick="UI.ptab='guide';renderLayer()">수업 안내</button>
      <button class="${UI.ptab === 'change' ? 'on' : ''}" ${cancel ? 'disabled' : ''}
        onclick="UI.ptab='change';renderLayer()">스케줄 변경</button></div>
    <div class="pbody">
      ${cancel ? `<div class="box err"><b>관리자가 취소한 수업입니다</b>${esc(s.canceled.reason)}<br>
        <span class="note">${esc(s.canceled.by)} · ${esc(s.canceled.at)}</span>
        ${s.canceled.makeup ? `<br><b style="display:inline">보강</b> ${esc(s.canceled.makeup)}` : ''}</div>` : ''}
      ${body}
    </div>
    <div class="pfoot">${foot}</div>`;
}

/* ── 리포트 작성 ── */
function tabReport(s) {
  const st = stu(s.studentId), f = UI.form, c = contentChecks(f.content);
  const okLen = c.len >= 60, all3 = c.a && c.b && c.c;
  const books = st.books.flatMap(b => b.items.map(i => i.n));
  const pn = penaltyNow(s);
  const amt = n => (n ? '− ' + n.toLocaleString('ko-KR') : '0원');
  return `
  <!-- ② 차감은 리포트 화면에서 가장 위, 가장 크게 -->
  <div class="penalty">
    <div class="bd"><div class="lead">${pn.head}</div>
      <div class="sub">${pn.left != null ? `다음 차감까지 <b>${pn.left}분</b> 남았습니다. ` : ''}늦어도 리포트는 <b>반드시</b> 써야 합니다.</div></div>
    <div class="cases">
      <div class="case ${pn.amount ? '' : 'ok'}"><div class="w">지금 제출하면</div><div class="a">${amt(pn.amount)}</div></div>
      ${pn.next ? `<div class="case"><div class="w">${pn.next === 5000 ? '1시간이 지나면' : '4시간이 지나면'}</div>
        <div class="a">${amt(pn.next)}</div></div>`
        : `<div class="case ok"><div class="w">1시간 이내였다면</div><div class="a">0원</div></div>`}
    </div>
  </div>

  <div class="fld"><label><span class="n">1</span>학생 · 학년</label>
    <input class="ro" value="${esc(st.name)} · ${st.grade}" readonly></div>

  <div class="fld"><label><span class="n">2</span>날짜 · 시간 · 과목</label>
    <input class="ro" value="${mdw(s.date)} ${s.start}–${endTime(s)} · ${esc(s.subject)}" readonly>
    <button class="btn sm ghost full" onclick="UI.ptab='change';renderLayer()">
      스케줄 변경 요청 · ${canRequestChange(s) ? ddLabel(s) : ddLabel(s) + ' · 요청 불가'}</button></div>

  <div class="fld"><label><span class="n">3</span>수업 내용 <span class="chip red">필수</span></label>
    <textarea id="cbox" class="${f.touched && (!okLen || !all3) ? 'bad' : ''}"
      oninput="UI.form.content=this.value;UI.form.touched=true;syncReport()"
      placeholder="예) SAT Reading and Writing Week 6 지문 두 편을 풀었습니다. 근거 문장을 묻자 세 번 모두 찾아냈고, 후반 20분에 집중이 떨어졌습니다. 추론 문항 두 개는 다음 시간에 다시 봅니다.">${esc(f.content)}</textarea>
    <div class="cnt" id="ccnt">${cntHtml(c)}</div></div>

  <div class="rules"><b>⚑ AI로 쓰셔도 됩니다. 다만 이 세 가지는 반드시 들어가야 합니다</b>
    <div class="r"><i>1</i><div>무엇을 했는지 — 교재 이름과 범위를 넣어서</div></div>
    <div class="r"><i>2</i><div>학생이 어땠는지 — 눈으로 본 것 하나 이상. 정답률, 집중, 반응</div></div>
    <div class="r"><i>3</i><div>무엇이 남았는지 — 다음 시간에 다시 볼 것</div></div>
    <div class="ex"><div class="no">✕ 오늘도 열심히 했습니다. 잘 따라왔습니다.</div>
      <div class="yes">○ SAT Reading and Writing Week 6 지문 두 편 완료. 근거 문장 세 번 모두 찾아냄. 추론 문항 두 개는 다음 시간에 다시 봅니다.</div></div></div>

  ${bookField('4', '진도 페이지', 'progress', 'pbox', books, 'SAT Reading and Writing Week 6 p.42-58')}
  ${bookField('5', '숙제 페이지', 'homework', 'hbox', books, 'SAT Reading and Writing Vocabulary Quiz 11 전체')}

  <div class="ai"><div class="h"><b>리포트 작성용 AI 프롬프트</b>
      <button class="btn sm" onclick="copyPrompt(${s.id})">복사</button></div>
    <pre id="aiBox">${esc(aiPrompt(s, UI.form))}</pre></div>

  ${toneBox()}
  <div class="box tip"><b>작성한 리포트는 관리자 승인을 거칩니다</b>
    승인 완료된 리포트만 학부모에게 나갑니다. 승인 후에도 고칠 수 있고, 고치면 다시 승인 대기로 내려갑니다.</div>`;
}

/* 학부모가 읽는 문서라 톤을 규칙으로 묶었습니다 (v20 s30) */
function toneBox() {
  return `<div class="card pad" style="background:var(--amber-soft);border-color:var(--amber-line)">
    <b style="font-size:12.5px">학부모가 읽는 문서입니다 — 확정형을 관찰형으로</b>
    ${TONE_RULES.map(([bad, good]) => `<div class="tone">
      <span class="no">✕ ${bad}</span><span class="ar">→</span><span class="yes">○ ${good}</span></div>`).join('')}
    <div class="note" style="margin-top:8px;color:var(--amber)">그래도 점수와 관찰 내용은 빠뜨리지 않습니다.
      좋게 쓰되 없는 이야기를 만들지 않습니다. ${TONE_BANNED}는 쓰지 않습니다.</div>
  </div>`;
}

/* ══ 발달 4영역 — Kinder · 모의수업 (v20 s27) ══ */
function tabDev(s) {
  const st = stu(s.studentId), f = UI.form, en = f.lang === 'en';
  const c = devChecks(f.dev);
  const pn = penaltyNow(s);
  const amt = n => (n ? '− ' + n.toLocaleString('ko-KR') : '0원');
  return `
  <div class="penalty">
    <div class="bd"><div class="lead">${pn.head}</div>
      <div class="sub">${pn.left != null ? `다음 차감까지 <b>${pn.left}분</b> 남았습니다. ` : ''}늦어도 리포트는 <b>반드시</b> 써야 합니다.</div></div>
    <div class="cases"><div class="case ${pn.amount ? '' : 'ok'}"><div class="w">지금 제출하면</div>
      <div class="a">${amt(pn.amount)}</div></div>
      ${pn.next ? `<div class="case"><div class="w">${pn.next === 5000 ? '1시간이 지나면' : '4시간이 지나면'}</div>
        <div class="a">${amt(pn.next)}</div></div>` : ''}</div></div>

  <div class="fld"><label><span class="n">1</span>${en ? 'Student · Grade' : '학생 · 학년'}</label>
    <input class="ro" value="${esc(st.name)} · ${st.grade}" readonly></div>

  <div class="sechead"><h2>${en ? 'Developmental areas' : '발달 4영역'}</h2>
    <span class="more">${en ? 'each area: level + 30+ characters' : '영역마다 단계 선택 + 관찰 30자 이상'}</span></div>
  ${DEV_AREAS.map(a => {
    const v = (f.dev[a.key] = f.dev[a.key] || {});
    const r = c.areas[a.key];
    return `<div class="card pad" id="dev-${a.key}">
      <div class="row nowrap" style="margin-bottom:8px"><b style="font-size:13px">${en ? a.en : a.ko}</b>
        <div class="sp"></div>
        ${r.ok ? '<span class="chip green">✓ 작성 완료</span>' : '<span class="chip red">필수</span>'}</div>
      <div class="seg">${a.levels.map((lv, i) => `<button class="${v.level === i + 1 ? 'on' : ''}"
        onclick="UI.form.dev['${a.key}'].level=${i + 1};renderLayer()">${lv[en ? 1 : 0]}</button>`).join('')}</div>
      <div class="fld" style="margin-top:9px">
        <textarea id="dev-obs-${a.key}" class="${f.touched && !r.obs ? 'bad' : ''}" style="min-height:78px"
          oninput="UI.form.dev['${a.key}'].obs=this.value;renderLayer()"
          placeholder="${en ? 'What did you actually see? e.g. Named six of eight pictures without help and asked for the other two.'
            : '예) 그림 여덟 장 중 여섯 장을 스스로 이름 붙였고, 나머지 두 장은 힌트를 요청했습니다.'}">${esc(v.obs || '')}</textarea>
        <div class="cnt"><span class="v ${r.obs ? 'ok' : 'bad'}">${r.len} / 30${en ? '' : '자'}</span></div></div>
    </div>`;
  }).join('')}

  <div class="fld"><label><span class="n">2</span>${en ? 'Overall' : '종합 소견'}
    <span class="chip ${c.summaryOk ? 'green' : 'red'}">${en ? '60+ characters' : '60자 이상'}</span></label>
    <textarea id="dev-summary" class="${f.touched && !c.summaryOk ? 'bad' : ''}"
      oninput="UI.form.dev.summary=this.value;renderLayer()"
      placeholder="${en ? 'Close with what comes next.' : '다음 단계 제안으로 마무리해 주세요.'}">${esc(f.dev.summary || '')}</textarea>
    <div class="cnt"><span class="v ${c.summaryOk ? 'ok' : 'bad'}">${c.summary} / 60${en ? '' : '자'}</span></div></div>

  <div class="ai"><div class="h"><b>${en ? 'AI prompt' : '리포트 작성용 AI 프롬프트'}</b>
      <button class="btn sm" onclick="copyPrompt(${s.id})">${en ? 'Copy' : '복사'}</button></div>
    <pre id="aiBox">${esc(aiPrompt(s, UI.form))}</pre></div>
  ${toneBox()}
  <div class="box tip"><b>${en ? 'Kinder and trial classes share this form' : 'Kinder 정규 수업과 모의수업이 같은 양식을 씁니다'}</b>
    ${en ? 'The band at the top tells them apart — purple for trial, magenta for Kinder.'
      : '상단 띠 색으로 구별합니다. 모의는 보라, Kinder는 자주, 진단은 청록입니다.'}</div>`;
}

/* ══ 진단고사 — 점수와 틀린 유형 (v20 s28) ══ */
function tabAssess(s) {
  const st = stu(s.studentId), f = UI.form, en = f.lang === 'en';
  const a = f.assess, c = assessChecks(a);
  const pn = penaltyNow(s);
  const amt = n => (n ? '− ' + n.toLocaleString('ko-KR') : '0원');
  const toggle = (key, val) => `UI.form.assess['${key}']=(UI.form.assess['${key}']||[]).includes('${val}')
    ? UI.form.assess['${key}'].filter(x=>x!=='${val}') : [...(UI.form.assess['${key}']||[]),'${val}'];renderLayer()`;
  const pickRow = (id, key, list, ok) => `<div class="fld" id="${id}">
    <div class="bkchips">${list.map(r => {
      const on = (a[key] || []).includes(r[0]);
      return `<button class="bkchip ${on ? '' : 'add'}" onclick="${toggle(key, r[0])}">${on ? '✓ ' : ''}${en ? r[2] : r[1]}</button>`;
    }).join('')}</div>
    ${f.touched && !ok ? `<div class="cnt"><span class="v bad">${en ? 'Pick at least one' : '하나 이상 골라 주세요'}</span></div>` : ''}</div>`;

  return `
  <div class="penalty">
    <div class="bd"><div class="lead">${pn.head}</div>
      <div class="sub">${pn.left != null ? `다음 차감까지 <b>${pn.left}분</b> 남았습니다. ` : ''}늦어도 리포트는 <b>반드시</b> 써야 합니다.</div></div>
    <div class="cases"><div class="case ${pn.amount ? '' : 'ok'}"><div class="w">지금 제출하면</div>
      <div class="a">${amt(pn.amount)}</div></div>
      ${pn.next ? `<div class="case"><div class="w">${pn.next === 5000 ? '1시간이 지나면' : '4시간이 지나면'}</div>
        <div class="a">${amt(pn.next)}</div></div>` : ''}</div></div>

  <div class="fld"><label><span class="n">1</span>${en ? 'Student · Grade' : '학생 · 학년'}</label>
    <input class="ro" value="${esc(st.name)} · ${st.grade}" readonly></div>

  <div class="card pad">
    <div class="row nowrap" style="margin-bottom:8px"><b style="font-size:13px">${en ? 'Math' : '수학'}</b>
      <div class="sp"></div>${c.math && c.mathArea && c.mathWhy ? '<span class="chip green">✓</span>' : '<span class="chip red">필수</span>'}</div>
    <div class="fld"><label>${en ? 'Score' : '점수'} / 100</label>
      <input id="as-math" type="number" min="0" max="100" class="${f.touched && !c.math ? 'bad' : ''}"
        value="${a.mathScore ?? ''}" oninput="UI.form.assess.mathScore=this.value;renderLayer()"></div>
    <div class="note" style="margin:8px 0 6px;font-weight:800">${en ? 'Areas missed' : '틀린 영역'}</div>
    ${pickRow('as-math-area', 'mathArea', ASSESS_MATH, c.mathArea)}
    <div class="note" style="margin:4px 0 6px;font-weight:800">${en ? 'Why' : '틀린 이유'}</div>
    ${pickRow('as-math-why', 'mathWhy', ASSESS_WHY, c.mathWhy)}
  </div>

  <div class="card pad">
    <div class="row nowrap" style="margin-bottom:8px"><b style="font-size:13px">${en ? 'English' : '영어'}</b>
      <div class="sp"></div>${c.eng && c.engArea && c.engWhy ? '<span class="chip green">✓</span>' : '<span class="chip red">필수</span>'}</div>
    <div class="fld"><label>${en ? 'Score' : '점수'} / 100</label>
      <input id="as-eng" type="number" min="0" max="100" class="${f.touched && !c.eng ? 'bad' : ''}"
        value="${a.engScore ?? ''}" oninput="UI.form.assess.engScore=this.value;renderLayer()"></div>
    <div class="note" style="margin:8px 0 6px;font-weight:800">${en ? 'Areas missed' : '틀린 영역'}</div>
    ${pickRow('as-eng-area', 'engArea', ASSESS_ENG, c.engArea)}
    <div class="note" style="margin:4px 0 6px;font-weight:800">${en ? 'Why' : '틀린 이유'}</div>
    ${pickRow('as-eng-why', 'engWhy', ASSESS_WHY, c.engWhy)}
  </div>

  <div class="card pad" id="as-interview">
    <div class="row nowrap" style="margin-bottom:8px"><b style="font-size:13px">${en ? 'Interview' : '인터뷰'}</b>
      <div class="sp"></div>${c.interview ? '<span class="chip green">✓</span>' : '<span class="chip red">세 항목 모두</span>'}</div>
    <div class="grid3">${ASSESS_INTERVIEW.map(([k, ko, e2]) => `<div class="fld">
      <label>${en ? e2 : ko} / 100</label>
      <input type="number" min="0" max="100" class="${f.touched && (a[k] == null || a[k] === '') ? 'bad' : ''}"
        value="${a[k] ?? ''}" oninput="UI.form.assess['${k}']=this.value;renderLayer()"></div>`).join('')}</div>
  </div>

  <div class="box err"><b>${en ? 'Blank fields block submission' : '빈 칸이 있으면 제출이 막힙니다'}</b>
    ${en ? 'Score, areas and reasons must all be filled for both subjects, plus all three interview scores.'
      : '문항 · 영역 · 이유 중 하나라도 비면 제출할 수 없습니다. 어느 칸이 문제인지 하단에 뜨고 그 칸으로 자동 이동합니다.'}</div>

  <div class="ai"><div class="h"><b>${en ? 'AI prompt' : '리포트 작성용 AI 프롬프트'}</b>
      <button class="btn sm" onclick="copyPrompt(${s.id})">${en ? 'Copy' : '복사'}</button></div>
    <pre id="aiBox">${esc(aiPrompt(s, UI.form))}</pre></div>
  ${toneBox()}
  <div class="box tip"><b>${en ? 'Assessment reports go through the same approval' : '진단고사 리포트도 같은 승인 흐름을 거칩니다'}</b>
    ${en ? 'Only approved reports are sent to parents.' : '승인 완료된 리포트만 학부모에게 나갑니다.'}</div>`;
}

function bookField(n, label, key, id, books, ph) {
  const bad = hasAbbr(UI.form[key]);
  return `<div class="fld"><label><span class="n">${n}</span>${label}</label>
    <div class="bkchips">${books.map(b => `<button class="bkchip" onclick="putBook('${key}','${esc(b)}')">${esc(b)}</button>`).join('')}
      <button class="bkchip add" onclick="openModal('addbook')">＋ 교재 · 자료 추가</button></div>
    <input id="${id}" class="${bad ? 'bad' : ''}" value="${esc(UI.form[key])}"
      oninput="UI.form.${key}=this.value;syncReport()" placeholder="예) ${ph}">
    ${bad ? '<div class="cnt"><span class="v bad">교재는 줄임말 없이 정식 명칭으로 적어 주세요</span></div>' : ''}</div>`;
}
const cntHtml = c => `<span class="v ${c.len >= 60 ? 'ok' : 'bad'}">${c.len} / 60자</span>
  ${[['무엇을', c.a], ['어땠는지', c.b], ['남은 것', c.c]]
    .map(([n, ok]) => `<span class="chip ${ok ? 'green' : 'gray'}">${ok ? '✓' : '○'} ${n}</span>`).join('')}`;

function syncReport() {
  const c = contentChecks(UI.form.content);
  const el = $('ccnt'); if (el) el.innerHTML = cntHtml(c);
  const box = $('cbox'); if (box) box.classList.toggle('bad', UI.form.touched && (c.len < 60 || !(c.a && c.b && c.c)));
  const ai = $('aiBox'); if (ai && UI.panel != null) ai.textContent = aiPrompt(sess(UI.panel), UI.form);
  const p = $('pbox'), h = $('hbox');
  if (p) p.classList.toggle('bad', hasAbbr(UI.form.progress));
  if (h) h.classList.toggle('bad', hasAbbr(UI.form.homework));
}
function putBook(key, name) {
  const cur = UI.form[key] || '';
  UI.form[key] = (cur ? cur.replace(/\s*$/, '') + ' / ' : '') + name + ' ';
  const el = $(key === 'progress' ? 'pbox' : 'hbox'); if (el) el.value = UI.form[key];
  syncReport(); toast('교재 정식 명칭을 넣었습니다 — 뒤에 범위를 적어 주세요');
}
function copyPrompt(id) {
  const t = aiPrompt(sess(id), UI.form);
  if (navigator.clipboard) navigator.clipboard.writeText(t).catch(() => {});
  toast('프롬프트를 복사했습니다 — AI에 붙여 넣고 결과를 다듬어 주세요');
}
function saveDraft(id) {
  const s = sess(id);
  s.content = UI.form.content; s.progress = UI.form.progress; s.homework = UI.form.homework;
  s.dev = UI.form.dev; s.assess = UI.form.assess; s.lang = UI.form.lang;
  if (s.report === 'none') s.report = 'draft';
  render(); toast('임시 저장했습니다 — 아직 승인 요청은 가지 않았습니다');
}
/** 제출 — 미달인 칸으로 스크롤·포커스를 옮기고 어느 칸이 문제인지 알려 준다 (v20 s22) */
function submitReport(id) {
  const s = sess(id);
  UI.form.touched = true;
  const bad = firstInvalid(s, UI.form);
  if (bad) {
    renderLayer();
    requestAnimationFrame(() => {
      const el = $(bad.id);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('bad'); if (el.focus) try { el.focus({ preventScroll: true }); } catch (e) {} }
    });
    toast(bad.msg); return;
  }
  s.content = UI.form.content; s.progress = UI.form.progress; s.homework = UI.form.homework;
  s.dev = UI.form.dev; s.assess = UI.form.assess; s.lang = UI.form.lang;
  s.report = 'submitted'; s.submittedAt = `${TODAY} ${fromMin(NOW_MIN)}`;
  const p = latePenalty(s);
  closePanel(); render();
  toast(p ? `승인 요청을 보냈습니다 — 지각 제출로 ${won(p)}이 차감됩니다`
          : '승인 요청을 보냈습니다 — 정시 제출이라 차감이 없습니다');
}

/* ── 스케줄 변경 ── */
function tabChange(s) {
  const c = UI.chg, cf = changeConflicts(s, c);
  const changed = c.date !== s.date || c.start !== s.start || c.end !== endTime(s);
  return `
  ${canRequestChange(s)
    ? `<div class="box ok"><b>지금은 요청할 수 있습니다 · ${ddLabel(s)}</b>
        수업 10일 전까지만 변경을 요청할 수 있습니다. 관리자가 확인 후 확정합니다.</div>`
    : `<div class="box err"><b>지금은 요청할 수 없습니다 · ${ddLabel(s)}</b>
        수업이 10일 안으로 다가왔거나 이미 지났습니다. 갑작스러운 사정이라면
        <b>TN Academy 강사 단톡방</b>에 바로 올려 주세요. 관리자가 직접 조정합니다.</div>`}
  <div class="fld"><label>지금 잡힌 시간</label>
    <input class="ro" value="${mdw(s.date)} ${s.start}–${endTime(s)}" readonly></div>
  <div class="fld"><label>옮길 날짜</label>
    <input type="date" value="${c.date}" min="${EARLIEST_CHANGE}" onchange="UI.chg.date=this.value;renderLayer()"></div>
  <div class="row nowrap" style="gap:9px">
    <div class="fld sp"><label>시작</label>
      <input type="time" step="1800" value="${c.start}" onchange="UI.chg.start=this.value;renderLayer()"></div>
    <div class="fld sp"><label>종료</label>
      <input type="time" step="1800" value="${c.end}" onchange="UI.chg.end=this.value;renderLayer()"></div>
  </div>
  ${cf.length ? `<div class="box err"><b>이 시간으로는 옮길 수 없습니다</b>
      ${cf.map(x => `<div style="margin-top:4px">· ${x}</div>`).join('')}</div>`
    : changed ? '<div class="box ok"><b>옮길 수 있는 시간입니다</b>강사·학생 일정과 불가 표기 어디에도 겹치지 않습니다.</div>' : ''}
  <div class="fld"><label>왜 옮겨야 하나요</label>
    <textarea style="min-height:96px" oninput="UI.chg.reason=this.value"
      placeholder="예) 9월 1일은 대학원 학회 발표가 있어 참석이 어렵습니다. 같은 주 목요일 같은 시간으로 옮겨 주실 수 있을까요?">${esc(c.reason)}</textarea></div>
  <div class="box tip"><b>변경을 막는 네 가지</b>
    ① 수업 10일 이내 ② 내 다른 수업과 겹침 ③ 학생이 다른 수업 중 ④ 내가 불가로 표기한 시간</div>`;
}
function submitChange(id) {
  const s = sess(id);
  if (!canRequestChange(s)) { toast('수업 10일 전까지만 요청할 수 있습니다 — 단톡방으로 알려 주세요'); return; }
  if (changeConflicts(s, UI.chg).length) { toast('겹치는 일정이 있어 요청할 수 없습니다'); return; }
  if (UI.chg.reason.trim().length < 10) { toast('변경 사유를 10자 이상 적어 주세요'); return; }
  closePanel(); render(); toast('변경 요청을 보냈습니다 — 관리자 확인 후 확정됩니다');
}

/* ── 패널 안의 수업 안내 ── */
function tabGuide(s) {
  const st = stu(s.studentId);
  return `
  ${st.alert ? `<div class="box warn"><b>⚑ 이 학생 특이사항</b>${esc(st.alert)}</div>` : ''}
  <div class="card pad">
    <div class="row" style="margin-bottom:9px">
      <span class="chip red">${esc(st.intensity)}</span><span class="chip blue">${esc(st.lang)}</span>
      <span class="chip gray">${esc(st.freq)}</span></div>
    <div style="font-size:12.5px;line-height:1.7;color:var(--fg-muted)">${esc(st.teaching)}</div></div>
  <div class="sechead"><h2>교재</h2></div>
  ${st.books.map(g => `<div class="note" style="color:var(--blue);font-weight:800;margin:2px">${esc(g.sub)}</div>
    ${g.items.map(i => `<div class="card pad row nowrap" style="padding:10px 12px">
      <span class="chip" style="background:#dc2626;color:#fff">PDF</span>
      <span class="sp"><b style="font-size:12.5px;display:block">${esc(i.n)}</b>
        <span class="note">${i.sz} · ${i.from}부터</span></span>
      ${i.isNew ? '<span class="chip green">새 교재</span>' : ''}
      <button class="btn sm" onclick="toast('내려받기 시작')">받기</button></div>`).join('')}`).join('')}
  <div class="sechead"><h2>진단고사</h2></div>
  <div class="grid3">${Object.entries(st.diag).map(([k, v]) => diagCard(k, v)).join('')}</div>
  <div class="box tip"><b>이 화면의 값은 전부 관리자가 채웁니다</b>강사는 읽기 전용입니다.</div>`;
}
function diagCard(k, v) {
  const col = v >= 80 ? 'var(--green)' : v >= 60 ? 'var(--blue)' : '#ea580c';
  return `<div class="pct"><i>${k}</i><b style="color:${col}">${v}<span style="font-size:13px">%</span></b>
    <div class="pctbar"><em style="width:${v}%;background:${col}"></em></div>
    <i style="color:${col};font-weight:800">${v >= 80 ? '강점' : v >= 60 ? '보통' : '보완 필요'}</i></div>`;
}
