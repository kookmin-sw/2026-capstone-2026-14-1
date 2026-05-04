# FitPlus AI 성장 리포트 — 설계 명세서

> **본 문서는 `docs/specs/2026-04-12_llm_feature_summarizer_spec.md`(Phase 1~3) 및 `docs/superpowers/specs/2026-05-03-llm-coaching-phase1-design.md`의 개선판이다.**
> 기존 Phase 1 단일 세션 분석을 포함하여 과거 히스토리 트렌드 분석까지 통합한 최종 설계로, 이전 스펙을 대체한다.

## 1. 문서 목적

본 문서는 FitPlus의 기존 운동 히스토리를 바탕으로 사용자에게 다음 세 가지를 제공하는 AI 코칭 기능의 고정 설계 명세서다.

1. 최근 운동에서 무엇이 좋아졌는지
2. 아직 무엇이 부족한지
3. 다음 운동에서 무엇을 보강해야 하는지

이 기능은 단순한 LLM 답변 생성이 아니라, 기존 운동 기록을 구조화해 분석한 뒤 LLM이 사용자 친화적인 코칭 리포트로 변환하는 방식으로 구현한다.

---

## 2. 최종 기능 정의

### 기능명

**AI 성장 리포트**

### 보조 기능명

**오늘의 운동 미션**

### 사용자에게 보여줄 가치 문장

FitPlus는 단순히 오늘의 운동 점수만 보여주지 않는다. 지난 운동 기록을 바탕으로 사용자가 무엇을 개선했는지, 어떤 자세가 반복적으로 부족했는지, 다음 운동에서 무엇에 집중해야 하는지를 자동으로 정리해준다.

---

## 3. 핵심 방향

### 3.1 하지 않는 것

- Phase 1에서 RAG를 도입하지 않는다.
- 새 DB 테이블을 만들지 않는다.
- MCP를 사용자-facing 런타임 경로에 넣지 않는다.
- LLM이 raw 운동 기록을 직접 해석하게 하지 않는다.
- 클라이언트 저장소를 개인화의 원천 데이터로 사용하지 않는다.

### 3.2 하는 것

- 기존 DB의 운동 히스토리를 서버에서 조회한다.
- 서버에서 deterministic하게 성장/약점/다음 집중 포인트를 계산한다.
- 계산 결과를 `HistoryTrendFeature` JSON으로 구조화한다.
- LLM은 해당 JSON을 한국어 코칭 리포트로 변환한다.
- MVP에서는 결과를 저장하지 않고 on-demand로 생성한다. 캐시는 별도 schema migration 이후 활성화한다.
- 프론트엔드는 결과를 `AI 성장 리포트`와 `오늘의 운동 미션`으로 보여준다.

---

## 4. 제품 UX 목표

사용자에게는 “AI가 분석한다”보다 다음 경험이 중요하다.

```text
지난 기록을 보니 내가 무엇을 잘하고 있는지 알 수 있다.
계속 부족한 자세가 무엇인지 알 수 있다.
다음 운동에서 딱 무엇에 집중해야 하는지 알 수 있다.
```

따라서 UI의 중심은 긴 리포트가 아니라 다음 순서로 구성한다.

1. 한 줄 성장 요약
2. 좋아진 점
3. 반복 약점
4. 다음 운동 미션 1개
5. 분석 신뢰도 및 카메라/인식 이슈
6. 근거 보기

---

## 5. 전체 시스템 흐름

```text
[사용자 히스토리/결과 페이지 진입]
        ↓
[서버 API 호출]
GET /api/users/me/coach-report?period=recent_5
        ↓
[History Trend Analyzer]
- 최근 N회 운동 세션 조회
- 운동별/metric별 점수 집계
- 개선 metric 계산
- 반복 약점 계산
- 하락 metric 계산
- 카메라/인식 문제 집계
        ↓
[HistoryTrendFeature JSON 생성]
        ↓
[Confidence Gate]
- 데이터가 충분하면 LLM 호출
- 데이터가 부족하거나 LLM 실패 시 fallback 생성
        ↓
[LLM Coaching Layer]
- JSON 입력 기반 한국어 리포트 생성
        ↓
[MVP: 저장 없음 — on-demand 응답만 반환]
        ↓
[프론트 렌더링]
AI 성장 리포트 + 오늘의 운동 미션
```

