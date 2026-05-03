# LLM Coaching 시스템 — Phase 1 설계 명세서

## 1. 문서 정보

- 작성일: 2026-05-03
- 상태: Draft
- 대상 프로젝트: FitPlus 웹캠 기반 AI 운동 코칭 서비스
- 선행 문서:
  - `docs/specs/2026-04-12_llm_feature_summarizer_spec.md` (Phase 1~3 전체 설계)
  - `docs/specs/2026-04-26_workout_voice_feedback_and_llm_analysis_extension_spec.md` (음성 피드백 + 이벤트 payload 설계)
- 문서 목적: Phase 1 (단일 세션 분석)의 구현 범위, 데이터 계약, 모듈 구조, API를 최종 확정한다.

## 2. 비전 요약

운동 세션 종료 후 rule-based scoring 결과를 구조화 feature로 요약하고, 이를 LLM에 전달하여 사용자 친화적인 코칭 리포트를 생성한다. Phase 1은 **단일 세션 분석**에 한정하며, DB 스키마 변경 없이 `session_event` 테이블의 `payload` JSONB를 활용한다.

향후 Phase 2에서 과거 5회 트렌드 비교, Phase 3에서 RAG 기반 지식 검색 + 개인화로 확장한다.

## 3. 결정 사항 요약

| 항목 | 결정 |
|---|---|
| 접근법 | 기존 spec 기반 점진 확장 (Phase 1 → 2 → 3) |
| Phase 1 범위 | 단일 세션 분석 (Feature Summarizer + LLM Coaching) |
| RAG 소스 (전체) | 사용자 운동 이력 + 운동 가이드/지식 + 외부 전문 지식 |
| Phase 1 RAG | 없음 (단일 세션 데이터만 사용) |
| LLM 실행 환경 | 서버 사이드 호출. provider/model은 설정 가능 (초기: OpenRouter API) |
| DB 전략 | Phase 1: `session_event` payload JSONB 활용 (스키마 변경 없음) |
| Phase 1 저장 방식 | `session_event` type=`SESSION_ANALYSIS`, payload에 feature_json/llm_output_json/confidence 등 저장 |

## 4. 시스템 흐름 (Phase 1)

```text
[운동 세션 종료]
       ↓
[1] Feature Summarizer (deterministic, 서버)
    - workout_session, session_snapshot_metric, session_event 조회
    - exercise metadata + metric guide 로드
    - SessionFeature JSON 생성
       ↓
[2] LLM Coaching Layer (서버)
    - SessionFeature + metric guide + prompt → LLM API 호출
    - JSON schema validation
    - 실패 시 fallback generator
       ↓
[3] 결과 저장
    - session_event(type='SESSION_ANALYSIS', payload={...}) 저장
       ↓
[4] 결과 조회 API
    - GET /api/sessions/:sessionId/analysis
    - 프론트엔드에서 렌더링
```

## 5. Feature Summarizer 상세 설계

### 5.1 출력 구조: SessionFeature JSON

```json
{
  "analysis_version": "fs_v1",
  "session": {
    "session_id": "uuid",
    "exercise_key": "squat",
    "exercise_name": "스쿼트",
    "selected_view": "FRONT",
    "duration_sec": 43,
    "rep_count": 1,
    "final_score": 62
  },
  "metrics": [
    {
      "key": "depth",
      "display_name": "스쿼트 깊이",
      "weight": 0.30,
      "avg_score": 30,
      "avg_raw_value": 9,
      "min_raw_value": 9,
      "max_raw_value": 9,
      "sample_count": 1,
      "normalized_severity": 0.72,
      "confidence": 0.45
    }
  ],
  "events": {
    "counts": {
      "NO_PERSON": 7,
      "LOW_SCORE_HINT": 1,
      "REP_COMPLETE_FEEDBACK": 1
    },
    "durations": {
      "NO_PERSON_SEC": 11.2
    }
  },
  "timeline": {
    "score_points": [
      { "t_sec": 15, "score": 0 },
      { "t_sec": 16, "score": 7 },
      { "t_sec": 18, "score": 18 },
      { "t_sec": 43, "score": 62 }
    ],
    "start_score": 0,
    "end_score": 62,
    "improvement_delta": 62,
    "stability_index": 0.38
  },
  "quality": {
    "detected_frame_ratio": 0.73,
    "camera_stability": 0.58,
    "sample_sufficiency": 0.42,
    "rep_sufficiency": 0.20,
    "overall_confidence": 0.49
  },
  "derived": {
    "top_issues": ["knee_alignment", "spine_angle"],
    "likely_camera_issue": true,
    "likely_low_sample_issue": true
  }
}
```

