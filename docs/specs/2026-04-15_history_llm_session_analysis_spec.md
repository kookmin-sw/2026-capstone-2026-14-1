# 히스토리 전용 LLM 분석 + `session_analysis` DB 확장 스펙

## 1. 문서 정보

- 문서명: 히스토리 전용 LLM 분석 DB 확장 스펙
- 대상 프로젝트: FitPlus 웹캠 기반 운동 코칭 서비스
- 문서 목적: 현재 저장되는 운동 세션 데이터를 기반으로, 히스토리 상세에서만 노출되는 사후 분석 레이어를 정의한다.
- 문서 범위: DB 변경 필요성, 신규 분석 테이블 구조, 저장 데이터 계약, 생성 흐름, 히스토리 API 확장 범위를 포함한다.

---

## 2. 배경 및 현재 구조

현재 시스템은 아래 정보를 이미 저장하고 있다.

- `workout_session`: 세션 대표 정보
- `session_snapshot`, `session_snapshot_score`: 중간/최종 점수 스냅샷
- `session_snapshot_metric`: 최종 메트릭 집계
- `session_event`: 운동 중 이벤트 로그

즉, 현재 DB는 **운동 중 무엇이 있었는가**를 저장한다.

하지만 사용자가 히스토리에서 원하는 것은 다음에 가깝다.

- 점수가 왜 낮았는지
- 자세 문제와 카메라 문제 중 무엇이 더 큰 원인인지
- 무엇부터 고쳐야 하는지
- 다음 세션에서 어떤 행동을 하면 되는지

이 정보는 원본 세션 데이터가 아니라, 원본 데이터를 읽고 난 뒤 만들어지는 **해석 결과**다.

---

## 3. 문제 정의

현재 구조만으로는 아래 문제가 남는다.

1. 숫자와 이벤트는 저장되지만, 사용자 친화적인 해석 결과는 저장되지 않는다.
2. 히스토리 모달을 열 때마다 즉석에서 LLM을 호출하면 응답 지연과 비용이 커진다.
3. 기존 핵심 세션 테이블에 LLM JSON을 섞어 넣으면 역할이 혼합된다.
4. 이 저장 경로는 최근 대용량 JSON(`detail`, `payload`) 의존을 줄이는 방향으로 정리되었기 때문에, 기존 테이블에 다시 큰 분석 JSON을 밀어 넣는 것은 방향이 좋지 않다.

---

## 4. 목표

### 4.1 핵심 목표

- 운동 종료 직후, 세션 데이터를 읽어 분석용 feature를 생성한다.
- feature를 기반으로 LLM 결과 또는 deterministic fallback 결과를 만든다.
- 분석 결과는 히스토리 상세에서 재사용 가능하도록 DB에 저장한다.
- 기존 운동 저장 경로와 분석 저장 경로를 분리한다.

### 4.2 이번 단계의 범위

- 히스토리 상세 모달 전용 분석 노출
- 세션 종료 직후 분석 생성
- 세션당 분석 결과 1건 유지
- 최소 DB 변경: 신규 분석 테이블 1개 추가

---

## 5. 비목표

이번 단계에서 포함하지 않는 항목은 아래와 같다.

- 결과 페이지(`views/workout/result.ejs`)에 즉시 LLM 블록 추가
- 프레임 단위 실시간 LLM 판정
- raw pose landmark 자체 저장/전달
- 다중 분석 버전 히스토리 관리
- 별도 job log 테이블 도입

---

## 6. 설계 원칙

1. **기존 운동 기록층은 유지한다.**
2. **LLM 분석층은 별도 테이블로 분리한다.**
3. **LLM에는 raw landmark가 아니라 저장된 집계값만 전달한다.**
4. **LLM 실패 시에도 화면에 표시 가능한 fallback 결과를 남긴다.**
5. **현재 코드베이스의 실제 타입을 따른다.** 특히 `workout_session.session_id`는 문서 예시의 UUID가 아니라 실제 코드 기준 `BIGINT`다.

---

## 7. 왜 신규 DB 테이블이 필요한가

### 7.1 기존 테이블만으로는 부족한 이유

기존 테이블은 아래 역할을 가진다.

- `workout_session`: 세션 요약
- `session_snapshot_metric`: 메트릭 수치 집계
- `session_event`: 이벤트 로그

여기에 LLM 결과를 직접 넣기 시작하면 다음 문제가 생긴다.

- 세션 원본 데이터와 사후 해석 데이터의 역할이 섞인다.
- 핵심 세션 테이블이 LLM 전용 JSON으로 비대해진다.
- 최근 제거한 `detail`/`payload` 의존이 다른 형태로 다시 커진다.

### 7.2 DB 변경이 사실상 필요한 경우

아래 요구를 동시에 만족하려면 신규 저장소가 사실상 필요하다.

- 히스토리 탭에서만 분석 표시
- 운동 종료 직후 미리 생성
- 분석 상태(`processing`, `completed`, `failed`) 관리
- LLM 실패 시 fallback 재사용
- 같은 세션을 다시 열어도 즉시 결과 조회

### 7.3 DB 변경 없이 가능한 방식

