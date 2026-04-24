# 세션 유실 방지 강화 계획

이 문서는 운동 중 새로고침, 탭 닫힘, 모바일 백그라운드 전환, 네트워크 저장 실패가 발생했을 때 세션 데이터를 최대한 보존하기 위한 구현 계획이다.

목표는 기존 세션 저장 구조를 크게 바꾸지 않고, 현재 구현된 `SessionBuffer`, `beforeunload`, `sendBeacon`, stale session cleanup을 바탕으로 복구 UX와 재시도 흐름을 추가하는 것이다.

## 현재 구현 상태

### 이미 있는 기능

- `public/js/workout/session-buffer.js`
  - `SessionBuffer`가 운동 중 점수, rep, set, metric accumulator, event를 브라우저 메모리에 모은다.
  - `saveToStorage()`가 `localStorage`에 `fitplus_session_${sessionId}` 키로 백업한다.
  - `loadFromStorage()`가 같은 키에서 백업을 읽어 현재 `SessionBuffer` 인스턴스에 복원할 수 있다.
  - `clearStorage()`가 해당 세션 백업을 삭제한다.
- `public/js/workout/session-controller.js`
  - `resetSessionBufferForSession()`에서 세션 시작 후 `SessionBuffer`를 생성한다.
  - 운동 종료 시 `finishWorkout()`가 `SessionBuffer.export()` 결과를 `PUT /api/workout/session/:sessionId/end`로 전송한다.
  - 종료 저장 실패 시 `pendingSessionPayload`를 유지하고 버튼을 `저장 재시도`로 바꾼다.
  - `beforeunload`에서 `sessionBuffer.saveToStorage()`를 호출한다.
  - `beforeunload`에서 `sendAbortBeacon("UNLOAD")`를 호출한다.
  - `sendAbortBeacon()`은 `navigator.sendBeacon()`을 우선 사용하고, 없으면 `fetch(..., keepalive: true)`를 사용한다.
  - `visibilitychange`에서 visible 복귀 시 Wake Lock을 다시 요청한다.
- `controllers/workout.js`
  - 새 세션 시작 전 `cleanupStaleOpenSessions()`가 오래된 `RUNNING` 세션을 `ABORTED`로 정리한다.
  - stale session 정리 시 `SESSION_ABORT_STALE` 이벤트를 저장한다.

### 부족한 기능

- `localStorage` 백업이 있어도 사용자가 복구할 수 있는 UI가 없다.
- 저장 실패 payload가 새 페이지 방문 후에도 재시도되도록 보존되지 않는다.
- `sendBeacon`으로 서버가 세션을 `ABORTED` 처리한 뒤, localStorage 백업을 다시 `/end`로 저장하는 경로가 명확하지 않다.
- 결과/히스토리에서 "복구된 데이터" 또는 "일부 데이터만 저장됨"을 구분하지 않는다.
- 모바일 백그라운드 전환, offline/online 전환, 브라우저 강제 종료 같은 데모 리스크에 대한 검증 체크리스트가 없다.

## 중요한 설계 주의점

현재 unload 흐름은 아래 순서로 동작할 수 있다.

1. 브라우저가 `sessionBuffer.saveToStorage()`로 로컬 백업을 남긴다.
2. 브라우저가 `sendAbortBeacon("UNLOAD")`로 서버에 중단 요청을 보낸다.
3. 서버는 해당 `workout_session`을 `ABORTED`로 바꾼다.
4. 사용자가 다시 접속하면 localStorage에는 상세 데이터가 남아 있지만, 서버 세션은 이미 `ABORTED`일 수 있다.

따라서 복구 저장 구현 시 단순히 기존 `/api/workout/session/:sessionId/end`를 다시 호출하는 것만으로는 부족할 수 있다. 현재 `endWorkoutSession()`은 이미 종료된 세션에 대해 `alreadyEnded: true`를 반환할 수 있으므로, ABORTED 세션의 상세 snapshot/event를 저장하지 못할 가능성이 있다.

복구 구현자는 반드시 아래 중 하나를 선택해야 한다.

- 옵션 A: `/end`가 `recovered: true` payload를 받으면 소유자 검증 후 `ABORTED` 세션도 복구 저장할 수 있게 한다.
- 옵션 B: 별도 엔드포인트 `POST /api/workout/session/:sessionId/recover`를 만든다.
- 옵션 C: unload 시 abort beacon을 늦추거나 조건부로 보내되, 서버에 오래 남는 `RUNNING` 세션 정리 정책을 더 강화한다.

권장안은 옵션 A다. 기존 종료 저장 로직과 snapshot/event replace-all 정책을 재사용할 수 있고, API surface를 크게 늘리지 않는다.

## 데이터 계약 초안