### 5.2 데이터 소스 매핑

| Feature 섹션 | 데이터 소스 | 비고 |
|---|---|---|
| session.* | workout_session 테이블 | exercise_key로 exercise 메타 조인 |
| metrics[] | session_snapshot_metric | exercise metric guide와 조인하여 display_name, weight, safety_priority 보완 |
| events.counts | session_event type별 count | payload 내 구조화 이벤트 활용 (LOW_SCORE_HINT, NO_PERSON 등) |
| events.durations | session_event 연속 구간 계산 | NO_PERSON 시작-종료 간격 |
| timeline.score_points | session_snapshot_score | recorded_at 기준 정렬 |
| quality.* | metrics + events에서 계산 | detected_frame_ratio, camera_stability, sample_sufficiency, rep_sufficiency |
| derived.top_issues | metrics weighted_severity 정렬 | safety_priority, actionability 가중 |

### 5.3 계산 규칙

#### normalized_severity

```text
metric_max_score = 100  (모든 메트릭 점수는 0~100 스케일)
metric_score_ratio = avg_score / metric_max_score
severity = 1 - metric_score_ratio
weighted_severity = severity * weight
```

#### metric confidence

```text
metric_confidence =
  0.5 * min(sample_count / expected_sample_count, 1.0)
+ 0.3 * detected_frame_ratio
+ 0.2 * view_metric_compatibility
```

- `expected_sample_count`: exercise scoring profile의 metric 정의에서 기대 샘플 수. Phase 1에서는 `duration_sec * 2`(초당 약 2샘플 가정)을 기본값으로 사용
- `view_metric_compatibility`: 해당 view에서 이 metric 해석 적합도 (0~1). exercise의 `allowed_views`와 metric 정의에서 산출. FRONT에서는 모든 metric 1.0, SIDE에서는 depth 등 일부 metric 0.5

#### top_issues 선정

```text
priority_score =
  0.45 * weighted_severity
+ 0.20 * safety_priority
+ 0.15 * persistence_score (Phase 1에서는 0)
+ 0.10 * actionability
- 0.10 * low_confidence_penalty
```

Phase 1에서 `persistence_score`는 항상 0 (과거 비교 없음). Phase 2에서 활성화.

#### overall_confidence

```text
overall_confidence =
  0.35 * detected_frame_ratio
+ 0.20 * camera_stability
+ 0.20 * sample_sufficiency
+ 0.15 * rep_sufficiency
+ 0.10 * view_compatibility
```

## 6. Metric Guide

### 6.1 구조

```json
{
  "exercise": "squat",
  "version": "v1",
  "metrics": {
    "depth": {
      "display_name": "스쿼트 깊이",
      "meaning": "얼마나 충분히 내려갔는지",
      "low_score_interpretation": "하강 깊이가 부족할 수 있음",
      "coaching_cues": [
        "엉덩이를 뒤로 빼며 내려가세요",
        "허벅지가 바닥과 가까워질 때까지 천천히 내려가세요"
      ],
      "safety_priority": 0.6,
      "actionability": 0.8
    },
    "knee_alignment": {
      "display_name": "무릎 정렬",
      "meaning": "무릎과 발끝 방향의 일치 정도",
      "low_score_interpretation": "무릎이 안쪽 또는 바깥쪽으로 흔들릴 수 있음",
      "coaching_cues": [
        "무릎과 발끝 방향을 맞추세요",
        "내려갈 때 무릎이 안으로 모이지 않게 하세요"
      ],
      "safety_priority": 0.9,
      "actionability": 0.9
    }
  }
}
```

### 6.2 관리 방식

