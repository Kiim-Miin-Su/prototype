<!-- @file-guide
목적: 강사 백오피스 프로토타입 (document)
책임/재사용: 이 문서의 주제만 기록하고 공통 지시는 docs/AGENT.md, 현재 작업은 docs/CLAUDE.md를 연결한다. 과거 수치를 현행 완료로 복제하지 않는다.
검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
-->

# 강사 백오피스 프로토타입

`index.html` 하나를 열면 됩니다. 빌드도 서버도 필요 없습니다.

```
index.html
css/  tokens.css  layout.css  components.css  calendar.css  panel.css
js/   data.js  rules.js  ui.js  views-home.js  views-calendar.js
      views-report.js  views-misc.js  app.js
```

## 파일이 하는 일

| 파일 | 역할 |
|---|---|
| `css/tokens.css` | **디자인 토큰.** 색·형태·타이포·셸 치수와 반응형 브레이크포인트. 값을 바꾸려면 여기만 고칩니다. |
| `css/layout.css` | 셸 — 사이드바 / 상단바 / 본문 / 하단 탭바. 폭에 따라 세 배치로 접힙니다. |
| `css/components.css` | 카드 · 칩 · 버튼 · 폼 · 정책 바 · 차감 배너 등 공통 부품 |
| `css/calendar.css` | 주간 그리드 · 월간 · 아젠다 · 가능·불가 표기 |
| `css/panel.css` | 수업 패널 — 넓으면 우측 드로어, 좁으면 바텀시트 |
| `js/data.js` | 시드 데이터와 시간 산술. 학생 · 수업 · 표기 · 건의 · 급여 |
| `js/rules.js` | **도메인 규칙.** 상태 색 · 시급 · 지각 차감 · 충돌 · 검증 · 정산 · AI 프롬프트. 화면은 이 파일을 읽기만 합니다. |
| `js/ui.js` | 상태 · 라우팅 · 셸 렌더 · 정책 바 · 차감 배너 |
| `js/views-*.js` | 화면별 렌더 함수 |

## 반응형 기준

기준 단말은 **iPhone 15 Pro — 393 × 852 논리 px (DPR 3)**. 안전 영역은 `env(safe-area-inset-*)`로 잡습니다.

| 폭 | 셸 |
|---|---|
| 1181px 이상 | 사이드바(212px) + 상단바 |
| 861 ~ 1180px | 아이콘 레일(64px) + 상단바 |
| 860px 이하 | 하단 탭바 4개 (홈 · 캘린더 · 리포트 · 더보기) |

같은 뷰 함수가 두 배치를 모두 그립니다. 캘린더는 넓으면 주간 그리드, 좁으면 주 스트립 + 아젠다.
리포트 패널은 넓으면 우측 드로어, 좁으면 풀스크린 바텀시트 — 마크업은 하나이고 CSS가 자리만 바꿉니다.

## 기준 문서

- `../docs/NEW.md` — DB 스키마 · DTO · API · 규칙 A1~A26
- `../docs/INSTRUCTOR-BACKOFFICE-V20-2026-08-21.md` — v20 반영 내역
- `../docs/INSTRUCTOR-BACKOFFICE-POLICY-2026-08-21.md` — 표기 권한 · 차감 고지 · 조회 범위 결정
- `../docs/TACO_ERP_강사_백오피스_최종_v20.pptx` — 원본 사양 (46쪽)