DB 변경 없이도 구현은 가능하지만, 그 경우는 히스토리 열 때마다 즉석 생성하는 방식뿐이다.

- 장점: 스키마 변경 없음
- 단점: 느림
- 단점: 호출 비용 반복
- 단점: 상태/재시도/버전 관리 어려움

따라서 현재 요구사항에는 적합하지 않다.

---

## 8. 권장 구조

시스템을 두 층으로 나눈다.

```text
기존 운동 기록층
- workout_session
- session_snapshot
- session_snapshot_score
- session_snapshot_metric
- session_event

        ↓ 읽어서 요약/해석

신규 분석층
- session_analysis
```

즉, 기존 DB는 **운동 사실 저장소**, 신규 테이블은 **운동 해석 저장소** 역할을 맡는다.

---

## 9. 신규 테이블: `session_analysis`

### 9.1 역할

`session_analysis`는 세션 하나에 대한 사후 분석 결과를 저장한다.

이 테이블에는 아래가 들어간다.

- LLM 입력용 구조화 요약(`feature_json`)
- 규칙 기반 fallback 결과(`fallback_output_json`)
- 실제 LLM 결과(`llm_output_json`)
- 분석 상태 및 버전 정보

### 9.2 권장 스키마

```sql
create table session_analysis (
    analysis_id uuid primary key default gen_random_uuid(),
    session_id bigint not null references workout_session(session_id) on delete cascade,
    user_id uuid not null references app_user(user_id) on delete cascade,
    status varchar(20) not null,
    feature_version varchar(50) not null,
    analysis_version varchar(50) not null,
    metric_guide_version varchar(50) not null,
    llm_model varchar(100),
    feature_json jsonb not null,
    fallback_output_json jsonb,
    llm_output_json jsonb,
    confidence_score numeric(4,3),
    error_message text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (session_id)
);

create index idx_session_analysis_user_id on session_analysis(user_id);
create index idx_session_analysis_status on session_analysis(status);
```

### 9.3 상태값

- `QUEUED`: 분석 대기
- `PROCESSING`: summarizer/LLM 처리 중
- `COMPLETED`: 최종 결과 저장 완료
- `FAILED`: 처리 실패

---

## 10. 컬럼별 의미

### `analysis_id`
- 분석 레코드 자체의 식별자

### `session_id`
- 어떤 운동 세션을 분석한 것인지 연결한다.
- 실제 코드베이스 기준으로 `BIGINT`를 사용해야 한다.

### `user_id`
- 사용자 소유권 검증과 조회 최적화를 위해 함께 저장한다.

### `status`
- 히스토리 상세에서 현재 분석 상태를 표시하기 위해 필요하다.

### `feature_version`
- feature summarizer 로직 버전

### `analysis_version`
- prompt / output schema / 분석 규칙 버전

### `metric_guide_version`
- 운동별 해석 기준 버전

### `llm_model`
- 어떤 모델로 결과를 생성했는지 기록한다.

### `feature_json`
- 저장된 세션 데이터에서 정리한 구조화 요약본이다.
- LLM 입력 원본을 보존하기 때문에 디버깅과 재현성 측면에서 가장 중요하다.

### `fallback_output_json`
- LLM 실패 시에도 화면에 보여줄 수 있는 deterministic 결과다.

### `llm_output_json`
- 실제 사용자에게 우선 노출할 최종 코칭 결과다.

### `confidence_score`
- 카메라 안정성, rep 수, 샘플 수 등을 반영한 분석 신뢰도다.

### `error_message`
- 실패 시 원인 추적용 메시지다.

---

## 11. JSON 안에 실제로 무엇이 들어가는가

### 11.1 `feature_json`

LLM이 읽기 쉬운 구조화 요약본을 담는다.

```json
{
  "session": {
    "session_id": 123,
    "exercise": "SQUAT",
    "selected_view": "FRONT",
    "duration_sec": 42,
    "rep_count": 8,
    "final_score": 64
  },
  "metrics": [
    {
      "key": "depth",
      "display_name": "스쿼트 깊이",
      "avg_score": 38,
      "avg_raw_value": 92,
      "sample_count": 20,
      "normalized_severity": 0.70,
      "confidence": 0.80
    }
  ],
  "events": {
    "counts": {
      "NO_PERSON": 3,
      "LOW_SCORE_HINT": 2
    }
  },
  "quality": {
    "overall_confidence": 0.62
  },
  "derived_issues": [
    "depth_insufficient",
    "camera_instability"
  ]
}
```

### 11.2 `fallback_output_json`

LLM 호출 없이도 즉시 렌더 가능한 최소 코칭 결과를 담는다.

```json
{
  "headline": "깊이는 부족했지만 반복은 안정적으로 수행했습니다.",
  "strengths": ["반복 리듬은 비교적 안정적이었습니다."],
  "issues": ["스쿼트 깊이가 부족했습니다."],
  "actions": ["내려갈 때 엉덩이를 더 뒤로 빼세요."],
  "confidence_note": "카메라 안정성이 낮아 일부 판정 신뢰도가 떨어질 수 있습니다."
}
```