---

## 6. 데이터 저장 전략

### 6.1 원칙

새 테이블을 만들지 않는다.

개인화의 원천 데이터는 기존 DB에 저장된 운동 기록이다. 클라이언트 저장소나 LLM 응답 결과를 신뢰 가능한 원천 데이터로 사용하지 않는다.

### 6.2 기존 DB 활용

주요 데이터 소스는 다음과 같다.

```text
workout_session
session_snapshot
session_snapshot_score
session_snapshot_metric
session_event
routine_instance
routine_step_instance
workout_set
```

### 6.3 선택적 캐시 저장 (Deferred)

> **Phase 1 MVP 결정:** 현재 `session_event`는 `session_id NOT NULL`이며 사용자 단위 캐시용 `user_id`, `occurred_at` 컬럼이 없다. 따라서 MVP에서는 리포트를 저장하지 않는 on-demand 생성으로 구현하고, 사용자 단위 캐시는 별도 migration 이후 활성화한다.

향후 migration 적용 시 저장 형식:

```json
{
  "type": "AI_HISTORY_REPORT",
  "session_id": null,
  "user_id": "uuid",
  "occurred_at": "2026-05-03T12:00:00Z",
  "payload": {
    "report_version": "growth_report_v1",
    "history_feature_version": "htf_v1",
    "period": "recent_5",
    "exercise_key": "squat",
    "status": "completed",
    "history_context": {},
    "llm_output_json": {},
    "is_fallback": false,
    "fallback_reason": null,
    "llm_model": "openrouter/model-name",
    "created_at": "2026-05-03T12:00:00Z"
  }
}
```

### 6.4 캐시 정책

MVP에서는 **on-demand**로 구현한다. 모든 요청마다 기존 DB에서 히스토리를 조회하고, HistoryTrendFeature를 생성한 뒤 LLM 또는 fallback으로 리포트를 생성하여 응답만 반환한다. `source`는 항상 `"generated"`이다.

캐시는 아래 migration 적용 후 활성화할 수 있다.

```sql
ALTER TABLE session_event
  ALTER COLUMN session_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_user(user_id),
  ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_session_event_user_type_occurred
  ON session_event (user_id, type, occurred_at DESC);
```

---

## 7. 클라이언트 저장소 사용 범위

### 7.1 클라이언트에 저장해도 되는 것

클라이언트 저장소는 표시용 캐시 또는 UI 상태 저장에만 사용한다.

```text
최근 AI 리포트 표시 캐시
카드 접힘/펼침 상태
마지막으로 본 리포트 ID
사용자 피드백 톤 선호
최근 선택한 운동 종류
```

### 7.2 클라이언트에 저장하면 안 되는 것

```text
전체 운동 히스토리
장기 개인화 프로필
약점 누적 통계의 원본
LLM 판단 근거 원본
세션별 raw metric 전체
사용자 baseline의 단일 원천
```

### 7.3 원칙

클라이언트 데이터는 조작 가능하므로 LLM 판단의 핵심 근거로 사용하지 않는다.

개인화 판단은 항상 서버가 기존 DB에서 운동 히스토리를 조회해 생성한 `HistoryTrendFeature`를 기준으로 한다.

---

## 8. MCP 및 Skills 정책

### 8.1 MCP

MCP는 사용자-facing 런타임 경로에 넣지 않는다.

비추천 구조:

```text
프론트 요청
→ 서버
→ MCP Client
→ MCP Server
→ DB Tool
→ Feature Tool
→ LLM
```

이 구조는 현재 기능에 비해 복잡도가 높고, 인증/권한/디버깅 부담이 크다.

MCP는 향후 개발/디버깅/평가용으로만 고려한다.

예상 MCP tool:

```text
getSessionFeature(sessionId)
getRecentWorkoutSummary(userId, exerciseKey, limit)
getMetricGuide(exerciseKey)
previewCoachPrompt(userId, period)
runFallbackGrowthReport(userId, period)
```

### 8.2 내부 Coaching Skill Package

실제 ChatGPT Skills를 런타임에 직접 쓰는 대신, 프로젝트 내부에 skill-like 구조를 둔다.

```text
backend/analysis/coaching-skills/growth-report.v1/
  SKILL.md
  prompt.system.txt
  prompt.user.txt
  output-schema.json
  fallback-rules.json
  examples/
    improving-squat.json
    recurring-weakness.json
    low-confidence-camera.json
```

이 패키지는 다음을 관리한다.

```text
LLM 역할
금지 표현
출력 schema
confidence 낮을 때 표현 방식
metric guide 기반 next action 생성 규칙
fallback 생성 규칙
예시 입력/출력
```

---

## 9. 핵심 서버 모듈 구조

```text
backend/
  analysis/
    history-trend/
      history-context-builder.js
      metric-trend-builder.js
      improvement-detector.js
      weakness-detector.js
      regression-detector.js
      next-focus-builder.js
      data-quality-builder.js
      history-trend-analyzer.js

    metric-guides/
      squat.v1.json
      push_up.v1.json
      plank.v1.json
      index.js

    coaching-skills/
      growth-report.v1/
        SKILL.md
        prompt.system.txt
        prompt.user.txt
        output-schema.json
        fallback-rules.json
        examples/

    llm-coach/
      prompt-builder.js
      output-validator.js
      llm-client.js
      fallback-growth-report-generator.js

    repository/
      workout-history.repository.js
      ai-history-report.repository.js

    service/
      ai-growth-report.service.js

    controller/
      ai-growth-report.controller.js
```

---

## 10. HistoryTrendFeature JSON

LLM에 전달하기 전 서버가 deterministic하게 생성하는 핵심 입력이다.

```json
{
  "feature_version": "htf_v1",
  "user_scope": {
    "user_id": "uuid",
    "period_type": "recent_sessions",
    "session_count": 5,
    "exercise_key": "squat",
    "exercise_name": "스쿼트"
  },
  "overall": {
    "recent_avg_score": 68,
    "previous_avg_score": 61,
    "score_delta": 7,
    "trend": "improving",
    "completed_sessions": 5,
    "aborted_sessions": 0
  },
  "improvements": [
    {
      "metric_key": "depth",
      "metric_name": "스쿼트 깊이",
      "previous_avg": 48,
      "recent_avg": 66,
      "delta": 18,
      "confidence": 0.72,
      "evidence": "최근 구간에서 depth 평균 점수가 48점에서 66점으로 상승"
    }
  ],
  "weak_points": [
    {
      "metric_key": "knee_alignment",
      "metric_name": "무릎 정렬",
      "recent_avg": 55,
      "occurrence_count": 4,
      "session_count": 5,
      "confidence": 0.68,
      "evidence": "최근 5회 중 4회에서 knee_alignment가 낮게 측정됨"
    }
  ],
  "regressions": [
    {
      "metric_key": "spine_angle",
      "metric_name": "상체 각도",
      "previous_avg": 72,
      "recent_avg": 61,
      "delta": -11,
      "confidence": 0.61,
      "evidence": "최근 구간에서 spine_angle 평균 점수가 11점 하락"
    }
  ],
  "data_quality": {
    "camera_issue_count": 2,
    "no_person_count": 3,
    "low_sample_sessions": 1,
    "overall_confidence": 0.64,
    "confidence_label": "medium",
    "note": "일부 세션에서 카메라 인식 문제가 있었으나 반복 패턴 판단은 가능함"
  },
  "next_focus_candidates": [
    {
      "metric_key": "knee_alignment",
      "metric_name": "무릎 정렬",
      "priority": 1,
      "reason": "반복 빈도와 safety_priority가 높음",
      "recommended_cues": [
        "무릎과 발끝 방향을 맞추세요",
        "내려갈 때 무릎이 안으로 모이지 않게 하세요"
      ]
    }
  ]
}
```

