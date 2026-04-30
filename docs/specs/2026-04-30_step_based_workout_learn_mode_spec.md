# Step 기반 운동 배우기 모드 Spec

작성일: 2026-04-30

## 1. 배경

현재 프로젝트에는 아래 전제가 이미 존재한다.

- 상단 네비게이션에 `/learn` 탭이 존재한다.
- 운동 결과 페이지에서 `/learn/:exerciseCode`로 이동하는 CTA가 이미 있다.
- 세션 클라이언트는 `mode: 'FREE' | 'ROUTINE' | 'LEARN'` 구조를 염두에 두고 있다.
- 포즈 추론, quality gate, 운동별 판정 로직은 이미 운동 세션용으로 분리되어 있다.

하지만 현재 `운동 배우기`는 "운동별 설명 페이지"인지, "실제 포즈를 따라 하며 통과하는 학습 모드"인지 명확히 고정되어 있지 않다.

이번 문서에서는 사용자 요구를 기준으로 `운동 배우기`를 다음처럼 재정의한다.

- step별로 사용자가 취해야 하는 자세를 안내한다.
- 사용자가 해당 step의 목표 자세를 실제로 취해야 다음 step으로 이동한다.
- 전체 화면 구조와 카메라/포즈/게이트 파이프라인은 기존 운동 세션 UI를 최대한 재사용한다.

즉, `운동 배우기`는 정적 정보 페이지가 아니라 **step 통과형 자세 튜토리얼 모드**다.

---

## 2. 목표

핵심 목표는 4가지다.

1. 운동마다 "어떤 자세를 먼저 취해야 하는지"를 순서대로 가르친다.
2. 사용자가 현재 step의 목표 자세를 만족했을 때만 다음 step으로 진행한다.
3. 운동 세션의 카메라 화면, 포즈 인식, quality gate, 운동별 로직을 재사용한다.
4. 점수 중심 운동 세션과 달리, 학습 모드는 "반복 수"보다 "현재 자세 통과 여부"를 우선한다.

---

## 3. 핵심 UX 원칙

### 3.1 정보형 페이지가 아니라 인터랙티브 튜토리얼이다

사용자는 글만 읽는 것이 아니라 카메라 앞에서 실제 자세를 취한다.

### 3.2 한 번에 하나의 step만 본다

현재 시점에 사용자가 신경 써야 할 자세는 하나여야 한다.  
여러 기준을 동시에 길게 보여주면 학습 부담이 커진다.

### 3.3 quality gate를 통과한 뒤에만 step 판정을 한다

전신이 잘리지 않았는지, 필요한 관절이 보이는지, 선택한 view가 맞는지 먼저 확인해야 한다.  
입력 품질이 나쁘면 "자세 실패"가 아니라 "판정 보류"로 본다.

### 3.4 step 통과는 단일 프레임이 아니라 짧은 유지 시간으로 판정한다

한 프레임 우연히 맞는 자세가 잡혔다고 통과시키지 않는다.  
예를 들어 `600ms ~ 1200ms` 정도 연속으로 유지해야 통과시킨다.

### 3.5 학습 완료 후 바로 실전 운동으로 이어지게 한다

마지막 step 완료 후에는 `자율 운동 시작` 또는 `다시 연습` CTA를 제공한다.

---

## 4. 사용자 흐름

권장 흐름은 아래와 같다.

1. 사용자가 `/learn` 또는 운동 결과 페이지에서 특정 운동 학습으로 진입한다.
2. 시스템은 기존 운동 세션과 유사한 준비 화면을 보여준다.
3. 사용자는 카메라 입력 소스와 채점 자세(view)를 선택한다.
4. 학습 시작 후 현재 step의 자세 안내가 표시된다.
5. 사용자가 목표 자세를 일정 시간 만족하면 다음 step으로 이동한다.
6. 모든 step을 완료하면 학습 완료 화면으로 전환된다.
7. 사용자는 바로 일반 운동 세션으로 이어가거나 다시 학습할 수 있다.

```text
/learn/:exerciseCode
  -> 준비 화면
  -> Step 1 통과
  -> Step 2 통과
  -> Step 3 통과
  -> ...
  -> 학습 완료
  -> 자율 운동 시작 / 다시 연습
```

---

## 5. 기존 구조 재사용 원칙

`운동 배우기`는 별도 페이지를 새로 만드는 것보다 기존 운동 세션 구조를 재사용하는 편이 맞다.

