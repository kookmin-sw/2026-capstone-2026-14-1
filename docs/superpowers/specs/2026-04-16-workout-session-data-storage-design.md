# 현재 운동 세션 데이터 저장/관리 운영 스펙

## 1. 문서 정보

- 작성일: 2026-04-16
- 대상 프로젝트: FitPlus
- 문서 목적: 현재 코드 기준으로 운동 세션 데이터가 어디서 생성되고, 어떤 데이터가 어디에 쌓이며, 언제 어떤 방식으로 저장되고, 이후 어떻게 조회/재구성되는지 정리한다.
- 문서 범위: 운동 세션 시작, 진행 중 버퍼링, 종료 저장, 중단 처리, 루틴 연결 계층, 히스토리/결과 조회 경로, 문서-코드 불일치 주의점

## 2. 문서 성격과 소스 오브 트루스

이 문서는 이상적인 목표 구조가 아니라 **현재 실제 동작을 설명하는 운영 스펙**이다.

현재 이 영역의 authoritative source는 아래 코드다.

- `routes/workout.js`
- `controllers/workout.js`
- `controllers/history.js`
- `public/js/workout/session-controller.js`
- `public/js/workout/session-buffer.js`

기존 문서는 참고 자료로 사용하되, 현재 코드와 불일치할 수 있다.

특히 아래 문서를 보조 참고 자료로 사용한다.

- `docs/database_structure.md`
- `docs/2026-04-09_workout_json_폐기_사유_및_코드_수정사항.md`
- `docs/2026-04-15_history_llm_session_analysis_spec.md`
- `docs/superpowers/specs/2026-04-16-history-metric-timeseries-design.md`

## 3. 핵심 요약

현재 운동 세션 데이터는 크게 두 층으로 관리된다.

1. **서버 기준 세션 마스터 레코드**
   - `workout_session`
   - 세션의 존재, 모드, 상태, 대표 결과, 최종 점수를 담당한다.

2. **브라우저 기준 진행 중 상세 버퍼**
   - `SessionBuffer`
   - 실시간 점수 타임라인, rep 기록, 세트 기록, 메트릭 누적, 이벤트 로그를 브라우저에서 모은다.

핵심 특징은 다음과 같다.

- 세션은 시작 시 `workout_session` 한 건으로 생성된다.
- 진행 중 상세 데이터는 주로 브라우저 `SessionBuffer`에 누적된다.
- 세션 종료 시 브라우저가 버퍼를 `PUT /api/workout/session/:sessionId/end`로 전송한다.
- 서버는 이 종료 payload를 기준으로 `session_snapshot`, `session_snapshot_score`, `session_snapshot_metric`, `session_event`를 **재생성**한다.
- 페이지 이탈이나 비정상 종료는 `/abort` 경로로 별도 처리한다.
- 루틴 모드에서는 `routine_instance -> routine_step_instance -> workout_set -> workout_session` 계층이 추가된다.

## 4. 데이터 구성 요소

### 4.1 `workout_session`

세션의 대표 row다. 현재 코드 기준으로 아래 역할을 가진다.

- 세션 ID 부여
- 사용자/운동/모드/선택 뷰 연결
- 상태 관리: `RUNNING`, `DONE`, `ABORTED`
- 대표 결과 저장
  - `result_basis`
  - `total_result_value`
  - `total_result_unit`
  - `final_score`
  - `summary_feedback`
- 루틴 모드일 경우 현재 연결된 `set_id` 유지

즉, `workout_session`은 세션의 마스터 레코드이며, 세션 상세 이력 전체를 직접 담는 테이블은 아니다.

### 4.2 `session_snapshot`

세션의 중간/최종 시점 헤더다.

- `INTERIM`: 진행 중 다운샘플된 점수 시점
- `FINAL`: 종료 시점 최종 스냅샷

### 4.3 `session_snapshot_score`

각 스냅샷 시점의 대표 점수를 저장한다.

- `score`
- `result_basis`
- `result_value`
- `result_unit`
- `summary_feedback`

### 4.4 `session_snapshot_metric`

각 스냅샷 시점의 metric 집계를 저장한다.

- `metric_key`
- `metric_name`
- `avg_score`
- `avg_raw_value`
- `min_raw_value`
- `max_raw_value`
- `sample_count`

현재 구조는 대용량 JSON 저장보다 정규화된 집계 컬럼 저장을 우선한다.

### 4.5 `session_event`

세션 도중 발생한 이벤트를 저장한다.

