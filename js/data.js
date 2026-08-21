/* ══════════════════════════════════════════════════════════════
   TACO ERP — 강사 백오피스 · 시드 데이터
   관리자가 채우는 값(학생·수업)과 강사가 남기는 값(표기·리포트·건의)을 나눠 둔다.
   ══════════════════════════════════════════════════════════════ */
'use strict';

const TODAY = '2026-08-21';
const NOW_MIN = 15 * 60 + 35;
const HIRE = '2026-06-01';
const ME = {
  name: '김범준', role: '강사',
  rate: 45000, rateFrom: '2026-07-01',      // 기본 시급 — 나머지 단가는 여기서 파생 (v20 s38)
  tz: 'Asia/Seoul', tzLabel: '서울 · 대한민국 (KST, UTC+9)',
  tzPending: null,                           // {to,label,at} — 관리자 승인 대기
  ratePending: null,                         // {to,reason,at} — 시급 변경 신청 (월 1회)
  rateRequestedThisMonth: false,
};
/* 기본 시급 하나로 전부 결정된다 (v20 s38) */
const RATE_RULE = {
  kinderBonus: 10000,        // Kinder 수업 = 기본 시급 + 10,000원
  groupPerStudent: 5000,     // 그룹 수업 = 학생당 + 5,000원
  assessFlat: 15000,         // 진단고사 · 모의수업 = 건당 15,000원 (시수 포함)
};

/* ── 시간 산술은 여기 한 곳에서만 (NEW.md A1) ── */
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fromMin = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const wdOf = iso => new Date(iso + 'T00:00:00Z').getUTCDay();
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const monOf = iso => addDays(iso, wdOf(iso) === 0 ? -6 : 1 - wdOf(iso));
const diffDays = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
const won = n => '₩' + Number(n).toLocaleString('ko-KR');
const md = iso => `${+iso.slice(5, 7)}월 ${+iso.slice(8, 10)}일`;
const mdw = iso => `${md(iso)} (${WD[wdOf(iso)]})`;