| 대상 | 재사용 방식 |
| --- | --- |
| `views/workout/session.ejs` | 전체 레이아웃과 카메라/사이드바 골격 재사용 |
| `public/js/workout/session-controller.js` | 세션 오케스트레이션 재사용, `LEARN` 분기 추가 |
| `public/js/workout/pose-engine.js` | 포즈 추론, 각도 계산, 시각 피드백 재사용 |
| `public/js/workout/scoring-engine.js` | 공통 quality gate와 metric 접근 헬퍼 재사용 |
| `public/js/workout/session-ui.js` | 카드 렌더링, 상태 뱃지, 토스트/알림 재사용 |
| `public/js/workout/exercises/*.js` | 운동별 learn step 정의와 step evaluator 추가 |

즉, 새로 만드는 것은 "학습 전용 step 상태머신"이지, 카메라 기반 세션 시스템 전체가 아니다.

---

## 6. 모드 정의

`운동 배우기`는 기존 세션 모드 체계 안에서 `LEARN` 모드로 다룬다.

```text
FREE    : 일반 자율 운동
ROUTINE : 루틴 운동
LEARN   : step 기반 운동 배우기
```

`LEARN` 모드는 아래 특성을 가진다.

- rep count 중심이 아니다.
- 최종 점수보다 step 통과 여부가 중요하다.
- 현재 step 설명, 체크 항목, 통과 진행률을 우선 노출한다.
- 운동별 `scoreRep()`보다 `evaluateLearnStep()` 계열 로직이 우선한다.

---

## 7. Learn Step 데이터 모델

운동 배우기 step은 DB가 아니라 **운동별 JS 모듈** 안에 선언하는 것이 적합하다.

이유는 다음과 같다.

- 운동마다 step 구조가 다르다.
- view별 요구 자세가 다를 수 있다.
- metric 조합과 예외 처리 방식이 운동별로 크게 다르다.
- 2026-04-09 아키텍처 결정과 동일하게, 운동별 복잡성은 JS 코드가 더 자연스럽게 수용한다.

권장 step shape 예시는 아래와 같다.

```js
{
  id: 'setup_stance',
  title: '기본 준비 자세',
  instruction: '발을 어깨너비로 벌리고 정면을 바라보세요.',
  hintLines: [
    '전신이 화면 안에 들어오게 서세요.',
    '무릎과 발끝 방향을 맞춰주세요.'
  ],
  requiredView: 'FRONT',
  holdMs: 800,
  successMessage: '좋아요. 기본 자세가 안정적입니다.',
  evaluator(runtime) {
    return {
      passed: true,
      progress: 1,
      checks: [
        { label: '전신이 화면 안에 보임', passed: true },
        { label: '발 간격이 안정적임', passed: true }
      ],
      feedback: null
    };
  }
}
```

### 7.1 필수 필드

- `id`: step 고유 식별자
- `title`: step 제목
- `instruction`: 한 줄 핵심 안내
- `holdMs`: 통과를 위해 유지해야 하는 시간
- `evaluator(runtime)`: 현재 프레임이 이 step을 만족하는지 평가

### 7.2 권장 필드

- `hintLines`: 사용자가 읽을 보조 안내
- `requiredView`: 특정 step이 특정 view를 강하게 요구할 때 사용
- `successMessage`: step 완료 직후 짧게 띄울 메시지
- `illustrationKey`: 추후 이미지나 일러스트 매핑이 필요할 때 사용

---

## 8. 런타임 판정 규칙

### 8.1 quality gate 선행

현재 프레임이 아래 조건을 만족하지 않으면 step evaluator를 실행하지 않는다.

- 전신 또는 핵심 관절이 프레임 안에 들어옴
- selected view와 실제 view가 크게 어긋나지 않음
- tracking/visibility가 일정 수준 이상임
- 안정 프레임 조건을 만족함

이 경우 UX는 "step 실패"가 아니라 아래처럼 보여준다.

- `자세 판정 대기`
- `카메라를 조금 더 뒤로 두세요`
- `측면 자세를 유지해주세요`

### 8.2 현재 step만 평가

한 프레임에서 여러 step을 동시에 평가하지 않는다.  
항상 `현재 step` 하나만 활성화한다.

### 8.3 연속 유지 시간으로 통과

`passed === true`가 한 번 나왔다고 바로 step을 넘기지 않는다.

- `passed` 상태가 유지되면 hold 타이머 증가
- 중간에 자세가 무너지면 hold 타이머 리셋
- `holdMs`를 채우면 step 완료

### 8.4 기본 정책은 "뒤로 보내지 않음"

step을 한 번 통과한 뒤 다음 step으로 넘어가면, 자세가 잠시 무너졌다고 이전 step으로 되돌리지 않는다.

이유는 다음과 같다.

- 학습 흐름이 불안정해진다.
- 사용자가 왜 다시 뒤로 갔는지 이해하기 어렵다.
- 실시간 추론 흔들림으로 UX가 불필요하게 예민해진다.