---

## 11. 분석 기준

### 11.1 좋아진 점

좋아진 점은 최근 구간과 이전 구간의 metric 평균을 비교해 계산한다.

```text
metric_delta = recent_avg - previous_avg
```

개선으로 판단하는 기본 기준:

```text
metric_delta >= +8
confidence >= 0.45
sample_count 충분
```

예시:

```text
depth 이전 평균 48점
최근 평균 66점
delta +18
→ 좋아진 점으로 선정
```

### 11.2 부족한 점

부족한 점은 최근 구간에서 반복적으로 낮은 metric을 기준으로 한다.

기본 기준:

```text
recent_avg < 65
또는 최근 N회 중 60점 미만 발생 비율 >= 0.5
confidence >= 0.45
```

예시:

```text
knee_alignment 최근 5회 중 4회 낮음
recent_avg 55점
→ 반복 약점으로 선정
```

### 11.3 나빠진 점

나빠진 점은 이전 구간 대비 점수가 의미 있게 하락한 metric이다.

기본 기준:

```text
metric_delta <= -8
confidence >= 0.45
```

나빠진 점은 사용자에게 과도하게 부정적으로 보이지 않도록 “주의할 점” 또는 “최근 흔들린 항목”으로 표현한다.

### 11.4 다음 보강 포인트

다음 보강 포인트는 다음 요소를 종합해 1개를 우선 선정한다.

```text
반복 약점 여부
최근 평균 점수
safety_priority
actionability
confidence
camera/data quality issue 여부
```

기본 priority score:

```text
priority_score =
  0.35 * weakness_score
+ 0.25 * safety_priority
+ 0.20 * actionability
+ 0.10 * regression_score
+ 0.10 * confidence
```

단, confidence가 낮으면 자세 문제를 단정하지 않는다.

```text
if metric_confidence < 0.35:
  posture weakness로 선정하지 않음
  data quality issue로 분리
```

---

## 12. Metric Guide

운동별 metric의 의미, 중요도, 교정 cue를 JSON으로 관리한다.

예시:

```json
{
  "exercise": "squat",
  "version": "v1",
  "metrics": {
    "knee_alignment": {
      "display_name": "무릎 정렬",
      "meaning": "무릎과 발끝 방향의 일치 정도",
      "low_score_interpretation": "무릎이 안쪽 또는 바깥쪽으로 흔들릴 수 있음",
      "coaching_cues": [
        "무릎과 발끝 방향을 맞추세요",
        "내려갈 때 무릎이 안으로 모이지 않게 하세요"
      ],
      "safety_priority": 0.9,
      "actionability": 0.9,
      "view_compatibility": {
        "FRONT": 1.0,
        "SIDE": 0.4
      }
    },
    "depth": {
      "display_name": "스쿼트 깊이",
      "meaning": "충분히 내려가는 동작의 안정성",
      "low_score_interpretation": "하강 깊이가 부족할 수 있음",
      "coaching_cues": [
        "엉덩이를 뒤로 빼며 천천히 내려가세요",
        "반복 수보다 하강 동작의 일관성을 우선하세요"
      ],
      "safety_priority": 0.6,
      "actionability": 0.8,
      "view_compatibility": {
        "FRONT": 0.6,
        "SIDE": 1.0
      }
    }
  }
}
```

초기 지원 운동:

```text
squat
push_up
plank
```

---

## 13. LLM 역할

LLM은 분석 판단의 주체가 아니다.

LLM의 역할은 서버가 만든 `HistoryTrendFeature`를 사용자 친화적인 한국어 리포트로 변환하는 것이다.

### LLM이 하면 안 되는 것

```text
입력에 없는 운동 기록 추측
의학적 진단
부상 여부 단정
metric guide에 없는 새로운 운동 처방 생성
카메라 문제를 자세 문제로 단정
raw score를 임의로 재해석
```

### LLM이 해야 하는 것