### localStorage 백업 키

현재 키:

```text
fitplus_session_${sessionId}
```

추가할 재시도 큐 키:

```text
fitplus_pending_end_${sessionId}
```

추가할 인덱스 키:

```text
fitplus_recovery_index
```

인덱스 키는 전체 localStorage를 매번 스캔하지 않기 위한 선택 사항이다. 첫 구현에서는 `fitplus_session_` prefix scan으로 시작해도 된다.

### 복구 payload 확장

`PUT /api/workout/session/:sessionId/end`에 아래 필드를 추가한다.

```json
{
  "recovered": true,
  "recovery_source": "localStorage",
  "recovered_at": "ISO-8601 string",
  "client_saved_at": 1710000000000
}
```

서버 저장 시 권장 이벤트:

```text
SESSION_RECOVERED_FROM_LOCAL_BACKUP
```

저장 실패 재시도 성공 시 권장 이벤트:

```text
SESSION_END_RETRY_SUCCEEDED
```

저장 실패 재시도 실패 시 클라이언트 localStorage에 실패 횟수를 누적한다.

## 4차 구현 체크포인트: localStorage 백업 감지 UI

목표: 운동 페이지 진입 시 이전 세션 백업이 남아 있으면 사용자에게 알리고, 복구 시도 또는 삭제를 선택하게 한다.

### 4-1. 백업 탐색 유틸 추가

- [ ] `public/js/workout/session-buffer.js`에 정적 helper를 추가한다.
  - [ ] `SessionBuffer.listStoredSessions()` 추가
  - [ ] `SessionBuffer.readStoredSession(sessionId)` 추가
  - [ ] `SessionBuffer.removeStoredSession(sessionId)` 추가
- [ ] helper는 `localStorage` 접근 실패를 삼키고 빈 결과를 반환한다.
- [ ] helper는 malformed JSON을 발견하면 해당 키를 삭제하거나 `invalid: true`로 표시한다.
- [ ] helper 결과는 최소 아래 필드를 포함한다.
  - [ ] `sessionId`
  - [ ] `exerciseCode`
  - [ ] `mode`
  - [ ] `selectedView`
  - [ ] `savedAt`
  - [ ] `scoreCount`
  - [ ] `repCount`
  - [ ] `eventCount`

### 4-2. 복구 UI 추가

- [ ] `views/workout/session.ejs`에 복구 안내 영역 또는 modal placeholder를 추가한다.
- [ ] 안내 문구는 사용자가 이해할 수 있게 작성한다.
  - [ ] "이전 운동 기록 일부가 브라우저에 남아 있습니다."
  - [ ] "복구 저장을 시도하거나 삭제하고 새로 시작할 수 있습니다."
- [ ] 버튼을 2개 제공한다.
  - [ ] `복구 저장 시도`
  - [ ] `삭제하고 새로 시작`
- [ ] `public/workout.css`에 기존 workout UI 톤에 맞는 스타일을 추가한다.
- [ ] 복구 UI는 운동 시작 전 `PREPARING` 상태에서만 표시한다.

### 4-3. controller 연결

- [ ] `public/js/workout/session-controller.js` 초기화 말미에서 백업 목록을 조회한다.
- [ ] 현재 세션 페이지와 관련 없는 운동 백업도 표시할지 결정한다.
  - 권장: 모든 백업을 표시하되 운동명/모드/저장 시각을 보여준다.
- [ ] `삭제하고 새로 시작` 클릭 시 해당 localStorage 키를 삭제하고 UI를 숨긴다.
- [ ] `복구 저장 시도` 클릭 시 5차의 재전송 로직이 없으면 "복구 저장 기능은 다음 단계에서 제공" 상태로 막지 말고, 4차에서는 최소한 payload 구성 가능 여부까지 검증한다.
- [ ] 4차만 독립 배포해야 한다면 복구 버튼 대신 `백업 삭제`만 활성화하고, 복구 버튼은 비활성화하지 말고 안내 문구로 "저장 복구는 다음 단계에서 지원"을 표시한다.

### 4-4. 테스트

- [ ] `test/workout/session-buffer.test.js`에 localStorage stub 기반 테스트를 추가한다.
  - [ ] 백업 목록을 읽는다.
  - [ ] 깨진 JSON을 안전하게 처리한다.
  - [ ] 백업 삭제가 올바른 키를 제거한다.
- [ ] `test/workout/session-controller-seam.test.js`가 계속 통과하는지 확인한다.
- [ ] 실행 명령:

```bash
npm test
```

### 4차 완료 기준