예:

- `SESSION_START`
- `REP_COMPLETE`
- `LOW_SCORE_HINT`
- `NO_PERSON`
- `PAUSE`
- `RESUME`
- `REST_START`
- `REST_END`
- `NEXT_EXERCISE`
- `ROUTINE_STEP_CHANGE`
- `SET_RECORD`
- `SESSION_ABORT`
- `SESSION_ABORT_STALE`

현재 저장 경로에서는 이벤트 `payload`를 적극 활용하지 않고, 타입과 시각 중심으로 저장하는 방향이다.

### 4.6 루틴 실행 계층

루틴 모드일 때는 아래 계층이 함께 움직인다.

```text
routine_instance
  -> routine_step_instance
    -> workout_set
      -> workout_session
```

이 계층은 루틴 진행 상황과 세트 단위 실행 상태를 표현한다.

## 5. 세션 생명주기별 데이터 흐름

### 5.1 세션 시작 전

운동 세션 페이지가 열렸다고 해서 즉시 DB row가 생성되지는 않는다.

- 자율 운동: `/workout/free/:exerciseCode`
- 루틴 운동: `/workout/routine/:routineId`

실제 세션 생성은 사용자가 시작 버튼을 눌러 `POST /api/workout/session`를 호출할 때 일어난다.

### 5.2 세션 시작 시

브라우저는 운동 시작 시 `POST /api/workout/session`를 호출한다.

서버는 다음을 수행한다.

1. 기존 오래된 `RUNNING` 세션이 있으면 `cleanupStaleOpenSessions()`로 정리한다.
2. 모드에 따라 운동/루틴 컨텍스트를 결정한다.
3. `workout_session` row를 `RUNNING` 상태로 생성한다.

저장되는 핵심 값은 아래와 같다.

- `user_id`
- `exercise_id`
- `set_id`(루틴 모드만)
- `mode`
- `status = RUNNING`
- `selected_view`

루틴 모드에서는 세션 생성 전에 아래 데이터가 먼저 만들어질 수 있다.

- `routine_instance`
- 각 단계의 `routine_step_instance`
- 첫 번째 `workout_set`

그리고 생성된 첫 `workout_set.set_id`가 `workout_session.set_id`에 연결된다.

### 5.3 세션 시작 직후 브라우저 초기화

세션 생성이 성공하면 브라우저는 `SessionBuffer`를 초기화한다.

초기화 옵션은 아래 정보를 포함한다.

- `sessionId`
- `exerciseCode`
- `mode`
- `selectedView`
- `resultBasis` 힌트
- `targetSec`(시간 기반 운동일 때)

그 직후 `SESSION_START` 이벤트가 버퍼에 추가된다.

이 시점부터 진행 중 상세 데이터의 1차 저장소는 서버가 아니라 브라우저 메모리의 `SessionBuffer`다.

### 5.4 운동 진행 중

운동 중에는 실시간 포즈 판정과 점수 계산이 브라우저에서 일어난다.

진행 중 데이터는 주로 `SessionBuffer`에 누적된다.

#### a. 점수 타임라인

- `addScore()`가 약 1초 간격으로 점수를 다운샘플링한다.
- 각 포인트는 아래 값을 가진다.
  - `score`
  - `timestamp`(세션 시작 기준 상대 ms)
  - `breakdown`(metric별 점수/원시값 요약)

#### b. 메트릭 누적

`addScore()`는 각 breakdown 항목을 metric accumulator에 누적한다.

- 점수 배열
- raw value 배열
- feedback 횟수

반복 운동은 frame 기반 metric 누적 외에, rep 완료 시 rep 기준 metric 누적도 따로 가진다.

#### c. rep 기록

`addRep()`는 rep 완료 시 rep record를 쌓는다.

- rep 자체 정보
- 현재 세트 번호
- 상대 시간

#### d. 세트 기록

`completeSet()`는 세트 종료 시 아래 정보를 `setRecords`에 추가한다.

- `set_no`
- `phase`
- `actual_reps`
- `duration_sec`
- `rest_sec`

동시에 `SET_RECORD` 이벤트를 버퍼 이벤트 목록에도 추가한다.

#### e. 이벤트 로그

아래 종류의 이벤트가 버퍼에 누적된다.

- 자세 미검출
- 교정 힌트
- rep 완료
- 휴식 시작/종료
- 일시정지/재개
- 루틴 단계 전환
- 다음 운동 이동
- 세트 완료