필요하면 추후 특정 운동에서만 예외적으로 backward step을 허용할 수 있다.

### 8.5 통과 직후 짧은 성공 상태

step 통과 직후 `0.5초 ~ 1초` 정도 짧은 성공 상태를 보여주고 다음 step으로 전환한다.

예시:

- `좋아요. 이제 더 깊이 내려가 보세요.`
- `좋아요. 이번에는 팔을 끝까지 펴주세요.`

---

## 9. Learn Mode 상태머신

권장 상태 모델은 아래와 같다.

```text
PREPARING
  -> LEARNING
  -> STEP_SUCCESS_TRANSITION
  -> LEARNING
  -> ...
  -> COMPLETED
```

보조 상태는 아래처럼 둔다.

- `WITHHOLD`: quality gate로 인해 step 판정이 일시 보류된 상태
- `PAUSED`: 사용자가 일시정지한 상태
- `ABORTED`: 사용자가 중도 종료한 상태

### 9.1 최소 상태 값

- `currentStepIndex`
- `currentHoldMs`
- `isGateWithheld`
- `completedSteps`
- `lastStepFeedback`
- `startedAt`
- `completedAt`

---

## 10. UI 설계

### 10.1 기본 원칙

기존 운동 세션 UI shell은 유지한다.

- 좌측: 카메라 영역
- 우측: 진행 카드 / 안내 카드 / 종료 버튼
- 상단: 운동명, 상태 뱃지

### 10.2 학습 모드에서 바뀌는 영역

| 기존 운동 세션 UI | 학습 모드에서의 의미 |
| --- | --- |
| 실시간 점수 카드 | 현재 step 카드 |
| breakdown 3개 | 현재 step 체크 항목 |
| rep 수 | 현재 step 번호 또는 완료 step 수 |
| 피드백 alert | 현재 자세 교정 문구 |
| 운동 종료 버튼 | 학습 종료 버튼 |

### 10.3 현재 step 카드 권장 구성

```text
[Step 2 / 5]
무릎과 발끝 방향 맞추기

- 무릎이 안쪽으로 모이지 않게 해주세요
- 발끝 방향과 비슷하게 유지하세요

진행률: 65%
```

### 10.4 완료 화면

학습 완료 시 아래 요소를 보여준다.

- `운동 배우기 완료`
- 완료한 운동명
- 다시 연습 버튼
- 자율 운동 시작 버튼

---

## 11. 운동별 step 예시

아래 step은 1차 구현의 예시이며, 실제 threshold는 운동 모듈 안에서 조정한다.

### 11.1 스쿼트

스쿼트는 view에 따라 핵심이 달라지므로 `FRONT`와 `SIDE`를 분리해서 생각해야 한다.

#### FRONT 기준 예시

1. 기본 서기
2. 무릎과 발끝 방향 맞추기
3. 상체를 세운 채 내려가기 시작
4. 충분한 깊이까지 앉기
5. 무릎 정렬을 유지한 채 일어서기

#### SIDE 기준 예시

1. 측면 준비 자세
2. 엉덩이를 뒤로 보내며 내려가기 시작
3. 상체 과전방 기울기 없이 하강
4. 충분한 깊이 확보
5. 끝까지 일어서서 락아웃 만들기

#### 스쿼트 step에서 주로 재사용할 metric

- `depth`
- `hip_angle`
- `spine_angle`
- `trunk_tibia_angle`
- `knee_alignment`
- `knee_valgus`
- `heel_contact`

### 11.2 푸쉬업

1. 하이 플랭크 준비 자세 만들기
2. 머리부터 발끝까지 몸통 일직선 유지하기
3. 팔꿈치를 굽혀 천천히 내려가기
4. 충분한 깊이 도달하기
5. 몸통을 무너뜨리지 않고 팔 끝까지 펴기

#### 푸쉬업 step에서 주로 재사용할 metric

- `elbow_depth`
- `elbow_lockout`
- `hip_angle`
- `spine_stability`
- `tempo`

### 11.3 플랭크

1. 측면 카메라 세팅 완료하기
2. 팔꿈치를 어깨 아래에 두기
3. 머리-등-골반-발뒤꿈치를 일직선으로 맞추기
4. 다리를 곧게 펴고 버티기
5. 안정된 자세로 일정 시간 유지하기

#### 플랭크 step에서 주로 재사용할 metric

- `hip_angle`
- `spine_angle`
- `shoulder_angle`
- `elbow_support_angle`
- `knee_angle`

---

## 12. 저장 정책

1차 구현에서는 **서버 저장 없이 클라이언트 런타임 학습 모드로 먼저 구현하는 것을 권장**한다.