- [ ] 운동 페이지 진입 시 localStorage 백업 존재 여부를 사용자가 알 수 있다.
- [ ] 사용자가 오래된 백업을 삭제할 수 있다.
- [ ] 복구 저장 자체는 5차에서 처리하더라도, UI와 데이터 탐색 계약이 고정된다.
- [ ] `npm test`가 통과한다.

## 5차 구현 체크포인트: 저장 실패 재시도 큐와 복구 저장

목표: 운동 종료 저장 실패 또는 unload 이후 남은 localStorage 백업을 서버에 다시 저장할 수 있게 한다.

### 5-1. pending end payload 저장

- [ ] `finishWorkout()`에서 `/end` 요청 전 payload를 `fitplus_pending_end_${sessionId}`로 저장한다.
- [ ] 저장 성공 시 `fitplus_pending_end_${sessionId}`와 `fitplus_session_${sessionId}`를 모두 삭제한다.
- [ ] 저장 실패 시 pending payload를 유지한다.
- [ ] pending payload에는 최소 아래 필드를 포함한다.
  - [ ] `sessionId`
  - [ ] `payload`
  - [ ] `createdAt`
  - [ ] `lastAttemptAt`
  - [ ] `attemptCount`
  - [ ] `source: "finishWorkout"`

### 5-2. 재시도 유틸 추가

- [ ] 새 파일 `public/js/workout/session-recovery.js`를 추가한다.
- [ ] CommonJS 테스트와 브라우저 전역을 모두 지원한다.
  - [ ] 브라우저: `window.SessionRecovery`
  - [ ] Node: `module.exports`
- [ ] 제공 함수:
  - [ ] `listPendingEndPayloads()`
  - [ ] `savePendingEndPayload(sessionId, payload, metadata)`
  - [ ] `removePendingEndPayload(sessionId)`
  - [ ] `buildRecoveredEndPayload(storedSession)`
  - [ ] `retryEndPayload({ sessionId, payload, fetchImpl })`
- [ ] `retryEndPayload()`는 HTTP 409/404/5xx를 구분해 결과 객체를 반환한다.

### 5-3. ABORTED 세션 복구 저장 백엔드 처리

- [ ] `controllers/workout.js`의 `endWorkoutSession()`에서 `req.body.recovered === true`를 인식한다.
- [ ] 세션 소유권은 기존처럼 `session_id + user_id`로 확인한다.
- [ ] 허용 조건을 명확히 한다.
  - [ ] `RUNNING` 세션: 기존 종료 저장과 동일하게 처리
  - [ ] `ABORTED` 세션 + `recovered: true`: snapshot/event replace-all 저장 허용
  - [ ] `DONE` 세션: 기존처럼 중복 종료로 처리하거나, recovery overwrite를 금지
- [ ] `ABORTED` 복구 저장이 성공하면 `workout_session.status`를 `DONE`으로 바꾼다.
- [ ] `session_event`에 `SESSION_RECOVERED_FROM_LOCAL_BACKUP` 이벤트를 추가한다.
- [ ] routine 세션이면 `syncRoutineExecutionFromSession()`이 `DONE` 기준으로 다시 보정되는지 확인한다.
- [ ] 기존 abort 이벤트를 삭제하지 않을지 결정한다.
  - 권장: 현재 `/end` 저장은 event replace-all 성격이므로 payload events에 recovery event를 추가해 함께 저장한다.

### 5-4. 복구 UI 동작 연결

- [ ] 4차에서 만든 `복구 저장 시도` 버튼을 실제 재시도 함수에 연결한다.
- [ ] 저장 중 상태를 표시한다.
  - [ ] 버튼 disabled
  - [ ] "복구 저장 중..."
- [ ] 성공 시 안내한다.
  - [ ] "이전 운동 기록을 복구했습니다."
  - [ ] 결과 페이지 `/workout/result/:sessionId`로 이동
- [ ] 실패 시 안내한다.
  - [ ] 409: 이미 서버에서 종료된 세션일 수 있음을 설명
  - [ ] 404: 세션을 찾을 수 없음을 설명하고 삭제 선택 제공
  - [ ] 네트워크 실패: 나중에 다시 시도할 수 있음을 설명

### 5-5. 결과/히스토리 표시

- [ ] 최소 구현: `session_event`에 recovery event가 있으면 히스토리 상세의 이벤트 목록에서 확인 가능하게 한다.
- [ ] 권장 구현: `controllers/history.js`의 상세 응답에 `session.recovered` 또는 `recovery_info`를 추가한다.
- [ ] `public/js/history-page.js`에서 복구된 세션이면 작은 안내 문구를 표시한다.
  - [ ] "브라우저 백업에서 복구된 기록입니다."
  - [ ] "일부 실시간 데이터는 누락될 수 있습니다."
- [ ] 결과 페이지에서도 동일 안내를 표시할지 결정한다.