/* ── 학생 — 전부 관리자가 채우고 강사는 읽기만 한다 ── */
const STU = [
  { id: 1, name: '양찬욱', grade: 'G10', subject: 'SAT Reading & Writing', freq: '주 1회',
    intensity: '엄격하게', lang: '영어 + 한국어',
    alert: '9월 SAT 응시 예정입니다. 8월 말까지 Week 8 진도를 마쳐야 합니다.',
    teaching: '문법은 답을 바로 주지 마시고 근거 문장을 소리 내어 읽게 하세요. 인터뷰 58%, 어휘 66%가 가장 급합니다. 채팅이 아니라 말하게 해 주세요.',
    books: [{ sub: 'SAT Reading & Writing', items: [
      { n: 'SAT Reading and Writing Week 6 · Student Edition', sz: '2.4MB', from: '08-11' },
      { n: 'SAT Reading and Writing Week 6 · Teacher Edition', sz: '2.8MB', from: '08-11' },
      { n: 'SAT Reading and Writing Vocabulary Quiz 11', sz: '0.6MB', from: '08-13', isNew: true }] }],
    history: [
      { n: 'SAT Reading and Writing Week 5', sz: '2.3MB', span: '07-28 ~ 08-10', by: 'Week 6(으)로 교체', tag: '교재 완료', tone: 'green' },
      { n: 'SAT Foundations Reading Level 2', sz: '1.9MB', span: '06-15 ~ 07-27', by: 'Week 5(으)로 교체', tag: '너무 쉬움', tone: 'blue' }],
    style: { 영어: [['문법', 3], ['리딩', 2], ['라이팅', 2]], 수학: [['계산', 2], ['영어 용어', 1], ['개념', 2]], 인터뷰: [['단어 다양성', 2], ['유창성', 3], ['표현', 2]] },
    diag: { English: 78, Math: 64, Interview: 71 } },
  { id: 2, name: '고은성', grade: 'G11', subject: 'AP World History', freq: '주 2회',
    intensity: '북돋우며', lang: '영어로만 수업',
    alert: '11월 AP 모의고사 전까지 Unit 6까지 마쳐야 합니다.',
    teaching: '연도 암기보다 인과관계를 먼저 잡아 주세요. 타임라인을 직접 그리게 하면 훨씬 잘 따라옵니다.',
    books: [{ sub: 'AP World History', items: [
      { n: 'AP World History Unit 5', sz: '3.1MB', from: '08-05' },
      { n: 'AP World History Unit 5 Timeline', sz: '0.9MB', from: '08-05' }] }],
    history: [{ n: 'AP World History Unit 4', sz: '3.0MB', span: '07-10 ~ 08-04', by: 'Unit 5(으)로 교체', tag: '교재 완료', tone: 'green' }],
    style: { 영어: [['문법', 2], ['리딩', 3], ['라이팅', 2]], 수학: [['계산', 2], ['영어 용어', 2], ['개념', 2]], 인터뷰: [['단어 다양성', 3], ['유창성', 2], ['표현', 3]] },
    diag: { English: 84, Math: 59, Interview: 76 } },
  { id: 3, name: '고은설', grade: 'G8', subject: 'ELA Intermediate', freq: '주 1회',
    intensity: '유연하게', lang: '영어 + 한국어', alert: null,
    teaching: '짧은 지문을 여러 개 읽히기보다 한 지문을 끝까지 붙잡게 해 주세요. 어휘는 문맥에서 추론시키세요.',
    books: [
      { sub: 'ELA Intermediate', items: [
        { n: 'ELA Intermediate Set 7 · Reading', sz: '2.2MB', from: '08-13' },
        { n: 'ELA Intermediate Grammar Drill 7', sz: '0.5MB', from: '08-13' }] },
      { sub: 'Literature & Writing', items: [
        { n: 'Between the Lines Week 8', sz: '2.9MB', from: '08-16', isNew: true }] }],
    history: [
      { n: 'ELA Advanced Set 2 · Reading', sz: '2.6MB', span: '07-16 ~ 08-12', by: 'Set 7(으)로 교체', tag: '너무 어려움', tone: 'amber' },
      { n: 'Between the Lines Week 7', sz: '2.8MB', span: '08-09 ~ 08-15', by: 'Week 8(으)로 교체', tag: '교재 완료', tone: 'green' }],
    style: { 영어: [['문법', 2], ['리딩', 2], ['라이팅', 1]], 수학: [['계산', 3], ['영어 용어', 1], ['개념', 2]], 인터뷰: [['단어 다양성', 1], ['유창성', 2], ['표현', 2]] },
    diag: { English: 66, Math: 81, Interview: 58 } },
  { id: 4, name: '이담흔', grade: 'G8', subject: 'MAP Reading G8, Pre-Algebra', freq: '주 1회',
    intensity: '북돋우며', lang: '한국어만 사용', alert: null,
    teaching: '영어 용어에서 자주 막힙니다. 용어를 한국어로 한 번 풀어 준 뒤 영어로 다시 말하게 해 주세요.',
    books: [
      { sub: 'MAP Reading G8', items: [{ n: 'MAP Growth Reading Grade 8 Set 4', sz: '1.8MB', from: '08-06' }] },
      { sub: 'Pre-Algebra', items: [{ n: 'Pre-Algebra Chapter 5 Workbook', sz: '2.1MB', from: '08-02' }] }],
    history: [],
    style: { 영어: [['문법', 1], ['리딩', 2], ['라이팅', 1]], 수학: [['계산', 3], ['영어 용어', 1], ['개념', 3]], 인터뷰: [['단어 다양성', 2], ['유창성', 2], ['표현', 1]] },
    diag: { English: 57, Math: 88, Interview: 62 } },
  { id: 5, name: '박서윤', grade: 'K', subject: 'Kinder Phonics', freq: '주 2회',
    intensity: '북돋우며', lang: '영어 + 한국어', alert: null,
    teaching: '앉아 있는 시간이 15분을 넘기지 못합니다. 활동을 짧게 끊고 자주 칭찬해 주세요.',
    books: [{ sub: 'Kinder Phonics', items: [{ n: 'Kinder Phonics Level A Workbook', sz: '1.2MB', from: '08-04' }] }],
    history: [],
    style: { 영어: [['문법', 1], ['리딩', 1], ['라이팅', 1]], 수학: [['계산', 2], ['영어 용어', 1], ['개념', 1]], 인터뷰: [['단어 다양성', 1], ['유창성', 2], ['표현', 2]] },
    diag: { English: 41, Math: 52, Interview: 48 } },
  { id: 6, name: '최이준', grade: 'K', subject: '모의수업 · 상담', freq: '1회',
    intensity: '유연하게', lang: '한국어만 사용', alert: '입학 상담용 모의수업입니다. 결과가 배정에 쓰입니다.',
    teaching: '처음 만나는 수업입니다. 평가보다 관찰에 무게를 두고, 아이가 편안해하는 활동을 찾아 주세요.',
    books: [{ sub: '모의수업', items: [{ n: 'Trial Class Activity Set', sz: '0.8MB', from: '08-21', isNew: true }] }],
    history: [],
    style: { 영어: [['문법', 1], ['리딩', 1], ['라이팅', 1]], 수학: [['계산', 1], ['영어 용어', 1], ['개념', 1]], 인터뷰: [['단어 다양성', 1], ['유창성', 1], ['표현', 1]] },
    diag: { English: 0, Math: 0, Interview: 0 } },
];
const stu = id => STU.find(s => s.id === id);