이 이벤트들은 진행 중 즉시 서버로 저장되지 않고, 대체로 종료 시 일괄 반영된다.

### 5.5 로컬 백업

`SessionBuffer`는 주기적으로 `localStorage`에 버퍼를 저장한다.

- score timeline 길이가 30개 단위가 될 때 자동 저장
- `beforeunload`에서도 저장 시도

저장되는 백업 데이터는 아래를 포함한다.

- `scoreTimeline`
- `repRecords`
- `repMetricAccumulators`
- `setRecords`
- `events`
- 기본 세션 메타데이터

`loadFromStorage()` 복구 메서드도 구현돼 있지만, 현재 메인 세션 흐름에서 자동 복구까지 연결되어 있지는 않다. 즉, **백업은 있으나 resume UX는 완성되지 않은 상태**다.

### 5.6 세션 종료 시

사용자가 종료 버튼을 누르면 브라우저는 `SessionBuffer.export()`를 호출해 종료 payload를 만든다.

export 결과에는 아래 정보가 포함된다.

- 세션 대표 필드
  - `selected_view`
  - `target_sec`
  - `best_hold_sec`
  - `posture_score`
  - `time_score`
  - `result_basis`
  - `total_result_value`
  - `total_result_unit`
  - `duration_sec`
  - `total_reps`
  - `final_score`
  - `summary_feedback`
- 상세 저장용 필드
  - `metric_results`
  - `interim_snapshots`
  - `events`

이 payload가 `PUT /api/workout/session/:sessionId/end`로 전송된다.

### 5.7 서버 종료 저장 시

서버는 종료 요청을 받으면 아래 순서로 저장을 수행한다.

1. 세션 소유권과 종료 여부 확인
2. 대표 결과 필드 정규화
3. `interim_snapshots`, `metric_results`, `events` 정규화
4. 기존 `session_snapshot` 전체 삭제
5. 기존 `session_event` 전체 삭제
6. 새 `session_event` 일괄 insert
7. `INTERIM` + `FINAL` `session_snapshot` 헤더 생성
8. 각 스냅샷의 `session_snapshot_score` 생성
9. 각 스냅샷의 `session_snapshot_metric` 생성
10. 마지막에 `workout_session`을 `DONE`으로 update

중요한 점은 현재 종료 저장이 **append 방식이 아니라 replace-all 방식**이라는 점이다.

즉, 종료 시점의 payload를 authoritative input으로 간주하고, 관련 snapshot/event 데이터를 다시 만든다.

### 5.8 세션 중단 시

비정상 이탈 또는 브라우저 unload 상황에서는 `POST /api/workout/session/:sessionId/abort` 경로가 사용된다.

브라우저는 `beforeunload` 시 아래를 수행한다.

1. 가능하면 `sessionBuffer.saveToStorage()` 호출
2. `navigator.sendBeacon()` 또는 `fetch(..., keepalive: true)`로 abort 전송

abort payload는 최소 대표 값만 포함한다.

- `selected_view`
- `duration_sec`
- `total_reps`
- `total_result_value`
- `result_basis`
- `target_sec`

서버는 abort 시 아래를 수행한다.

- `workout_session.status = ABORTED`
- `ended_at` 저장
- 대표 결과 필드 일부 저장
- `session_event`에 `SESSION_ABORT` 1건 insert
- 루틴이면 루틴 실행 계층 동기화 시도

abort 경로는 종료 경로와 다르게 스냅샷/메트릭 전체를 재구성하지 않는다.

### 5.9 오래 열린 세션 정리

새 세션 시작 전에 `cleanupStaleOpenSessions()`가 오래된 `RUNNING` 세션을 자동 정리한다.

이때 서버는:

- 오래된 `workout_session`을 `ABORTED`로 갱신
- `session_event`에 `SESSION_ABORT_STALE` insert
- 루틴 세션이면 루틴 실행 계층도 abort 방향으로 동기화

즉, 세션 정리는 사용자의 명시적 종료뿐 아니라 **다음 세션 시작 시의 stale cleanup**도 포함한다.

## 6. 서버 저장 규칙

### 6.1 세션 대표값은 `workout_session`

세션의 대표 결과는 `workout_session`에 저장된다.

- `selected_view`
- `result_basis`
- `total_result_value`
- `total_result_unit`
- `final_score`
- `summary_feedback`
- `started_at`
- `ended_at`
- `status`

이 값은 결과 페이지 목록/히스토리 목록의 1차 요약 정보가 된다.