이유는 다음과 같다.

- 현재 저장 구조는 점수/rep/세션 스냅샷 중심이다.
- 학습 모드는 "현재 step 통과 여부"가 핵심이어서 결과 shape가 다르다.
- 1차 목표는 히스토리 집계보다 step UX 검증에 있다.

### 12.1 1차 권장안

- 세션 row 생성 없이 클라이언트에서만 학습 수행
- 완료 시 화면 전환만 수행
- 운동 결과 통계, 퀘스트, 히스토리와 연결하지 않음

### 12.2 2차 확장안

추후 저장이 필요해지면 아래처럼 확장할 수 있다.

- `mode=LEARN` 세션 생성
- 최종 점수 대신 `completed_steps / total_steps` 저장
- `session_event`에 step 완료 이벤트 기록
- 일반 운동 통계에서는 `LEARN` 모드를 제외

---

## 13. 1차 구현 범위

### 포함

- `/learn/:exerciseCode` 진입
- 기존 운동 세션 UI 재사용
- `LEARN` 모드 분기
- 운동별 learn step 정의
- quality gate 연동
- step hold 기반 통과
- 학습 완료 화면

### 제외

- DB 기반 step 관리
- 관리자용 step 편집 UI
- 학습 모드 히스토리/통계 저장
- 음성 전용 학습 시나리오 고도화
- 단계별 이미지/일러스트 필수화

---

## 14. 수정 대상 파일

### 필수 수정 파일

| 파일 | 변경 내용 |
| --- | --- |
| `routes/workout.js` 또는 `routes/main.js` | `/learn/:exerciseCode` 라우트 추가 |
| `controllers/workout.js` | `LEARN` 모드 세션 렌더링 추가 |
| `views/workout/session.ejs` | learn mode 전용 패널/문구 분기 |
| `public/js/workout/session-controller.js` | learn mode 상태머신 및 step 진행 로직 추가 |
| `public/js/workout/session-ui.js` | step 카드, step 진행률, 완료 UI 렌더링 추가 |
| `public/js/workout/exercises/*.js` | 운동별 `getLearnSteps()` / `evaluateLearnStep()` 추가 |

### 선택적 분리 파일

| 파일 | 역할 |
| --- | --- |
| `public/js/workout/learn-step-engine.js` | learn mode 전용 상태머신 분리 |
| `public/js/workout/learn-copy.js` | 공통 step 안내 문구 분리 |

---

## 15. 테스트 관점

최소 검증 항목은 아래와 같다.

1. quality gate 보류 중에는 step 진행이 멈춘다.
2. 현재 step의 목표 자세를 `holdMs` 이상 유지하면 다음 step으로 넘어간다.
3. hold 도중 자세가 무너지면 진행률이 초기화된다.
4. 모든 step 완료 시 완료 화면으로 전환된다.
5. 스쿼트는 `FRONT`와 `SIDE`에서 서로 다른 step 평가 기준을 사용할 수 있다.
6. 푸쉬업과 플랭크는 `SIDE` view mismatch 시 step 통과가 발생하지 않는다.

권장 테스트 파일 예시는 아래와 같다.

- `test/workout/learn-step-engine.test.js`
- `test/workout/session-controller-learn-mode.test.js`
- `test/workout/squat-learn-steps.test.js`
- `test/workout/push-up-learn-steps.test.js`

---

## 16. 수용 기준

아래 조건을 만족하면 1차 목표를 달성한 것으로 본다.

1. 사용자가 특정 운동의 학습 모드에 진입할 수 있다.
2. 현재 step에서 취해야 할 자세가 한 번에 하나씩 명확히 보인다.
3. 사용자가 실제로 목표 자세를 일정 시간 유지했을 때만 다음 step으로 이동한다.
4. quality gate 실패는 자세 실패가 아니라 판정 보류로 안내된다.
5. 전체 UI 구조는 기존 운동 세션과 크게 다르지 않다.
6. 학습 완료 후 바로 일반 운동으로 이어질 수 있다.

---

## 17. 결론

`운동 배우기`는 단순한 설명 페이지보다, 기존 운동 세션 인프라를 재사용한 **step 기반 학습 세션**으로 구현하는 편이 제품 구조와 사용자 기대 모두에 더 잘 맞는다.

핵심은 다음 두 가지다.

- 기존 운동 세션 엔진은 재사용한다.
- 운동별 차이는 JS 모듈 안의 learn step 정의로 흡수한다.

이 방향으로 가면 `운동 세션`과 `운동 배우기`가 완전히 분리된 두 시스템이 아니라, 같은 포즈 엔진 위에서 목적만 다른 두 모드로 공존할 수 있다.