/* ── 수업 유형 (v20 s46) — 네모는 일반·Kinder, 마름모는 진단·모의 ── */
const KIND = {
  regular: { key: 'regular', label: '일반',   shape: 'square',  band: null,      form: 'regular' },
  kinder:  { key: 'kinder',  label: 'Kinder', shape: 'square',  band: '#9d174d', form: 'dev' },
  assess:  { key: 'assess',  label: '진단',   shape: 'diamond', band: '#0e7490', form: 'assess' },
  trial:   { key: 'trial',   label: '모의',   shape: 'diamond', band: '#6d28d9', form: 'dev' },
};

/* ── 수업 — 관리자가 만들고 강사는 본다 ── */
let SEQ = 100;
const S = (date, st, dur, subject, studentId, mode, report, extra = {}) => ({
  id: SEQ++, date, start: st, dur, subject, studentId, mode,
  kind: extra.kind || 'regular',       // regular | kinder | assess | trial
  groupSize: extra.groupSize || 1,     // 그룹 수업이면 학생 수
  report,                              // none | draft | submitted | approved
  canceled: extra.canceled || null,
  submittedAt: extra.submittedAt || null,
  content: extra.content || '', progress: extra.progress || '', homework: extra.homework || '',
  dev: extra.dev || null,              // 발달 4영역 (Kinder · 모의)
  assess: extra.assess || null,        // 진단고사 결과
  lang: extra.lang || 'ko',            // 리포트 작성 언어 ko | en
  note: extra.note || null,
});

const SESS = [
  /* 지난 주 — 전부 승인 완료 */
  S('2026-08-11', '17:00', 120, 'SAT Reading & Writing', 1, '대면', 'approved', { submittedAt: '2026-08-11 19:20' }),
  S('2026-08-12', '16:00', 120, 'AP World History', 2, '대면', 'approved', { submittedAt: '2026-08-12 18:25' }),
  S('2026-08-13', '18:00', 120, 'ELA Intermediate', 3, '비대면', 'approved', { submittedAt: '2026-08-13 20:40' }),
  S('2026-08-14', '15:00', 120, 'MAP Reading G8', 4, '비대면', 'approved', { submittedAt: '2026-08-14 21:10' }),
  /* 이번 주 */
  S('2026-08-17', '19:00', 90, 'Pre-Algebra', 4, '비대면', 'none'),                                   // 미작성
  S('2026-08-18', '17:00', 120, 'SAT Reading & Writing', 1, '대면', 'approved', { submittedAt: '2026-08-18 20:15' }),
  S('2026-08-19', '16:00', 120, 'AP World History', 2, '대면', 'none'),                                // 미작성
  S('2026-08-19', '19:00', 90, 'Pre-Algebra', 4, '비대면', 'approved', { submittedAt: '2026-08-19 21:20' }),
  S('2026-08-20', '18:00', 120, 'ELA Intermediate', 3, '비대면', 'submitted', { submittedAt: '2026-08-20 20:35' }),
  S('2026-08-21', '15:00', 120, 'MAP Reading G8', 4, '비대면', 'none'),                                // 지금 진행 중
  S('2026-08-21', '19:00', 120, 'AP World History', 2, '대면', 'none'),                                // 예정
  S('2026-08-22', '17:00', 120, 'SAT Reading & Writing', 1, '대면', 'none', {
    canceled: { by: '박지현 매니저', at: '2026-08-18 11:20', reason: '학생 가족 일정으로 이번 주 토요일 수업을 취소했습니다.', makeup: '8월 29일 (토) 17:00' } }),
  /* 다음 주 이후 */
  S('2026-08-25', '19:00', 90, 'Pre-Algebra', 4, '비대면', 'none'),
  S('2026-08-26', '16:00', 120, 'AP World History', 2, '대면', 'none'),
  S('2026-08-27', '18:00', 120, 'ELA Intermediate', 3, '비대면', 'none'),
  S('2026-08-28', '15:00', 120, 'MAP Reading G8', 4, '비대면', 'none'),
  S('2026-08-29', '17:00', 120, 'SAT Reading & Writing', 1, '대면', 'none'),
  S('2026-09-01', '17:00', 120, 'SAT Reading & Writing', 1, '대면', 'none'),
  S('2026-09-02', '16:00', 120, 'AP World History', 2, '대면', 'none'),
  /* 유형이 다른 수업 — 네모/마름모와 단가 차이를 보여 준다 (v20 s38·s46) */
  S('2026-08-18', '10:00', 60,  'Kinder Phonics A',    5, '대면', 'approved',
    { kind: 'kinder', submittedAt: '2026-08-18 11:20' }),
  S('2026-08-20', '14:00', 60,  '진단고사 · Math G8',   4, '대면', 'none',   { kind: 'assess' }),
  S('2026-08-21', '11:00', 60,  '모의수업 · Kinder 상담', 6, '비대면', 'none', { kind: 'trial' }),
  S('2026-08-26', '10:00', 90,  'ELA Group Reading',   3, '대면', 'none',   { groupSize: 3 }),
];

