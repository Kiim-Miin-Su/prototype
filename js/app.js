/* ══ 부트스트랩 ══ */
'use strict';
document.addEventListener('DOMContentLoaded', () => {
  render();
  // 첫 진입 시 미작성이 있으면 알려 준다 (차감이 걸린 일이라 조용히 넘기지 않는다)
  const n = missingReports().length;
  if (n) setTimeout(() => toast(`안 쓴 리포트가 ${n}건 있습니다 — 지금 쓰면 차감이 줄어듭니다`), 700);
});