- Phase 1: JSON 파일 (`analysis/metric-guides/squat.v1.json` 등)
- 향후: DB 테이블 또는 Admin UI로 이전 가능

### 6.3 지원 운동

Phase 1에서 squat, push_up, plank 3종에 대해 metric guide를 작성한다.

## 7. LLM Coaching Layer

### 7.1 입력

LLM 호출 시 아래 세 가지를 조합한다:

1. **System prompt**: 코칭 코치 역할, 제약 사항
2. **User prompt**: SessionFeature JSON + metric guide에서 해당 운동 excerpt
3. **Output schema**: JSON schema로 출력 형식 강제

### 7.2 출력 JSON Schema

```json
{
  "summary": "string",
  "strengths": ["string"],
  "main_issues": [
    {
      "metric_key": "string",
      "title": "string",
      "reason": "string",
      "priority": "high | medium | low"
    }
  ],
  "next_actions": ["string"],
  "camera_issue": {
    "detected": true,
    "reason": "string"
  },
  "confidence": {
    "score": 0.49,
    "label": "low | medium | high",
    "reason": "string"
  },
  "coach_comment": "string"
}
```

### 7.3 출력 제약

- `strengths`: 최대 2개
- `main_issues`: 최대 2개
- `next_actions`: 정확히 3개
- 한 문장 최대 2문장
- 추측 표현 금지
- 의학적 진단 금지
- 없는 데이터 해석 금지

### 7.4 System Prompt

```text
너는 운동 분석 코치다.
입력은 rule-based scoring engine이 생성한 구조화 세션 feature와 metric guide이다.
없는 사실을 추측하지 말고, 입력에 없는 해석은 하지 마라.
의학적 진단을 하지 마라.
카메라/인식 문제와 자세 문제를 구분해서 설명하라.
반드시 JSON schema만 출력하라.
한국어로 작성하라.
```

### 7.5 User Prompt 템플릿

```text
다음 세션 분석 입력을 바탕으로 사용자가 이해하기 쉬운 코칭 리포트를 생성하라.

요구사항:
1. 한 줄 요약 작성
2. 잘한 점 최대 2개
3. 가장 중요한 문제 최대 2개
4. 다음 세션 행동 지침 3개
5. 카메라 문제 여부 설명
6. 분석 신뢰도 설명
7. 모든 판단은 입력 데이터 기반으로만 하라

입력:
{feature_json}

metric guide:
{metric_guide_json}

출력 schema:
{output_schema}
```

### 7.6 LLM Provider 추상화

```ts
interface LLMProvider {
  name: string;
  generate(input: LLMInput): Promise<LLMOutput>;
}

interface LLMInput {
  systemPrompt: string;
  userPrompt: string;
  outputSchema: object;
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
}

interface LLMOutput {
  content: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}
```

초기 구현: OpenRouter API 호출 (`/api/v1/chat/completions`)

### 7.7 Fallback Generator

LLM 호출 실패 시 deterministic fallback:

- top issue 1~2개를 템플릿 기반으로 설명
- confidence 낮으면 카메라/인식 문제 우선 언급
- `next_actions`는 metric guide coaching cue에서 상위 3개 선택
- JSON schema 동일 형식 유지

## 8. 데이터 저장: session_event 활용

### 8.1 Phase 1 저장 방식

`session_analysis` 신규 테이블 대신 `session_event`의 `payload` JSONB를 사용한다.

```json
{
  "type": "SESSION_ANALYSIS",
  "session_id": "uuid",
  "user_id": "uuid",
  "occurred_at": "2026-05-03T12:00:00Z",
  "payload": {
    "analysis_version": "analysis_v1",
    "feature_version": "fs_v1",
    "metric_guide_version": "squat.v1",
    "llm_model": "openai/gpt-4o-mini",
    "status": "completed",
    "feature_json": { ... },
    "llm_output_json": { ... },
    "confidence_score": 0.49,
    "is_fallback": false,
    "created_at": "2026-05-03T12:00:00Z"
  }
}
```

### 8.2 선택 근거