### 6.2 상세 시계열은 snapshot 계층

세션 도중 점수 변화나 metric 변화는 `workout_session` 한 row에 직접 넣지 않고 snapshot 계층으로 분리 저장한다.

이 구조 덕분에 다음이 가능하다.

- 중간 점수 타임라인 재구성
- metric 시계열 재구성
- FINAL 기준 결과와 INTERIM 진행 경과 분리

### 6.3 이벤트는 별도 테이블

운동 중 발생 사실은 `session_event`로 분리 저장한다.

현재 방향은 이벤트 타입과 시각 중심 저장이다. 과거처럼 대용량 `payload/detail`에 의존하지 않는 것이 원칙이다.

### 6.4 JSON 저장 축소 원칙

현재 세션 저장 경로는 대용량 JSON 저장을 줄이는 방향으로 정리돼 있다.

- `session_snapshot_score.detail` 직접 저장 지양
- `session_snapshot_metric.detail` 직접 저장 지양
- `session_event.payload` 직접 저장 지양
- 히스토리 조회도 정규화 컬럼 중심으로 재구성

따라서 현재 구조의 핵심은 **원본 전체 재현보다 운영 안정성과 조회 단순성**이다.

## 7. 루틴 모드의 추가 데이터 관리

루틴 모드에서는 운동 세션이 독립 객체가 아니라 세트 실행 계층에 매달린다.

### 7.1 시작 시

- `routine_instance` 생성
- 각 단계 `routine_step_instance` 생성
- 첫 번째 `workout_set` 생성
- 생성된 `set_id`를 `workout_session.set_id`에 연결

### 7.2 진행 중

백엔드에는 아래 API가 존재한다.

- `POST /api/workout/session/:sessionId/set`
- `POST /api/workout/session/:sessionId/event`

`recordWorkoutSet()`는 루틴 세트 완료를 서버 DB에 즉시 반영할 수 있게 설계되어 있다.

- 현재 `workout_set` 완료 처리
- `routine_step_instance.completed_sets/status` 갱신
- 필요 시 다음 `workout_set` 생성
- 다음 단계가 있으면 다음 `routine_step_instance`와 첫 세트 생성
- `workout_session.set_id` 이동

하지만 현재 브라우저 메인 세션 흐름은 세트 API를 중심으로 돌아가지 않는다. 실제 세션 UI는 종료 시점 `/end` 일괄 저장이 중심이며, 이 점은 운영 시 반드시 구분해서 이해해야 한다.

### 7.3 종료/중단 시

종료(`DONE`) 또는 중단(`ABORTED`) 시 `syncRoutineExecutionFromSession()`이 루틴 실행 계층 상태를 보정한다.

즉, 루틴 모드에서는 한 세션 저장이 `workout_session`만 끝나는 것이 아니라, 필요 시 루틴 실행 상태 정합성 보정까지 포함한다.

## 8. 조회와 재구성 방식

### 8.1 결과 페이지

결과 페이지는 `workout_session`의 대표값과 FINAL 스냅샷 계층을 조합해 결과를 보여준다.

즉, 사용자가 보는 최종 결과는 단일 테이블만 읽어 오는 것이 아니라 아래 조합이다.

- `workout_session`
- `session_snapshot`의 FINAL row
- `session_snapshot_score`의 FINAL row
- `session_snapshot_metric`의 FINAL rows

### 8.2 히스토리 목록

히스토리 목록은 `workout_session`을 중심으로 읽고, 필요 시 FINAL 스냅샷 점수와 병합해 대표 결과를 정규화한다.

목록용 통계도 대부분 `workout_session` 기준으로 만든다.

### 8.3 히스토리 상세

히스토리 상세 API는 아래 정보를 재구성한다.

- 기본 세션 요약: `workout_session`
- FINAL 스냅샷 헤더: `session_snapshot`
- FINAL 대표 점수: `session_snapshot_score`
- INTERIM + FINAL metric rows: `session_snapshot_metric`
- INTERIM score rows: `session_snapshot_score`
- 이벤트 목록: `session_event`
- 루틴 컨텍스트: `workout_set`, `routine_step_instance`, `routine_instance`, `routine`

이 데이터를 바탕으로 아래 파생 구조를 응답한다.

- `session`
- `metrics`
- `metric_series`
- `timeline`
- `session_events`
- `routine_context`

즉, 히스토리 상세는 저장된 원본 row들을 그대로 노출하는 것이 아니라, **조회 시점에 재구성된 읽기 모델**을 반환한다.