/* ── 직전 급여(7월분)에 포함된 수업 — 전부 승인 완료 ── */
(function seedPrevPayout() {
  const plan = { 2: ['17:00', 120, 'SAT Reading & Writing', 1, '대면'],
                 3: ['16:00', 120, 'AP World History', 2, '대면'],
                 4: ['18:00', 120, 'ELA Intermediate', 3, '비대면'],
                 5: ['15:00', 120, 'MAP Reading G8', 4, '비대면'] };
  const late = { '2026-07-14': 2.5, '2026-07-24': 5 };  // −5,000 / −10,000 사례 각 1건
  for (let d = '2026-07-01'; d <= '2026-07-31'; d = addDays(d, 1)) {
    const p = plan[wdOf(d)]; if (!p) continue;
    const over = late[d] || 0.5;
    const at = fromMin(toMin(p[0]) + p[1] + Math.round(over * 60));
    SESS.push(S(d, p[0], p[1], p[2], p[3], p[4], 'approved', { submittedAt: `${d} ${at}` }));
  }
})();
const sess = id => SESS.find(s => s.id === id);

/* ── 강사가 남기는 표기 ── */
const AVAIL = [                                     // 가능 시간 (대면 / 비대면)
  { id: 0, date: '2026-08-24', start: '13:00', end: '18:00', mode: '대면' },
  { id: 1, date: '2026-08-25', start: '09:00', end: '12:00', mode: '비대면' },
  { id: 2, date: '2026-08-27', start: '14:00', end: '19:00', mode: '비대면' },
  { id: 3, date: '2026-08-29', start: '10:00', end: '16:00', mode: '대면' },
];
const UNAV = [                                      // 불가 시간 (사유 15자 이상)
  { id: 0, date: '2026-08-28', start: '08:30', end: '11:30', reason: '매주 금요일 오전은 학교 상담 일정이 있어 조정이 어렵습니다.' },
  { id: 1, date: '2026-08-31', start: '09:00', end: '13:00', reason: '대학원 수업 · 실시간 온라인 강의라 출석이 학점에 반영됩니다.' },
  { id: 2, date: '2026-09-03', start: '18:00', end: '23:00', reason: '학기 말 논문 중간 발표 준비로 저녁 시간을 비워야 합니다.' },
];
let AV_SEQ = 4, UN_SEQ = 3;

const MARKS = [
  { key: '대면',   label: '가능 · 대면',   hint: '학원에서 할 수 있는 시간', dash: false },
  { key: '비대면', label: '가능 · 비대면', hint: '줌으로 할 수 있는 시간',   dash: true },
  { key: '불가',   label: '불가',          hint: '수업을 넣지 말아 주세요',  dash: false },
];

/* ── 건의 사항 — 월 3회 ── */
const CATS = [['수업 관련', '교재 · 진행 · 학생', 'blue'], ['시급 관련', '정산 · 보강', 'green'],
              ['스케줄 관련', '시간 · 요일 · 이동', 'amber'], ['기타', '그 밖의 이야기', 'gray']];
const FEEDBACK = [
  { id: 1, cat: '스케줄 관련', at: '8월 12일 (수)', status: '답변 완료',
    body: '화요일 17시 수업과 목요일 18시 수업 사이 이동 시간이 빠듯합니다. 화요일 수업을 17시 30분으로 30분만 미룰 수 있을까요?',
    reply: { by: '박지현 매니저', at: '8월 13일 (목)', body: '학생 쪽 확인했습니다. 9월 첫 주부터 17시 30분으로 옮기겠습니다.' } },
  { id: 2, cat: '수업 관련', at: '8월 5일 (수)', status: '확인 중',
    body: '고은설 학생 ELA Advanced Set 2가 난이도가 높아 진도가 밀립니다. Intermediate로 낮출 수 있을지 검토 부탁드립니다.', reply: null },
];
let FEED_SEQ = 3;