### 5-6. 테스트

- [ ] `test/workout/session-recovery.test.js`를 추가한다.
  - [ ] pending payload 저장/조회/삭제
  - [ ] retry success
  - [ ] retry 409/404/network failure
  - [ ] recovered payload metadata 추가
- [ ] backend API 테스트 기반이 없다면, 먼저 서비스 함수 단위로 분리하거나 controller helper를 export하지 말고 수동 검증 체크리스트를 남긴다.
- [ ] 기존 테스트 실행:

```bash
npm test
```

### 5차 완료 기준

- [ ] 저장 실패 후 페이지를 새로 열어도 재시도 가능한 payload가 남아 있다.
- [ ] unload abort 이후에도 localStorage 백업을 사용해 서버 기록을 복구 저장할 수 있다.
- [ ] 성공한 복구는 localStorage 백업을 삭제한다.
- [ ] 실패한 복구는 사용자에게 이유와 다음 행동을 보여준다.
- [ ] 복구된 기록임을 결과 또는 히스토리에서 확인할 수 있다.
- [ ] `npm test`가 통과한다.

## 수동 검증 체크리스트

### 정상 종료

- [ ] 자유 운동 시작 후 정상 종료한다.
- [ ] 결과 페이지로 이동한다.
- [ ] localStorage에 `fitplus_session_${sessionId}`가 남지 않는다.
- [ ] localStorage에 `fitplus_pending_end_${sessionId}`가 남지 않는다.

### 저장 실패

- [ ] DevTools Network에서 `/api/workout/session/:id/end`를 실패시키거나 서버를 잠시 중단한다.
- [ ] 종료 버튼이 `저장 재시도` 상태가 된다.
- [ ] pending end payload가 localStorage에 남는다.
- [ ] 서버 복구 후 재시도하면 결과 페이지로 이동한다.
- [ ] 성공 후 pending payload가 삭제된다.

### 새로고침/탭 닫힘

- [ ] 운동 중 새로고침한다.
- [ ] localStorage에 `fitplus_session_${sessionId}` 백업이 남는다.
- [ ] 다음 접속 시 복구 안내 UI가 표시된다.
- [ ] 삭제 선택 시 백업이 삭제된다.
- [ ] 복구 선택 시 서버 저장을 시도한다.

### 모바일 백그라운드

- [ ] 모바일 브라우저에서 운동 시작 후 앱 전환 또는 화면 잠금을 수행한다.
- [ ] 다시 돌아왔을 때 Wake Lock 재요청 또는 안내가 정상 동작한다.
- [ ] 세션 백업 또는 복구 안내가 동작한다.

### 루틴 운동

- [ ] 루틴 운동 중 세트 완료 직전 새로고침한다.
- [ ] 복구 저장 후 `workout_session`, `workout_set`, `routine_step_instance`, `routine_instance` 상태가 모순되지 않는다.
- [ ] 다음 루틴 시작 시 stale cleanup이 과거 복구 세션을 잘못 중단하지 않는다.

## 구현 리스크와 방어 규칙

- [ ] 복구 저장은 반드시 세션 소유자만 가능해야 한다.
- [ ] 다른 사용자의 sessionId를 localStorage에 넣어도 서버에서 거부되어야 한다.
- [ ] DONE 세션을 복구 payload로 덮어쓰지 않는다.
- [ ] ABORTED 세션 복구 허용은 `recovered: true`일 때만 한다.
- [ ] recovery payload 크기가 너무 커지면 기존 BODY_LIMIT에 걸릴 수 있으므로 pending payload 저장 전 크기를 기록한다.
- [ ] localStorage가 disabled/private mode일 때도 운동 자체는 계속 가능해야 한다.
- [ ] JSON parse 실패는 전체 세션 초기화를 막지 않아야 한다.
- [ ] 복구 UI는 운동 중에는 뜨지 않아야 한다.

## 권장 구현 순서

1. `SessionBuffer` 정적 localStorage helper 추가
2. 백업 감지 UI 추가
3. pending end payload 저장 추가
4. `session-recovery.js` 추가
5. backend `recovered: true` 종료 저장 허용
6. 히스토리/결과 복구 표시 추가
7. 테스트와 수동 검증 수행

## 완료 후 업데이트할 문서

- [ ] `README.md`
  - 세션 유실 방지와 복구 기능이 사용자에게 보이는 수준까지 완성되면 짧게 추가한다.
- [ ] `docs/workout_accuracy_evaluation.md`
  - 모바일 백그라운드 전환 제한사항 결과를 기록한다.
- [ ] `docs/superpowers/specs/2026-04-16-workout-session-data-storage-design.md`
  - 복구 저장 경로가 구현되면 현재 운영 스펙에 반영한다.
