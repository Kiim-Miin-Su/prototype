/** @file-guide
 * 목적: app.js (historical)
 * 책임/재사용: 읽기 전용 당시 자료다. 현행 명세/구현 근거로 복사하지 않고 최신 docs/CLAUDE.md와 원본을 대조한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/* ══ 부트스트랩 ══ */
'use strict';
document.addEventListener('DOMContentLoaded', () => {
  render();
  // 첫 진입 시 미작성이 있으면 알려 준다 (차감이 걸린 일이라 조용히 넘기지 않는다)
  const n = missingReports().length;
  if (n) setTimeout(() => toast(`안 쓴 리포트가 ${n}건 있습니다 — 지금 쓰면 차감이 줄어듭니다`), 700);
});