/* ── 시간대 (v20 s8) — 전 세계 418개 중 자주 쓰는 곳만 노출하고 검색으로 나머지를 찾는다 ── */
const TZ_REGIONS = {
  '자주 쓰는 곳': [
    ['Asia/Seoul', '서울 · 대한민국', '+9'], ['America/Vancouver', '밴쿠버 · 캐나다', '-7'],
    ['America/Los_Angeles', '로스앤젤레스 · 미국', '-7'], ['America/New_York', '뉴욕 · 미국', '-4'],
    ['Australia/Sydney', '시드니 · 호주', '+10'], ['Europe/London', '런던 · 영국', '+1'],
  ],
  '아시아': [['Asia/Tokyo', '도쿄 · 일본', '+9'], ['Asia/Shanghai', '상하이 · 중국', '+8'],
    ['Asia/Singapore', '싱가포르', '+8'], ['Asia/Dubai', '두바이 · UAE', '+4'],
    ['Asia/Manila', '마닐라 · 필리핀', '+8'], ['Asia/Bangkok', '방콕 · 태국', '+7']],
  '미주': [['America/Toronto', '토론토 · 캐나다', '-4'], ['America/Chicago', '시카고 · 미국', '-5'],
    ['America/Denver', '덴버 · 미국', '-6'], ['America/Sao_Paulo', '상파울루 · 브라질', '-3']],
  '유럽 · 오세아니아': [['Europe/Paris', '파리 · 프랑스', '+2'], ['Europe/Berlin', '베를린 · 독일', '+2'],
    ['Pacific/Auckland', '오클랜드 · 뉴질랜드', '+12'], ['Australia/Perth', '퍼스 · 호주', '+8']],
};
const TZ_TOTAL = 418;

/* ── 교재 변경 종료 사유 (v20 s35) — '교재 완료'는 관리자 몫 ── */
const BOOK_REASONS = [
  { key: 'done',  label: '교재 완료',              tone: 'green', adminOnly: true },
  { key: 'easy',  label: '교재가 너무 쉬움',        tone: 'blue',  adminOnly: false },
  { key: 'hard',  label: '교재가 너무 어려움',      tone: 'amber', adminOnly: false },
  { key: 'unfit', label: '교재가 수업에 적합하지 않음', tone: 'red', adminOnly: false },
];

/* ── 발달 4영역 (Kinder · 모의수업) · 진단고사 항목 (v20 s27·s28) ── */
const DEV_AREAS = [
  { key: 'lang', ko: '언어', en: 'Language', levels: [['관찰 필요','Needs support'],['보통','Developing'],['좋음','Strong']] },
  { key: 'math', ko: '수학', en: 'Math',     levels: [['관찰 필요','Needs support'],['보통','Developing'],['좋음','Strong']] },
  { key: 'emo',  ko: '정서', en: 'Emotional',levels: [['관찰 필요','Needs support'],['보통','Developing'],['좋음','Strong']] },
  { key: 'body', ko: '신체', en: 'Physical', levels: [['관찰 필요','Needs support'],['보통','Developing'],['좋음','Strong']] },
];
const ASSESS_MATH = [['calc','수와 연산','Number & Operations'],['alg','대수','Algebra'],
  ['geo','기하','Geometry'],['data','자료와 확률','Data & Probability'],['word','문장제','Word Problems']];
const ASSESS_ENG = [['topic','주제 찾기','Main Idea'],['detail','세부 내용','Details'],['infer','추론','Inference']];
const ASSESS_WHY = [['concept','개념을 몰라서','Concept gap'],['careless','실수로','Careless error'],
  ['time','시간이 부족해서','Ran out of time'],['reading','문제를 잘못 읽어서','Misread the question']];
const ASSESS_INTERVIEW = [['fluency','유창성','Fluency'],['variety','단어 다양성','Vocabulary range'],['grammar','어법','Grammar']];

/* ── 급여(정산) ── */
const OPEN_PERIOD = '2026-08';
const PAYOUTS = [
  { period: '2026-07', label: '7월분 급여', paidAt: '2026-08-10', status: '지급 완료' },
  { period: '2026-06', label: '6월분 급여', paidAt: '2026-07-10', status: '지급 완료' },
];
const LAST_PAYOUT = PAYOUTS[0];
const LOCKED_PAYOUTS = PAYOUTS.slice(1);
