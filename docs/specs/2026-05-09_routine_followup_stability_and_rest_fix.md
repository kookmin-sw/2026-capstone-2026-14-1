# 2026-05-09 루틴 후속 안정화 및 휴식시간 표시 수정

## 1) 문서 목적

이 문서는 아래 두 문서 작성 이후 이어서 반영된 루틴 관련 후속 수정사항을 한 번에 정리한다.

- `docs/specs/2026-05-09_routine_progress_ui_bugfix.md`
- `docs/specs/2026-05-09_routine_set_event_save_bugfix.md`

주요 범위는 다음과 같다.

- 루틴 수정/삭제 시 잔류 `RUNNING` 실행 정리
- 루틴 세트 저장 경합 시 서버 응답 안정화
- 휴식시간 UI 표시 방식 수정
- step 전환 시 잘못 적용되던 휴식시간 계산 수정

---

## 2) 루틴 수정/삭제 시 `RUNNING` 실행 잔류 문제

### 실제 증상

저장 버그나 중간 실패 이후 루틴 편집 화면에서 아래 오류가 계속 발생할 수 있었다.

- `This routine has a running session, so it cannot be revised right now.`

문제는 실제로 사용자가 더 이상 운동 중이 아니어도,
DB에 `routine_instance.status = 'RUNNING'` 또는 연결된 `workout_session.status = 'RUNNING'`
데이터가 남아 있으면 수정/삭제가 막힌다는 점이었다.

### 원인

기존 루틴 수정/삭제 API는 `RUNNING routine_instance` 존재 여부만 보고 차단했다.

하지만 이전 루틴 저장 실패 흐름에서는 아래처럼 잔류 상태가 생길 수 있었다.

- `workout_set`은 이미 `DONE`
- 일부 `workout_session` 또는 `routine_instance`는 아직 `RUNNING`
- 실제 사용자는 운동을 더 진행하지 않음

즉, 편집 차단 조건이 “실제 진행 중인지”보다 “러닝 상태 row가 남아 있는지”에 더 가까웠다.

### 수정 내용

대상 파일:

- `controllers/routine.js`

추가 내용:

- `abortRunningRoutineExecutions(...)` 유틸 추가
- 루틴 수정 시 `ROUTINE_UPDATE` 사유로 연결된 `RUNNING` 실행 정리
- 루틴 삭제 시 `ROUTINE_DELETE` 사유로 연결된 `RUNNING` 실행 정리
- 중단된 세션에는 `SESSION_ABORT` 이벤트를 함께 기록

정리 대상:

- `workout_session`
- `workout_set`
- `routine_step_instance`
- `routine_instance`

효과:

- 잔류 `RUNNING` 상태 때문에 루틴 수정/삭제가 계속 막히는 문제를 줄인다.
- 단순 차단보다 “정리 후 진행”에 가까운 동작으로 바뀐다.

---

## 3) 루틴 세트 저장 경합 시 `ALREADY_PROCESSED` 응답 오류

### 실제 위험

루틴 `/set` 저장은 rep 완료 직후와 타이머 tick 등에서 거의 같은 시점에 재호출될 수 있다.
이때 첫 요청이 세트를 이미 `DONE`으로 바꾼 뒤, 뒤늦게 들어온 요청은
`ALREADY_PROCESSED` 경로로 빠져야 한다.

그런데 해당 분기에서 응답 payload에 존재하지 않는 `event` 변수를 사용하고 있어,
경합 상황에서 서버가 500을 낼 수 있는 코드가 남아 있었다.

### 수정 내용

대상 파일:

- `controllers/workout.js`

수정 내용:

- `completedSet`이 비어 `ALREADY_PROCESSED` 응답으로 빠질 때
  잘못된 `event` 대신 `setRecordEvent`를 반환하도록 수정

효과:

- 같은 세트 완료 요청이 겹쳐도 경합 분기에서 불필요한 500이 나는 위험을 줄인다.

---

## 4) 휴식 중 메인 타이머가 휴식시간처럼 보이던 UI 문제

### 실제 증상