```text
좋아진 점 설명
반복 약점 설명
다음 운동 미션 설명
근거를 사용자 언어로 변환
confidence가 낮을 때 조심스럽게 표현
카메라/인식 문제와 자세 문제 분리
```

---

## 14. LLM Prompt

### 14.1 System Prompt

```text
너는 운동 히스토리 분석 코치다.
입력은 서버가 기존 운동 기록을 분석해 만든 구조화 JSON이다.
너의 역할은 사용자가 이해하기 쉬운 한국어 성장 리포트를 작성하는 것이다.

규칙:
- 입력에 없는 사실을 추측하지 마라.
- 의학적 진단, 치료 조언, 부상 판단을 하지 마라.
- 자세 문제와 카메라/인식 문제를 구분해서 설명하라.
- 판단 근거는 입력 JSON의 점수 변화, 반복 횟수, metric 이름, confidence에만 둔다.
- 다음 운동 미션은 metric guide의 coaching_cues 또는 next_focus_candidates에 근거해야 한다.
- confidence가 낮으면 단정하지 말고 참고용이라고 설명하라.
- 반드시 JSON schema만 출력하라.
- 한국어로 작성하라.
```

### 14.2 User Prompt Template

```text
다음 운동 히스토리 분석 입력을 바탕으로 AI 성장 리포트를 생성하라.

작성해야 할 내용:
1. 최근 운동 흐름 한 줄 요약
2. 좋아진 점
3. 아직 부족한 점
4. 다음 운동에서 집중할 미션 1개
5. 분석 신뢰도와 카메라/인식 이슈 설명
6. 사용자를 위한 짧은 코치 코멘트

입력:
{history_trend_feature_json}

metric guide:
{metric_guide_json}

출력 schema:
{output_schema_json}
```

---

## 15. LLM 출력 Schema

```json
{
  "summary": "string",
  "improvements": [
    {
      "title": "string",
      "evidence": "string",
      "meaning": "string"
    }
  ],
  "weak_points": [
    {
      "title": "string",
      "evidence": "string",
      "meaning": "string"
    }
  ],
  "next_mission": {
    "title": "string",
    "action": "string",
    "reason": "string",
    "metric_key": "string"
  },
  "data_quality_note": {
    "label": "high | medium | low",
    "message": "string"
  },
  "coach_comment": "string"
}
```

### 출력 제한

```text
summary: 1문장
improvements: 최대 2개
weak_points: 최대 2개
next_mission: 정확히 1개
coach_comment: 최대 2문장
각 evidence에는 입력 JSON에 있는 수치 또는 반복 횟수를 포함
```

---

## 16. Fallback Generator

LLM 호출 실패, timeout, schema validation 실패, 또는 confidence 부족 시 deterministic fallback을 사용한다.

### fallback 사용 조건

```text
LLM API timeout
LLM API error
JSON parse 실패
schema validation 실패
overall_confidence < 0.35
운동 세션 수 부족
metric sample 부족
```

### fallback 출력 원칙

```text
좋아진 점은 improvement-detector 결과에서 선택
부족한 점은 weakness-detector 결과에서 선택
next_mission은 next_focus_candidates[0] 사용
confidence 낮으면 자세 문제 단정 금지
출력 schema는 LLM 출력과 동일
```

예시 fallback reason:

```text
LOW_CONFIDENCE
LLM_TIMEOUT
SCHEMA_INVALID
PROVIDER_ERROR
INSUFFICIENT_HISTORY
```

---

## 17. API 설계

### 17.1 AI 성장 리포트 조회/생성

```http
GET /api/users/me/coach-report?period=recent_5&exercise=squat
```

#### Query Parameters

```text
period:
  recent_5
  recent_10
  last_7_days
  last_30_days

exercise:
  squat
  push_up
  plank
  all
```

#### 동작

```text
1. 현재 로그인 사용자 확인
2. 기존 DB에서 히스토리 조회
3. HistoryTrendFeature 생성
4. confidence gate 통과 여부 확인
5. LLM 또는 fallback으로 리포트 생성
6. 결과 반환 (source: "generated")
```

