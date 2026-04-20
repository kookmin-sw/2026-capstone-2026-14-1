# 히스토리 탭 정확도/개선 중심 개편 기록

## 1. 문서 정보
- 작성일: 2026-04-20
- 범위: 히스토리 탭 UI/API 개편
- 목적: "동기부여성 지표"를 히스토리 탭에서 분리하고, "자세 정확도"와 "개선 방향" 중심으로 화면을 단순화한 변경 이력과 이유를 기록한다.

## 2. 배경
기존 히스토리 탭은 Hero/KPI/인사이트 차트/사이드 가이드/상세의 다중 패널 구조로 정보량이 많아, 사용자가 가장 중요한 질문인 아래 2가지를 빠르게 파악하기 어려웠다.

- 이번 세션에서 자세 정확도가 어디서 떨어졌는가?
- 다음 세션에서 무엇부터 고치면 되는가?

또한 동기부여 지표(연속 운동, 활동량 추이 등)는 Home/퀘스트 탭에서도 제공 가능하므로, 히스토리 탭의 역할을 "정확도 복기"로 명확히 분리할 필요가 있었다.

## 3. 개편 목표
1. 히스토리 탭을 정확도/개선 방향 전용 화면으로 단순화한다.
2. 목록에서 세션별 핵심 문제와 다음 행동을 즉시 확인 가능하게 만든다.
3. 상세 모달은 정확도 요약, 개선 방향, 메트릭 시계열 3축으로 고정한다.
4. 디버그 성 원본 로그는 기본 노출이 아닌 접기 영역으로 이동한다.

## 4. 변경 사항

### 4.1 백엔드 (`controllers/history.js`)

#### 4.1.1 세션 요약/개선 로직 추가
- 세션별 메트릭 정규화/정렬 유틸 추가
  - `sanitizeMetricRows`
  - `sortMetricsByScore`
- 정확도 요약 생성 유틸 추가
  - `buildAccuracyFocus`
  - 전체 점수, 등급, 강점/약점 메트릭, 상/하위 메트릭 요약
- 개선 방향 생성 유틸 추가
  - `buildImprovementFocus`
  - 우선 개선 항목, 행동 가이드, 카메라 이슈 노트, 신뢰도 산출
- 목록 카드용 요약 유틸 추가
  - `buildFocusPreview`
  - 핵심 문제/다음 행동 1줄 요약

#### 4.1.2 목록 페이지 데이터 구성 변경
- 기존 `getHistoryPage`에서 Hero/KPI용 추가 통계 쿼리(오늘/주간/최근30일/최고점/streak) 제거
- FINAL 스냅샷 메트릭을 함께 조회해 각 세션에 `focus_preview`를 부착

#### 4.1.3 상세 API 응답 확장
- `GET /api/history/:sessionId` 응답에 아래 블록 추가
  - `accuracy_focus`
  - `improvement_focus`
  - `focus_preview`
- 기존 필드(`session`, `metrics`, `metric_series`, `timeline`, `session_events`, `routine_context`)는 유지

### 4.2 목록 화면 (`views/history/index.ejs`)
- 제거
  - Hero 통계 영역
  - KPI 카드 영역
  - 인사이트 차트 패널
  - 우측 요약/라벨 가이드 패널
- 유지/강조
  - 필터 섹션
  - 세션 리스트
- 카드 정보 재구성
  - 정확도 점수
  - 개선 1순위 (`focus_preview.primary_issue`)
  - 핵심 문제/다음 행동 (`focus_preview.headline`, `focus_preview.primary_action`)

### 4.3 상세 화면 스크립트 (`public/js/history-page.js`)
- 제거
  - 인사이트 로딩/집계/차트(`loadHistoryInsights`, range 버튼 로직)
- 추가
  - `renderAccuracySection` (정확도 요약)
  - `renderImprovementSection` (개선 방향)