루틴 휴식시간에 메인 타이머 라벨이 `휴식 시간`으로 바뀌지만,
실제 값은 계속 누적 운동시간을 표시하고 있었다.

즉 사용자 입장에서는:

- 라벨은 휴식시간
- 숫자는 운동 누적시간

으로 보여 혼동이 생길 수 있었다.

### 원인

`startRest()`에서 메인 타이머 라벨만 `휴식 시간`으로 변경하고,
표시 값은 계속 `state.totalTime`을 사용하고 있었다.

### 수정 내용

대상 파일:

- `public/js/workout/session-controller.js`
- `views/workout/session.ejs`
- `public/workout.css`

수정 내용:

- 메인 타이머는 계속 `운동 시간`, `플랭크 시간`, `학습 시간` 중 맞는 기본 라벨 유지
- 휴식 카운트다운은 별도 카드로 분리
- 휴식 카드는 실시간 점수 카드 바로 아래에 크게 배치

효과:

- 운동시간과 휴식시간의 의미가 UI에서 섞이지 않는다.
- 루틴 휴식 중 남은 시간이 더 눈에 잘 들어온다.

---

## 5) step 전환 시 다음 운동의 휴식시간을 잘못 쓰던 문제

### 실제 증상

예를 들어 아래처럼 루틴을 구성했을 때:

1. 스쿼트 `3회 x 1세트`, `휴식 30초`
2. 스쿼트 `5회 x 1세트`, `휴식 60초`

1번 운동 완료 후에는 `30초`를 쉬어야 하지만 실제로는 `60초`가 적용될 수 있었다.

### 원인

step 전환 응답(`NEXT_STEP`)을 만들 때,
현재 step을 마치고 쉬는 시간으로 **다음 step의 `rest_sec`**를 내려주고 있었다.

즉 다음 두 개념이 섞여 있었다.

- 지금 step 종료 후 전환 휴식
- 다음 step 세트 메타에 저장할 `rest_sec_after`

### 수정 내용

대상 파일:

- `controllers/workout.js`

수정 내용:

- `transitionRestSec`: 현재 step의 `rest_sec`
- `nextStepRestSec`: 다음 step의 `rest_sec`

를 분리해서 사용하도록 변경

적용 방식:

- 화면에 보여줄 전환 휴식시간은 `transitionRestSec`
- 다음 step 첫 세트의 `rest_sec_after` 메타는 `nextStepRestSec`

효과:

- step 1 종료 후에는 step 1의 휴식시간이 적용된다.
- step 2 자체의 세트 메타는 별도로 유지된다.

---

## 6) 운영 중 확인된 데이터 정리 메모

실제 DB 확인 결과,
과거 저장 실패 중 일부는 아래처럼 남아 있었다.

- `workout_set`은 `DONE`
- 연결 `workout_session`은 `RUNNING`
- 이에 따라 `routine_step_instance`, `routine_instance`도 `RUNNING`

이 문서의 수정 중 루틴 수정/삭제 시 자동 `ABORTED` 정리 로직은
이런 실데이터 잔류 문제를 운영 중 덜 수동으로 처리하기 위한 목적도 포함한다.

---

## 7) 검증 메모

적용 후 확인:

- `node --check controllers/routine.js`
- `node --check controllers/workout.js`
- `node --check public/js/workout/session-controller.js`

추가 확인 권장 시나리오:

1. 루틴 수정/삭제 시 기존 `RUNNING` 실행이 있어도 자동 정리 후 동작하는지 확인
2. 루틴 step 1 완료 후 휴식카드가 점수 아래에 표시되는지 확인
3. 휴식 중 메인 타이머가 계속 운동시간으로 유지되는지 확인
4. step 1 완료 후 현재 step의 `rest_sec`가 적용되는지 확인
5. 목표 달성 직후 `/set` 경합 상황에서 같은 세트 저장 실패가 재발하지 않는지 확인

---

## 8) 변경 파일

- `controllers/routine.js`
- `controllers/workout.js`
- `public/js/workout/session-controller.js`
- `views/workout/session.ejs`
- `public/workout.css`
- `docs/specs/2026-05-09_routine_followup_stability_and_rest_fix.md`