> MVP에서는 캐시 조회 및 저장을 수행하지 않는다. `GET`과 `POST rebuild` 모두 on-demand 계산한다.

#### Response

```json
{
  "status": "completed",
  "source": "generated",
  "reportVersion": "growth_report_v1",
  "historyFeatureVersion": "htf_v1",
  "period": "recent_5",
  "exercise": "squat",
  "result": {
    "summary": "최근 5회 스쿼트 기록에서 전체 점수는 좋아지고 있지만, 무릎 정렬은 아직 반복적인 약점입니다.",
    "improvements": [
      {
        "title": "스쿼트 깊이가 좋아졌습니다",
        "evidence": "depth 평균 점수가 48점에서 66점으로 상승했습니다.",
        "meaning": "이전보다 충분히 내려가는 동작이 안정되고 있습니다."
      }
    ],
    "weak_points": [
      {
        "title": "무릎 정렬은 아직 보완이 필요합니다",
        "evidence": "최근 5회 중 4회에서 knee_alignment가 낮게 측정되었습니다.",
        "meaning": "반복 중 무릎이 발끝 방향과 어긋나는 패턴이 있을 수 있습니다."
      }
    ],
    "next_mission": {
      "title": "오늘은 무릎과 발끝 방향 맞추기",
      "action": "다음 스쿼트에서는 반복 수보다 무릎과 발끝 방향을 맞추는 데 집중하세요.",
      "reason": "무릎 정렬이 최근 기록에서 가장 반복적인 약점으로 나타났습니다.",
      "metric_key": "knee_alignment"
    },
    "data_quality_note": {
      "label": "medium",
      "message": "일부 세션에서 카메라 인식 문제가 있었지만 반복 패턴은 참고할 수 있습니다."
    },
    "coach_comment": "좋아진 깊이는 유지하면서, 다음 운동에서는 무릎 정렬 하나에 집중하는 것이 좋습니다."
  },
  "isFallback": false,
  "fallbackReason": null,
  "createdAt": "2026-05-03T12:00:00Z"
}
```

### 17.2 강제 재생성

```http
POST /api/users/me/coach-report/rebuild
```

#### Body

```json
{
  "period": "recent_5",
  "exercise": "squat"
}
```

#### 동작

새 리포트를 on-demand로 생성한다. MVP에서는 저장하지 않고 응답만 반환한다.

---

## 18. 프론트엔드 UI 구성

### 18.1 히스토리 페이지 상단 카드

```text
AI 성장 리포트

최근 5회 스쿼트 기록을 보면 전체 점수는 조금씩 좋아지고 있습니다.
특히 스쿼트 깊이는 개선됐지만, 무릎 정렬은 아직 반복적인 약점입니다.

좋아진 점
+ 스쿼트 깊이: 48점 → 66점

부족한 점
- 무릎 정렬: 최근 5회 중 4회 낮음

오늘의 운동 미션
무릎과 발끝 방향을 맞추는 데 집중하세요.

분석 신뢰도
중간 — 일부 세션에서 카메라 인식 문제가 있었습니다.
```

### 18.2 운동 시작 전 미션 카드

운동 시작 화면에 최근 리포트의 `next_mission`을 표시한다.

```text
오늘의 AI 미션

지난 기록 기준으로 무릎 정렬이 반복 약점입니다.
오늘은 반복 수보다 무릎과 발끝 방향을 맞추는 데 집중하세요.
```

### 18.3 운동 종료 직후 카드

운동 종료 후 기존 결과와 함께 간단한 코칭 요약을 표시한다.

```text
오늘의 AI 코칭

좋아진 점:
스쿼트 깊이가 최근 평균보다 좋아졌습니다.

아쉬운 점:
무릎 정렬은 아직 낮게 나타났습니다.

다음 운동 목표:
무릎과 발끝 방향 맞추기
```

---

## 19. 사용자-facing 문구

### 서비스 소개 문구