- `session_event` 테이블과 `payload` JSONB 컬럼이 이미 존재
- DB 마이그레이션 없이 구현 가능
- JSONB 인덱스로 조회 성능 확보 가능
- Phase 2/3에서 필요시 전용 테이블로 이관 가능
- 음성 피드백 이벤트도 같은 테이블에 저장되어 일관성 유지

### 8.3 조회 방식

```sql
SELECT payload
FROM session_event
WHERE session_id = :sessionId
  AND type = 'SESSION_ANALYSIS'
ORDER BY occurred_at DESC
LIMIT 1;
```

### 8.4 재분석 시나리오

동일 세션에 대해 재분석 요청이 오면 새 `SESSION_ANALYSIS` 이벤트를 추가한다. 기존 결과는 이력으로 보존된다.

## 9. API 설계

### 9.1 분석 생성

```
POST /api/sessions/:sessionId/analyze
```

Response:
```json
{
  "sessionId": "uuid",
  "status": "queued | processing | completed | failed",
  "analysisId": "uuid"
}
```

### 9.2 분석 결과 조회

```
GET /api/sessions/:sessionId/analysis
```

Response:
```json
{
  "sessionId": "uuid",
  "status": "completed",
  "analysisVersion": "analysis_v1",
  "featureVersion": "fs_v1",
  "metricGuideVersion": "squat.v1",
  "llmModel": "openai/gpt-4o-mini",
  "result": {
    "summary": "...",
    "strengths": ["..."],
    "main_issues": [...],
    "next_actions": ["..."],
    "camera_issue": { "detected": true, "reason": "..." },
    "confidence": { "score": 0.49, "label": "low", "reason": "..." },
    "coach_comment": "..."
  },
  "isFallback": false,
  "createdAt": "2026-05-03T12:00:00Z"
}
```

### 9.3 재분석

```
POST /api/sessions/:sessionId/reanalyze
```

prompt 또는 guide version 변경 후 결과 재생성. 기존 결과는 이력 유지.

## 10. 서버 모듈 구조

```
backend/
  analysis/
    feature-summarizer/
      index.js                  — 진입점, orchestration
      session-feature-builder.js — 세션 메타 + timeline + quality 계산
      metric-feature-builder.js  — 메트릭별 severity/confidence 계산
      event-feature-builder.js   — 이벤트 집계 (counts, durations)
      top-issues.js              — priority_score 기반 정렬
      quality-score.js           — overall_confidence 산출
    metric-guides/
      squat.v1.json
      push_up.v1.json
      plank.v1.json
      index.js                  — 가이드 로더
    llm-coach/
      prompt-builder.js          — system/user prompt 조합
      output-schema.js           — JSON schema 정의
      llm-client.js              — provider 추상화 + OpenRouter 호출
      fallback-generator.js      — deterministic fallback
    repository/
      session-analysis.repository.js — session_event 기반 CRUD
    controller/
      session-analysis.controller.js — API 엔드포인트
    service/
      session-analysis.service.js     — 분석 파이프라인 orchestration
```

## 11. 기존 코드와의 연관

### 11.1 controllers/history.js

`buildMetricSeries`, `buildImprovementFocus`, `buildAccuracyFocus`, `buildCameraInsight` 등이 이미 풍부한 집계 로직을 포함하고 있다. Feature Summarizer는 이 로직과 겹치는 부분이 있으나:

- history.js는 **프론트엔드 히스토리 탭 렌더링**용
- Feature Summarizer는 **LLM 입력용 구조화 feature** 생성용
- 목적이 다르므로 독립 모듈로 구현하되, 공통 유틸은 추출 가능

### 11.2 controllers/workout.js

- `normalizeEvents()`가 이미 이벤트 정규화 처리
- `buildSafeEventPayload()`가 payload allowlist 관리
- `endWorkoutSession()`이 세션 종료 시 스냅샷/메트릭 저장
- 세션 종료 후 분석 트리거 포인트: `endWorkoutSession` 완료 후

### 11.3 public/js/workout/session-buffer.js

- `recordEvent(event)`가 표준 피드백 이벤트 저장
- `export().events`에 구조화 이벤트 보존
- 서버 전송 시 이벤트가 `session_event`에 저장됨