### 11.3 `llm_output_json`

최종 사용자 노출용 리포트를 담는다.

```json
{
  "headline": "이번 스쿼트는 하강 깊이가 가장 큰 개선 포인트입니다.",
  "summary": "반복 자체는 이어졌지만 깊이가 부족해 점수가 제한됐습니다.",
  "strengths": ["상체 무너짐은 심하지 않았습니다."],
  "priority_issues": ["깊이 부족", "중간중간 카메라 이탈"],
  "action_coaching": [
    "내려갈 때 무릎보다 엉덩이를 먼저 접는 느낌으로 시작하세요.",
    "전신이 화면 안에 유지되도록 카메라를 조금 더 뒤로 두세요."
  ],
  "confidence_explanation": "검출 프레임 비율이 낮아 카메라 영향이 일부 포함됐습니다."
}
```

---

## 12. 생성 흐름

### 12.1 저장 시점

분석 생성의 시작점은 `controllers/workout.js:endWorkoutSession`이다.

### 12.2 순서

1. 기존 로직대로 `workout_session`, `session_snapshot_*`, `session_event` 저장을 완료한다.
2. 저장된 세션 데이터를 다시 읽어 `feature_json`을 만든다.
3. `fallback_output_json`을 생성한다.
4. `session_analysis`에 `QUEUED` 또는 `PROCESSING` 상태로 row를 만든다.
5. LLM 호출 성공 시 `llm_output_json`과 `COMPLETED` 상태로 갱신한다.
6. 실패 시 `fallback_output_json`만 유지하고 `FAILED` 상태로 마감한다.

### 12.3 핵심 원칙

- 운동 저장 성공과 분석 성공을 동일 트랜잭션으로 묶지 않는다.
- 세션 저장은 기존처럼 authoritative path로 유지한다.
- 분석은 저장된 결과를 읽는 후처리 레이어로 취급한다.

---

## 13. 히스토리 API 확장

현재 `GET /api/history/:sessionId`는 아래 정보를 반환한다.

- `session`
- `metrics`
- `timeline`
- `session_events`
- `routine_context`

여기에 `analysis` 블록을 추가한다.

예시:

```json
{
  "success": true,
  "session": {},
  "metrics": [],
  "timeline": [],
  "session_events": [],
  "routine_context": null,
  "analysis": {
    "status": "COMPLETED",
    "source": "LLM",
    "confidence_score": 0.62,
    "content": {
      "headline": "이번 스쿼트는 하강 깊이가 가장 큰 개선 포인트입니다."
    }
  }
}
```

표시 우선순위는 아래와 같다.

1. `llm_output_json`
2. `fallback_output_json`
3. 상태 메시지(`PROCESSING`, `FAILED`)

---

## 14. 왜 기존 테이블에 넣지 않는가

### `workout_session`에 넣지 않는 이유

- 세션 요약 테이블이 분석 JSON까지 떠안게 된다.
- 핵심 세션 row가 비대해진다.
- 세션 원본과 분석 결과의 역할 구분이 흐려진다.

### `session_snapshot_score.detail` 또는 `session_event.payload`에 넣지 않는 이유

- 최근 코드 정리 방향과 반대다.
- 히스토리 조회를 다시 JSON 내부 구조에 의존하게 만든다.
- 대용량 JSON 재도입 위험이 있다.

---

## 15. 대안 비교

### 대안 A. 신규 `session_analysis` 테이블 추가
- 장점: 역할 분리 명확, 상태 관리 용이, 재조회 간단
- 단점: DB 변경 필요
- 결론: **추천안**

### 대안 B. `workout_session`에 analysis 컬럼 추가
- 장점: 테이블 수 증가 없음
- 단점: 코어 세션 테이블과 분석 레이어가 섞임
- 결론: 비추천

### 대안 C. DB 변경 없이 히스토리 열 때마다 즉석 생성
- 장점: 스키마 변경 없음
- 단점: 느림, 비용 반복, 상태 관리 어려움
- 결론: 현재 요구와 불일치

---

## 16. V1 권장안

이번 단계에서는 아래만 수행한다.

1. `session_analysis` 테이블 추가
2. `endWorkoutSession` 후처리에서 분석 row 생성/갱신
3. `GET /api/history/:sessionId` 응답에 `analysis` 추가
4. `public/js/history-page.js`에서 analysis 렌더 추가

아래는 후순위로 둔다.

- `analysis_job_log` 테이블
- 재분석 API
- 결과 페이지(`/workout/result/:sessionId`) 노출
- 세션당 다중 분석 버전 저장

---

## 17. 결론

이 설계의 핵심은 기존 운동 기록 테이블은 그대로 두고, 그 옆에 **해석 결과 전용 저장소**를 하나 더 두는 것이다.

- 기존 DB: 운동 사실 저장
- 신규 `session_analysis`: 운동 해석 저장

이 구조를 사용하면 현재 코드베이스의 저장 경로를 크게 흔들지 않으면서도, 히스토리 상세에서 재사용 가능한 LLM 분석 레이어를 가장 단순하게 붙일 수 있다.
