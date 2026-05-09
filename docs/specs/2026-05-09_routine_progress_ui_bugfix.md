# 2026-05-09 루틴 진행률 UI 버그 수정

## 1) 실제 증상

루틴 운동 중 rep 카운트와 세트 표시는 정상적으로 올라가는데,
우측 루틴 진행 카드가 아래처럼 현재 단계 진행을 반영하지 못했다.

- 상단 `횟수`는 증가한다.
- 현재 운동/세트는 정상 표시된다.
- 하지만 `루틴 진행` 퍼센트가 `0%`에 머물 수 있다.
- 같은 step 안에서 목표 rep를 채워 가는 동안 진행감이 전혀 보이지 않는다.

예시:
- 2단계 루틴의 1번째 step에서 목표 `3회 x 1세트`
- 실제 카운트는 `2회`, `3회`로 증가
- 루틴 카드 퍼센트는 step 전환 전까지 계속 `0%`

---

## 2) 원인

문제는 서버 동기화가 아니라 클라이언트 진행률 계산 방식에 있었다.

기존 `public/js/workout/session-controller.js`의 `updateRoutineStepDisplay()`는
루틴 퍼센트를 사실상 `currentStepIndex / totalSteps`만으로 계산했다.

즉:
- 현재 step 안에서 `rep`가 얼마나 쌓였는지
- 현재 step의 `set`이 몇 세트 남았는지
- 시간 기반 루틴에서 목표 시간 대비 얼마나 버텼는지

이 정보가 루틴 퍼센트 계산에 포함되지 않았다.

결과적으로 루틴 카드는 아래처럼 동작했다.

1. step 1 시작: `0%`
2. step 1 안에서 rep 증가: 여전히 `0%`
3. step 2로 넘어가는 순간: 갑자기 `50%`

이 동작은 내부 상태와 사용자 체감 진행률이 어긋나는 UX 버그였다.

---

## 3) 수정 내용

### A. 진행률 계산 책임을 루틴 매니저로 이동

`public/js/workout/routine-session-manager.js`

- `resolveRoutineProgressState(...)` 추가
- 아래 값을 함께 받아 현재 루틴 퍼센트를 계산한다.
  - `currentStepIndex`
  - `currentSet`
  - `currentRep`
  - `currentSetWorkSec`
  - `bestHoldSec`
  - `isTimeBasedExercise`
  - `routineSetup`

계산 원칙:

- step 안의 완료 세트 수를 반영한다.
- 현재 세트의 rep 진행도 또는 시간 진행도를 반영한다.
- 최종 퍼센트는 `(완료된 이전 step + 현재 step 내부 진행도) / 전체 step 수`로 계산한다.

예:
- 2단계 루틴
- 1단계 목표 `3회 x 1세트`
- 현재 `2회`

기존:
- `0 / 2 = 0%`

수정 후:
- `(0 + 2/3) / 2 = 약 33%`

### B. 루틴 카드 재렌더 시점을 보강

`public/js/workout/session-controller.js`

아래 시점마다 `updateRoutineStepDisplay()`를 다시 호출하도록 보강했다.

- rep 완료 직후
- 시간 기반 목표의 타이머 tick
- 플랭크 런타임 표시 갱신 시
- 다음 세트/다음 step 초기화 시

이렇게 해서 진행률 계산만 바꾸는 데서 끝나지 않고,
실제 화면도 카운터 변화와 함께 즉시 갱신되도록 맞췄다.

---

## 4) 영향 범위

이번 수정은 루틴 진행 카드의 표시 로직에 대한 변경이다.

영향 받는 영역:

- `public/js/workout/routine-session-manager.js`
- `public/js/workout/session-controller.js`
- `test/workout/routine-session-manager.test.js`

영향 받지 않는 영역:

- 루틴 세트 저장 API 계약
- `NEXT_SET` / `NEXT_STEP` / `ROUTINE_COMPLETE` 서버 액션 해석
- rep 카운트 로직 자체
- learn mode의 별도 step 진행률 UI

---

## 5) 검증 메모

추가한 테스트 케이스:

- rep 기반 step 진행률 계산
- 다세트 step 진행률 계산
- 시간 기반 step 진행률 계산

샌드박스 제약:

- `node --test ...` 실행은 현재 환경에서 `spawn EPERM`으로 막혔다.

대신 아래는 직접 확인했다.

- `session-controller.js` CommonJS 로드 성공
- `resolveRoutineProgressState(...)` 인라인 assertion 통과

즉, 이번 수정은 현재 확인 가능한 범위에서:

- 문법 오류 없이 로드되고
- 핵심 진행률 계산식은 기대값대로 동작한다.

---

## 6) 변경 파일

- `public/js/workout/routine-session-manager.js`
- `public/js/workout/session-controller.js`
- `test/workout/routine-session-manager.test.js`
- `docs/specs/2026-05-09_routine_progress_ui_bugfix.md`