```text
FitPlus는 오늘의 점수만 보여주지 않습니다.
지난 운동 기록을 바탕으로 무엇이 좋아졌고, 어떤 자세가 반복적으로 부족했는지 분석한 뒤, 다음 운동에서 집중할 목표를 자동으로 제안합니다.
```

### 기능 카드 문구

```text
내 기록을 바탕으로 만든 AI 성장 리포트
```

```text
최근 기록에서 반복된 약점을 찾아 다음 운동 미션을 추천합니다.
```

```text
오늘은 이것만 집중하세요.
```

---

## 20. 구현 우선순위

### 1순위: HistoryTrendFeature 생성

LLM 없이도 다음 JSON이 안정적으로 생성되어야 한다.

```text
overall
improvements
weak_points
regressions
data_quality
next_focus_candidates
```

### 2순위: deterministic fallback

LLM 없이도 사용자에게 보여줄 수 있는 리포트를 생성한다.

### 3순위: LLM 연결

OpenRouter 등 provider를 통해 리포트를 생성한다.

필수 조건:

```text
timeout 설정
JSON schema validation
schema invalid 시 fallback
LLM 실패 시 fallback
temperature 낮게 설정
```

### 4순위: session_event 캐시 (Deferred)

`AI_HISTORY_REPORT` 이벤트 저장은 schema migration 이후 활성화한다.

### 5순위: 프론트 UI

히스토리 페이지와 운동 시작 화면에 다음을 표시한다.

```text
AI 성장 리포트
오늘의 운동 미션
분석 신뢰도
근거 보기
```

---

## 21. 완료 기준

MVP 완료 기준은 다음과 같다.

1. 최근 5회 운동 기록을 조회할 수 있다.
2. 운동별 평균 점수 변화가 계산된다.
3. 좋아진 metric이 계산된다.
4. 반복 약점 metric이 계산된다.
5. 다음 운동 미션 1개가 생성된다.
6. 카메라/인식 문제를 data quality로 분리한다.
7. LLM 호출 성공 시 JSON schema에 맞는 리포트가 반환된다.
8. LLM 실패 시 fallback 리포트가 반환된다.
9. 히스토리 페이지에 AI 성장 리포트가 표시된다.
10. 운동 시작 전 화면에 오늘의 운동 미션이 표시된다.
11. 새 DB 테이블 없이 기존 DB 데이터로 on-demand 동작한다.

---

## 22. Phase 확장 계획

### Phase 1: AI 성장 리포트 MVP

```text
최근 5회 기준
운동별 분석
좋아진 점
반복 약점
오늘의 운 동 미션
```

### Phase 2: 개인화 고도화

```text
최근 30일 분석
운동 루틴 완료율 분석
사용자별 baseline 계산
운동별 장기 약점 추적
AI_PROFILE_SNAPSHOT 이벤트 선택 저장
```

### Phase 3: RAG 도입

```text
운동 가이드 지식 검색
metric별 자세 설명 검색
보강 운동 추천 지식 검색
pgvector 기반 리포트/지식 retrieval
```

### Phase 4: 개발용 MCP 도입 검토

```text
세션 feature 디버깅
prompt preview
metric guide 검증
low confidence 사례 수집
```

---

## 23. 최종 핵심 정리

이 기능의 본질은 LLM이 아니라 운동 히스토리 기반 개인화 피드백이다.

```text
기존 운동 기록
→ History Trend Analyzer
→ 좋아진 점 / 부족한 점 / 다음 보강점 계산
→ LLM이 사용자 친화적 리포트로 변환
→ 다음 운동 미션으로 연결
```

사용자에게 어필해야 할 핵심 메시지는 다음이다.

```text
지난 기록을 보고 내가 좋아진 점과 반복 약점을 알려주고,
다음 운동에서 집중할 목표를 정해주는 개인 코치
```

따라서 구현의 우선순위는 다음과 같다.

```text
RAG보다 HistoryTrendFeature
MCP보다 내부 Coaching Skill Package
새 DB 테이블보다 기존 DB 기반 요약
긴 AI 리포트보다 다음 운동 미션
```