## 9. 현재 저장되는 데이터 목록

현재 코드 기준으로 세션 단위에서 저장되거나 관리되는 대표 데이터는 아래와 같다.

### 9.1 서버 DB에 최종 저장되는 것

- 세션 마스터 정보
  - 사용자
  - 운동
  - 모드
  - 상태
  - 선택 뷰
  - 대표 결과값
  - 최종 점수
  - 요약 피드백
  - 시작/종료 시각
- 스냅샷 정보
  - 중간/최종 시점 헤더
  - 시점별 대표 점수
  - 시점별 metric 집계
- 이벤트 정보
  - 운동 중 이벤트 타입
  - 이벤트 시각
- 루틴 모드 추가 정보
  - 현재 세트 연결
  - 세트 완료 상태
  - 단계 완료 상태
  - 루틴 완료 상태

### 9.2 브라우저에서만 일시적으로 관리되는 것

- 실시간 점수 타임라인 원본
- rep 단위 기록
- 세트 단위 기록
- metric 누적 버퍼
- 로컬 백업 데이터
- 종료 전 임시 payload

이 중 일부만 종료 시 정규화되어 DB로 전환되며, 브라우저 메모리 구조 전체가 그대로 저장되지는 않는다.

## 10. 문서-코드 불일치와 운영 주의점

### 10.1 `set`/`event` API 존재와 실제 메인 흐름은 다르다

라우트와 컨트롤러에는 세트/이벤트 기록 API가 존재한다.

- `/api/workout/session/:sessionId/set`
- `/api/workout/session/:sessionId/event`

하지만 현재 브라우저 세션 흐름의 핵심 저장 경로는 `/end` 일괄 저장이다.

따라서 아래 식의 단순 이해는 현재 코드 기준으로 부정확하다.

- “세트가 끝날 때마다 모든 상세 데이터가 서버에 바로 저장된다.”

실제 메인 흐름은 “진행 중 상세는 브라우저에 모았다가 종료 시 저장”에 더 가깝다.

### 10.2 로컬 백업은 있지만 자동 resume은 없다

`SessionBuffer.loadFromStorage()`는 구현돼 있다. 하지만 현재 기본 세션 플로우에서 이 복구 경로가 자동 호출되지는 않는다.

즉, 저장은 해도 사용자가 곧바로 이어서 복구하는 기능이 완성된 것은 아니다.

### 10.3 종료 저장은 replace-all 성격이다

`endWorkoutSession()`은 종료 시 기존 snapshot/event를 지우고 다시 생성한다.

이 구조는 단순하고 일관적이지만, 다음 해석이 필요하다.

- 종료 payload가 authoritative input이다.
- 중간 저장 누적 append 로그처럼 다루면 안 된다.

### 10.4 원본 재현성보다 운영 안정성을 택한 구조다

현재 구조는 대용량 JSON과 프레임 원본을 그대로 저장하지 않는다.

장점:

- request payload 폭주 방지
- 히스토리 조회 단순화
- DB 저장량 감소

대가:

- 프레임 단위 완전 재현은 어렵다.
- 브라우저 내부 버퍼 구조 일부는 종료 후 사라진다.

### 10.5 일부 기존 문서는 stale 가능성이 있다

특히 루틴 세트 즉시 저장 흐름을 강조하는 문서는 현재 메인 UI 저장 흐름과 완전히 같다고 가정하면 안 된다.

운영 판단과 향후 수정은 반드시 현재 코드와 함께 검토해야 한다.

## 11. 운영 관점 결론

현재 운동 세션 데이터 관리는 아래 한 문장으로 요약할 수 있다.

> 세션의 존재와 최종 결과는 서버 `workout_session`이 관리하고, 진행 중 상세 데이터는 브라우저 `SessionBuffer`가 모았다가 종료 시 snapshot/event 계층으로 정규화 저장한다.

이 구조를 기준으로 앞으로의 작업은 아래 질문으로 나눠 다루는 것이 좋다.

- 세션 진행 중 장애 복구를 강화할 것인가?
- 루틴 세트 진행을 서버 즉시 반영 경로로 더 강하게 통일할 것인가?
- 히스토리 분석을 위해 어느 수준까지 세부 데이터를 더 저장할 것인가?

현재 시점의 운영 스펙으로는, 위 문서 내용이 운동 세션 데이터 저장/관리의 가장 정확한 설명이다.
