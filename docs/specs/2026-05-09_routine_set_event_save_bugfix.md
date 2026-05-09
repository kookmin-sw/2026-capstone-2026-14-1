# 2026-05-09 루틴 세트 저장 실패(`session_event`) 버그 수정

## 1) 실제 증상

루틴 운동에서 현재 운동 목표를 채운 뒤 다음 운동 전 휴식으로 넘어가야 하는 시점에
아래와 같은 저장 실패가 발생할 수 있었다.

- 화면 알림: `루틴 저장 실패`
- 메시지: `세트 저장에 실패했습니다. 잠시 후 다시 시도됩니다.`
- 이후 증상:
  - 휴식/다음 운동 전환이 멈춘다.
  - 같은 세션에서 다시 진행해도 이후 갱신이 이어지지 않는다.

실제 콘솔 로그 예:

- `POST /api/workout/session/:sessionId/set` → `500`
- `루틴 세트 동기화 실패: Error: 세션 이벤트 저장에 실패했습니다.`

---

## 2) 직접 원인

직접 원인은 서버의 `session_event` 저장 경로였다.

`docs/sql/DB_init.sql` 기준 `session_event.payload`는 아래처럼 `NOT NULL`이다.

- `payload JSONB NOT NULL DEFAULT '{}'::JSONB`

그런데 서버 코드 일부는 이벤트를 insert할 때 `payload`를 명시하지 않았다.

문제 경로:

- `SET_RECORD`
- 일반 `recordSessionEvent`
- `SESSION_ABORT`
- `SESSION_ABORT_STALE`
- `normalizeEvents(...)`를 통해 정규화되는 일부 이벤트 row

이 중 특히 루틴 세트 저장 시점에는 `session_event` 벌크 insert가 함께 일어나므로,
payload가 빠진 row가 섞이면 전체 저장이 `500`으로 실패할 수 있었다.

즉, 이번 이슈의 핵심은:

1. 루틴 세트 완료 시 `/set` 저장 호출
2. 서버가 `session_event`를 저장
3. 일부 row에 `payload`가 없어 DB 제약과 충돌
4. `세션 이벤트 저장에 실패했습니다.` 반환
5. 클라이언트는 다음 step/session 정보를 받지 못해 루틴 진행이 멈춤

---

## 3) 2차 증상과 구조적 문제

이 버그는 단순히 이벤트 한 줄 저장 실패로 끝나지 않았다.

루틴 `/set` 저장은 한 번의 요청 안에서 아래 작업을 연속 수행한다.

- 현재 세션 snapshot/event 저장
- 현재 `workout_session` 종료 처리
- 현재 `workout_set` 완료 처리
- `routine_step_instance` 진행 상태 갱신
- 다음 세트 또는 다음 운동용 `workout_set` 생성
- 다음 `workout_session` 생성

이 과정은 DB 트랜잭션으로 감싸져 있지 않다.
따라서 중간 실패가 나면 일부 데이터는 이미 반영되고, 일부는 반영되지 않는
부분 성공 상태가 남을 수 있었다.

결과적으로 재시도 시 아래 문제가 이어질 수 있다.

- 현재 세션은 이미 `DONE`
- 하지만 다음 세션은 아직 생성되지 않음
- 같은 `/set` 재호출은 `이미 종료된 세션입니다.` 또는 진행 불일치로 이어짐

즉, 이번 버그는:

- 1차 원인: `session_event.payload` 누락
- 2차 확대 원인: 루틴 `/set` 저장의 부분 성공 복구 부재

로 정리할 수 있다.

---

## 4) 수정 내용

### A. `session_event` 저장을 `payload: {}` 기본값으로 통일

대상 파일:

- `controllers/workout.js`

수정 내용:

- `normalizeEvents(...)`가 payload 없는 이벤트도 항상 `payload: {}`를 넣도록 변경
- `SET_RECORD` insert에 `payload: {}`
- `SESSION_ABORT` insert에 `payload: {}`
- `SESSION_ABORT_STALE` insert에 `payload: {}`
- 일반 `recordSessionEvent` insert에도 `payload: {}`

효과:

- `session_event.payload NOT NULL` 제약과 충돌하지 않는다.
- payload가 비어 있는 이벤트도 안정적으로 저장된다.

### B. 세트 저장 재시도 가능성 보강

대상 파일:

- `controllers/workout.js`

수정 내용:

- `persistSessionCompletionPayload(...)` 시작 시 기존 `session_snapshot` 정리 추가
- 세트 저장 중 부분 실패 후 같은 세션으로 재시도할 때,
  중복 snapshot 충돌을 줄이도록 보강

효과:

- `/set` 재호출 시 snapshot 계층 충돌로 인한 2차 실패 가능성을 낮춘다.

### C. 종료된 루틴 세션 재호출 복구 로직 추가

대상 파일:

- `controllers/workout.js`

추가 유틸:

- `ensureWorkoutSetForStep(...)`
- `ensureRoutineRunningSession(...)`
- `ensureRoutineContinuation(...)`

수정 내용:

- 이미 `DONE`된 루틴 세션으로 `/set`이 다시 들어와도
  현재 `set_id` 기준 루틴 실행 컨텍스트를 읽어 다음 상태를 복구
- 다음 세트/다음 운동용 `workout_set`이 이미 있으면 재사용
- 다음 `workout_session`이 이미 있으면 재사용
- 없으면 필요한 것만 생성해서 `NEXT_SET` 또는 `NEXT_STEP` 응답 복구

효과:

- 부분 성공 이후 재요청이 와도 루틴이 완전히 막히지 않고 이어질 수 있다.

### D. 프론트 알림에 실제 서버 에러 문구 노출

대상 파일:

- `public/js/workout/session-controller.js`

수정 내용:

- 루틴 세트 저장 실패 시 고정 문구만 띄우지 않고
  `error.message`를 그대로 표시

효과:

- 다음번 장애 발생 시 원인 파악 속도가 빨라진다.
- 이번처럼 `세션 이벤트 저장에 실패했습니다.`를 즉시 확인할 수 있다.

---

## 5) 왜 이 수정이 필요한가

루틴 저장 흐름은 단순 카운터 갱신이 아니라
`workout_session -> workout_set -> routine_step_instance -> routine_instance`
계층 전체를 함께 전진시키는 요청이다.

따라서 다음 조건이 필요하다.

- 이벤트 row는 항상 DB 제약과 호환되는 형태여야 한다.
- 재시도 시 같은 세션 저장이 idempotent에 가깝게 동작해야 한다.
- 부분 성공이 남아도 다음 세트/다음 운동으로 복구할 수 있어야 한다.

이번 수정은 이 세 조건을 동시에 보강한다.

---

## 6) 검증 메모

확인한 로그:

- `POST .../set` 500
- 클라이언트 콘솔: `세션 이벤트 저장에 실패했습니다.`

적용 후 확인:

- `node --check controllers/workout.js`
- `node --check public/js/workout/session-controller.js`

제약:

- 현재 환경에서는 실제 브라우저 + DB 연동 루틴 전환을 여기서 직접 끝까지 재현하지 못했다.
- 따라서 최종 확인은 실제 루틴 시나리오 재실행이 필요하다.

추천 확인 시나리오:

1. 루틴 1단계 목표 달성
2. 휴식 진입
3. 다음 운동 전환
4. 같은 문제 상황에서 더 이상 `세션 이벤트 저장에 실패했습니다.`가 뜨지 않는지 확인

---

## 7) 변경 파일

- `controllers/workout.js`
- `public/js/workout/session-controller.js`
- `docs/specs/2026-05-09_routine_set_event_save_bugfix.md`