## 12. 프론트엔드 반영

결과 페이지 (`views/workout/result.ejs` 또는 히스토리 상세)에 아래 블록을 추가한다:

1. **AI 한줄 요약** — `result.summary`
2. **잘한 점** — `result.strengths[]`
3. **가장 중요한 교정 포인트** — `result.main_issues[]`
4. **다음 세션 체크리스트** — `result.next_actions[]`
5. **분석 신뢰도 배지** — `result.confidence.label`
6. **카메라/인식 이슈 경고** — `result.camera_issue.detected`

### UI 우선순위

- 최종 점수보다 **먼저 고칠 것 1개**를 상단 배치
- confidence가 낮으면 경고 박스를 점수 위에 배치
- "점수는 낮지만 카메라 문제 가능성 있음"을 분리 표시
- 분석이 진행 중이면 로딩 스피너 + "AI 분석 중..." 표시
- 분석 실패 시 fallback 결과 표시 (fallback 여부 라벨은 숨김)

## 13. 비기능 요구사항

### 13.1 응답 성능

- 세션 종료 후 **3초 이내** 1차 결과 제공 권장
- **10초 이내** 분석 완료 목표
- 비동기 처리: 프론트엔드는 polling 또는 결과 조회 API로 상태 확인

### 13.2 일관성

- 동일 feature JSON + 동일 analysis version 조합 → 의미적으로 유사한 결과
- prompt, model, metric guide 버전을 결과에 저장

### 13.3 확장성

- squat, push_up, plank 외 운동 추가 시 metric guide와 summarizer mapping만 추가
- Phase 2에서 과거 5회 비교 feature를 동일 구조에 추가
- Phase 3에서 RAG context를 prompt에 주입

### 13.4 안전성

- 의학적 진단, 치료 조언, 확정적 부상 판단 금지
- 불확실한 경우 명시적으로 신뢰도 낮음 표시

## 14. Phase 2/3 확장 포인트

### Phase 2: 과거 5회 트렌드 비교
- `derived` 섹션에 `persistence_score` 추가
- `events` 대비 과거 세션의 반복 issue 비교
- SessionFeature에 `history` 블록 추가:
  ```json
  {
    "history": {
      "recent_sessions_count": 5,
      "avg_score": 58,
      "improving_metrics": ["depth"],
      "recurring_issues": ["knee_alignment"],
      "score_trend": "improving"
    }
  }
  ```
- LLM 출력에 과거 대비 문장 추가

### Phase 3: RAG 기반 지식 검색 + 개인화
- pgvector 확장 추가 (Supabase 지원)
- session_analysis feature_json 임베딩 저장
- 운동 가이드 지식 청크 임베딩 저장
- 사용자 baseline retrieval
- 코사인 유사도 기반 관련 지식 검색 → LLM context에 주입

## 15. 완료 기준 (Phase 1)

1. 스쿼트/푸쉬업/플랭크 3개 운동에 대해 분석 결과 생성 가능
2. Feature Summarizer가 deterministic하게 SessionFeature JSON 생성
3. LLM 호출이 성공하면 schema-bound JSON 반환
4. LLM 호출 실패 시 fallback이 동일 schema JSON 반환
5. 결과가 `session_event.type='SESSION_ANALYSIS'`에 저장됨
6. `GET /api/sessions/:sessionId/analysis`로 결과 조회 가능
7. 프론트엔드 결과 페이지에 코칭 리포트 렌더링
8. 분석 진행 중/실패 상태 표시

## 16. 위험 요소 및 대응

| 위험 | 대응 |
|---|---|
| LLM 과도 추론 | metric guide + schema 제한 + prompt 제약 + fallback |
| camera/posture 혼동 | confidence 분리 + NO_PERSON 지속시간 반영 + 단정 표현 금지 |
| 샘플 수 부족 | rep_sufficiency 반영 + low sample은 참고용 표시 |
| metric 확장 유지보수 | metric guide 사전화 + summarizer mapping 분리 + 버전 관리 |
| LLM API 장애 | fallback generator + 재시도 + 에러 로깅 |
| 응답 지연 | 비동기 처리 + polling + fallback 우선 표시 |