- 상세 모달 구조 재정의
  - 섹션 1: 정확도 요약 + FINAL 메트릭
  - 섹션 2: 개선 우선순위 + 다음 행동
  - 섹션 3: 메트릭 시계열
- `session_events`, `routine_context`는 `<details>` 기반 디버그 접기 영역으로 이동

### 4.4 스타일 (`public/history-v2.css`)
- 개편 레이아웃/컴포넌트 스타일 추가
  - `.history-focus-header`, `.history-focus-summary`, `.focus-summary-card`
  - `.detail-focus-grid`, `.detail-focus-item`
  - `.detail-improvement-grid`, `.detail-issue-list`, `.detail-action-list`
  - `.detail-debug-grid`
- 모바일 반응형에서 2열/3열 요약 블록을 1열로 안전하게 폴백하도록 미디어쿼리 보강

## 5. 왜 이렇게 바꿨는가

1. **역할 분리**
- 히스토리 탭을 "동기부여"가 아니라 "자세 복기" 전용으로 고정해 화면 목적을 명확히 했다.
- 동기부여 지표는 Home/퀘스트 탭의 성격에 더 적합하다.

2. **인지 부하 감소**
- 한 화면에 서로 다른 목적의 카드/차트가 많으면 사용자가 다음 행동으로 연결되기 어렵다.
- 핵심 문제/다음 행동을 카드 전면에 배치해 의사결정 시간을 줄였다.

3. **현재 DB 구조와 정합성**
- 이미 저장 중인 `workout_session`, `session_snapshot_metric`, `session_event`, `metric_series`를 활용해 정확도/개선 요약을 계산하도록 설계했다.
- 즉, 스키마 변경 없이도 정확도 중심 UX를 즉시 제공할 수 있다.

4. **디버깅 가능성 유지**
- 원본 이벤트/루틴 컨텍스트를 완전히 삭제하지 않고 디버그 접기 영역으로 남겨, 운영 이슈 분석 경로를 보존했다.

## 6. 응답 계약 변화 (상세 API)
기존 상세 응답에 아래 필드가 추가된다.

```json
{
  "accuracy_focus": {
    "overall_score": 0,
    "score_grade": "A",
    "best_metric": {},
    "weakest_metric": {},
    "top_metrics": [],
    "weak_metrics": []
  },
  "improvement_focus": {
    "headline": "...",
    "priority_issues": [],
    "actions": [],
    "camera_note": "...",
    "event_counts": {},
    "confidence_score": 0.75
  },
  "focus_preview": {
    "headline": "...",
    "primary_issue": "...",
    "primary_action": "..."
  }
}
```

## 7. 영향도

### 7.1 사용자 경험
- 긍정 효과
  - 목록에서 "무엇이 문제인지"를 즉시 파악 가능
  - 상세에서 "어떻게 개선할지"를 바로 확인 가능
- 리스크
  - 메트릭 키 기반 행동 가이드 문구는 규칙 기반 추론이므로, 운동 종목/메트릭 확장 시 문구 규칙 보강이 필요

### 7.2 성능/복잡도
- 목록 페이지에서 불필요한 통계 쿼리를 제거해 응답 부담을 줄였다.
- 상세 API는 기존 조회 범위를 유지하면서 후처리 계산을 추가했다.

## 8. 검증 결과
- 문법 확인
  - `node -c controllers/history.js` 통과
  - `node -c public/js/history-page.js` 통과
- 테스트
  - `node test/history-metric-series.test.js` 통과
  - `node test/session-buffer.test.js` 통과
- 참고
  - 샌드박스 환경에서 `node --test ...`는 `spawn EPERM` 이슈가 있어 파일 단위 실행으로 대체 검증함

## 9. 후속 작업 제안
1. `session_analysis` 도입 후 `improvement_focus`를 LLM 결과 우선 + 규칙 기반 fallback 구조로 전환
2. 메트릭 키별 행동 가이드 사전(운동 종목별) 고도화
3. 히스토리 상세의 디버그 영역 접근 권한(운영/개발 모드) 분리
