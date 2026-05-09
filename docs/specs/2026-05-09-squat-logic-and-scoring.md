# 스쿼트 로직 및 채점 기준 설명

작성일: 2026-05-09

## 1. 문서 목적

이 문서는 현재 프로젝트의 스쿼트 운동 로직이 어떤 순서로 동작하는지, 그리고 스쿼트 1회가 어떤 기준으로 채점되는지 처음 보는 사람도 이해할 수 있도록 정리한 문서입니다.

핵심 파일은 다음과 같습니다.

- 스쿼트 전용 운동 모듈: `public/js/workout/exercises/squat-exercise.js:1-1908`
- 공통 반복 횟수 카운터: `public/js/workout/rep-counter.js:1-831`
- 공통 점수 계산 엔진: `public/js/workout/scoring-engine.js:1-928`
- 포즈/관절 각도 계산 엔진: `public/js/workout/pose-engine.js:1-1283`
- 운동 세션 제어 로직: `public/js/workout/session-controller.js:1010-2185`

---

## 2. 전체 구조 한눈에 보기

스쿼트 1회는 다음 흐름으로 처리됩니다.

```text
카메라 프레임 입력
→ PoseEngine이 사람의 관절 좌표와 각도 계산
→ session-controller가 품질 게이트 검사
→ ScoringEngine이 현재 프레임 점수 계산
→ 스쿼트 모듈이 실시간 피드백 항목 필터링
→ RepCounter가 스쿼트 상태 전이 판단
→ 스쿼트 모듈이 하강/최저점/상승/마무리 페이즈 기록
→ 다시 선 자세가 되면 1회 완료 판정
→ 스쿼트 모듈이 rep 전체 통계로 최종 점수 계산
→ UI와 세션 기록 업데이트
```

각 컴포넌트의 역할은 다음과 같습니다.

| 구성 요소 | 역할 |
|---|---|
| `PoseEngine` | MediaPipe Pose 결과를 받아 무릎, 엉덩이, 상체, 발 접지 등 각도와 보조 지표를 계산합니다. |
| `ScoringEngine` | 현재 프레임의 자세 점수와 메트릭별 breakdown을 계산합니다. |
| `RepCounter` | `NEUTRAL → ACTIVE → NEUTRAL` 흐름을 보고 운동 1회 완료 여부를 판단합니다. |
| `squat-exercise.js` | 스쿼트 전용 페이즈 추적, rep 통계 요약, 최종 채점 기준, 피드백 문구를 담당합니다. |
| `session-controller.js` | 카메라, AI 엔진, UI, 세션 버퍼, 루틴 진행을 연결합니다. |

---

## 3. 스쿼트 운동 등록 정보

스쿼트 모듈은 파일 상단의 manifest에 다음 정보로 정의되어 있습니다.

- 운동 코드: `SQUAT`
- 운동 이름: `스쿼트`
- 설명: `하체운동의 기본 스쿼트`
- 기본 목표 타입: `REPS`
- 허용 촬영 뷰: `FRONT`, `SIDE`, `DIAGONAL`
- 기본 뷰: `FRONT`

근거: `public/js/workout/exercises/squat-exercise.js:1-10`

브라우저에서는 마지막에 `registry.register('squat', squatExercise)`로 스쿼트 모듈이 운동 레지스트리에 등록됩니다.  
근거: `public/js/workout/exercises/squat-exercise.js:1871`

즉, 세션에서 운동 코드가 `squat`이면 이 파일의 스쿼트 전용 로직이 사용됩니다.

---

## 4. 세션 시작 시 엔진 연결 흐름

운동 세션이 준비되면 `session-controller.js`가 현재 운동에 맞춰 점수 엔진과 반복 카운터를 생성합니다.

핵심 흐름은 다음과 같습니다.

1. `ScoringEngine` 생성
2. 현재 운동 코드로 운동 모듈 조회
3. `RepCounter` 생성
4. rep 완료 시 `ScoringEngine.scoreRep()`가 호출되도록 연결
5. rep 완료 콜백으로 `handleRepComplete()` 연결

근거: `public/js/workout/session-controller.js:1044-1068`

특히 아래 연결이 중요합니다.

```text
repCounter.repEvaluator = (repRecord) => scoringEngine.scoreRep(repRecord)
repCounter.onRepComplete = handleRepComplete
```

근거: `public/js/workout/session-controller.js:1058-1061`

이 구조 때문에 rep가 완료되면 다음 흐름이 됩니다.

```text
RepCounter.completeRep()
→ ScoringEngine.scoreRep()
→ squatExercise.scoreRep()
→ handleRepComplete()
```

---

## 5. 카메라 프레임 처리 흐름

운동 중에는 매 프레임마다 `poseEngine.send(videoElement)`가 호출됩니다. 이 함수가 현재 비디오 프레임을 MediaPipe Pose로 넘기고, 결과가 나오면 포즈 계산 로직이 이어집니다.

근거: `public/js/workout/session-controller.js:1535-1544`

`PoseEngine.handleResults()`는 다음 작업을 수행합니다.

1. 사람이 감지되지 않으면 `onNoPerson()` 호출
2. 감지된 랜드마크에 스무딩 적용
3. `calculateAllAngles()`로 관절 각도 계산
4. 계산된 `angles`를 포함해 `onPoseDetected()` 콜백 호출

근거: `public/js/workout/pose-engine.js:150-193`

---

## 6. PoseEngine이 계산하는 스쿼트 핵심 값

`PoseEngine.calculateAllAngles()`는 스쿼트 채점에 필요한 다양한 값을 만듭니다.

주요 값은 다음과 같습니다.

| 값 | 의미 |
|---|---|
| `leftKnee`, `rightKnee` | 좌우 무릎 각도입니다. 서 있으면 180도에 가깝고, 앉을수록 작아집니다. |
| `leftHip`, `rightHip` | 좌우 엉덩이 각도입니다. 힙 힌지와 깊이 평가에 사용됩니다. |
| `spine` | 상체 기울기입니다. 상체 안정성 평가에 사용됩니다. |
| `tibia` | 정강이 기울기입니다. |
| `trunkTibiaAngle` | 상체와 정강이 각도 차이입니다. 측면 스쿼트에서 중요합니다. |
| `kneeAlignment` | 무릎이 발 라인과 잘 맞는지 보는 정렬 proxy입니다. |
| `kneeValgus` | 무릎이 안쪽으로 무너지는 정도입니다. 정면 스쿼트에서 중요합니다. |
| `heelContact` | 뒤꿈치가 바닥에 붙어 있는지 추정합니다. |
| `hipBelowKnee` | 엉덩이가 무릎보다 아래로 내려갔는지 추정합니다. |
| `view` | 현재 카메라 뷰가 정면인지 측면인지 추정합니다. |
| `quality` | 관절 가시성, 프레임 포함 비율, 뷰 안정성 등을 합산한 품질 정보입니다. |

근거: `public/js/workout/pose-engine.js:275-316`

### 6.1 무릎 각도

무릎 각도는 스쿼트에서 가장 중요한 기본 값입니다.

- 서 있을 때: 약 160~180도
- 내려가는 중: 약 110~150도
- 최저점: 약 90~110도

무릎 각도는 `leftKnee`, `rightKnee`로 계산됩니다.  
근거: `public/js/workout/pose-engine.js:251-252`, `public/js/workout/pose-engine.js:275-279`

### 6.2 엉덩이 각도

엉덩이 각도는 힙 힌지와 측면 스쿼트 깊이 평가에 쓰입니다.  
근거: `public/js/workout/pose-engine.js:253-254`, `public/js/workout/pose-engine.js:284-286`

### 6.3 상체 기울기

상체 기울기는 `getSpineAngle()`로 계산됩니다. 3D world landmark가 있으면 3D 기준으로 계산하고, 없으면 2D 이미지 좌표를 사용합니다.  
근거: `public/js/workout/pose-engine.js:548-597`

### 6.4 무릎 정렬과 무릎 valgus

무릎 정렬은 무릎과 발 라인의 차이를 보고 계산합니다.  
근거: `public/js/workout/pose-engine.js:725-755`

무릎 valgus는 엉덩이-무릎-발목 라인에서 무릎이 안쪽으로 치우친 정도를 계산합니다.  
근거: `public/js/workout/pose-engine.js:757-783`

### 6.5 뒤꿈치 접지

뒤꿈치 접지는 heel landmark와 foot index landmark의 y 좌표를 비교해 추정합니다.  
근거: `public/js/workout/pose-engine.js:785-829`

### 6.6 엉덩이가 무릎보다 아래인지 여부

엉덩이 중앙 y 좌표가 무릎 중앙 y 좌표보다 아래인지 확인합니다.  
근거: `public/js/workout/pose-engine.js:831-851`

---

## 7. 품질 게이트 로직

포즈가 감지되었다고 해서 바로 점수를 매기지는 않습니다. 먼저 `handlePoseDetected()`가 품질 게이트를 검사합니다.

근거: `public/js/workout/session-controller.js:1560-1574`

품질 게이트 단계에서는 다음을 확인합니다.

1. 카메라에 몸이 충분히 들어와 있는지
2. 감지 신뢰도가 충분한지
3. 추적 신뢰도가 충분한지
4. 주요 관절이 화면 안에 있고 잘 보이는지
5. 촬영 뷰가 사용자가 고른 뷰와 일치하는지
6. 최근 프레임에서 뷰가 안정적인지

`handlePoseDetected()`는 `evaluateQualityGate()`를 호출해서 pass 또는 withhold를 결정합니다.  
근거: `public/js/workout/session-controller.js:1583-1608`

`evaluateQualityGate()`의 주요 withhold 사유는 다음과 같습니다.

| 사유 | 의미 |
|---|---|
| `out_of_frame` | 몸이 화면 밖으로 벗어났거나 프레임 포함 비율이 낮습니다. |
| `low_confidence` | 포즈 감지 신뢰도가 낮습니다. |
| `tracked_joints_low` | 관절 추적 신뢰도가 낮습니다. |
| `joints_missing` | 주요 관절이 충분히 보이지 않습니다. |
| `view_mismatch` | 선택한 촬영 뷰와 실제 추정 뷰가 맞지 않습니다. |
| `view_unstable` | 최근 프레임에서 뷰가 흔들립니다. |

근거: `public/js/workout/scoring-engine.js:812-860`

품질 게이트가 실패하면 해당 프레임은 점수와 rep 진행에 반영되지 않습니다. 이 경우 화면에는 `측정 불안정` 안내가 표시됩니다.  
근거: `public/js/workout/session-controller.js:1609-1651`

---

## 8. 프레임 단위 실시간 점수 계산

품질 게이트를 통과하면 `ScoringEngine.calculate(angles)`가 호출됩니다.

근거: `public/js/workout/session-controller.js:1661-1664`

`calculate()`는 현재 프레임의 각도 값으로 메트릭별 점수를 계산합니다.  
근거: `public/js/workout/scoring-engine.js:63-126`

처리 방식은 다음과 같습니다.

1. 프로필에 정의된 메트릭 목록을 순회합니다.
2. 각 메트릭 key에 맞는 실제 값을 `getMetricValue()`로 꺼냅니다.
3. rule에 따라 메트릭 점수를 계산합니다.
4. breakdown에 메트릭별 결과를 담습니다.
5. 전체 점수를 0~100으로 환산합니다.

근거: `public/js/workout/scoring-engine.js:72-125`

### 8.1 메트릭 값 매핑

`getMetricValue()`는 `angles` 객체에서 메트릭별 값을 꺼내는 역할을 합니다.

예를 들어:

| metric key | 실제 사용하는 값 |
|---|---|
| `knee_angle` | 좌우 무릎 각도 조합 |
| `hip_angle` | 좌우 엉덩이 각도 조합 |
| `spine_angle` | `angles.spine` |
| `trunk_tibia_angle` | `angles.trunkTibiaAngle` 또는 `spine - tibia` |
| `knee_symmetry` | 좌우 무릎 각도 차이 |
| `knee_alignment` | 무릎 정렬 proxy |
| `heel_contact` | 뒤꿈치 접지 여부 |
| `hip_below_knee` | 엉덩이가 무릎보다 아래인지 여부 |
| `knee_valgus` | 무릎 안쪽 무너짐 정도 |

근거: `public/js/workout/scoring-engine.js:132-333`

### 8.2 실시간 점수와 최종 rep 점수의 차이

실시간 점수는 현재 프레임 기준입니다. 사용자가 내려가는 중이면 내려가는 중의 자세만 반영됩니다.

최종 rep 점수는 한 번의 스쿼트 전체에서 쌓인 데이터를 다시 분석합니다. 따라서 최종 점수가 더 중요합니다.

---

## 9. 스쿼트 실시간 피드백 필터링

프레임 단위 점수가 계산된 뒤, 스쿼트 모듈은 실시간 화면에 보여줄 breakdown을 현재 페이즈에 맞게 필터링합니다.

`session-controller.js`는 `getLiveFeedbackResult()`에서 운동 모듈의 `filterLiveFeedback()`을 호출합니다.  
근거: `public/js/workout/session-controller.js:2016-2037`

스쿼트 모듈은 `filterLiveFeedback()`에서 `prepareLiveScoreResult()`를 호출합니다.  
근거: `public/js/workout/exercises/squat-exercise.js:593-625`

필터링 이유는 다음과 같습니다.

- 깊이 평가는 내려가는 초반보다 최저점에서 보는 것이 적절합니다.
- 힙 힌지는 정면보다 측면에서 의미가 큽니다.
- 뒤꿈치 접지는 측면의 최저점/상승 구간에서 더 의미 있습니다.
- 좌우 대칭은 최저점과 상승 구간에서 더 의미 있습니다.

구체적인 필터 규칙은 `shouldKeepLiveMetric()`에 있습니다.  
근거: `public/js/workout/exercises/squat-exercise.js:1562-1604`

---

## 10. RepCounter의 스쿼트 횟수 판단 기준

스쿼트는 횟수 기반 운동입니다. `RepCounter`는 무릎 각도를 기준으로 다음 상태를 판단합니다.

```text
NEUTRAL → TRANSITION → ACTIVE → TRANSITION → NEUTRAL
```

근거: `public/js/workout/rep-counter.js:12-17`, `public/js/workout/rep-counter.js:234-310`

스쿼트의 기본 반복 패턴은 다음과 같습니다.

| 항목 | 값 | 의미 |
|---|---:|---|
| `primaryAngle` | `knee_angle` | 무릎 각도를 기준으로 상태를 판단합니다. |
| `neutral` | 160 | 서 있는 상태 기준입니다. |
| `active` | 100 | 충분히 앉은 상태 기준입니다. |
| `direction` | `decrease` | 무릎 각도가 감소하면 운동이 진행되는 것으로 봅니다. |
| `minDuration` | 800ms | 너무 빠른 움직임은 rep로 인정하지 않습니다. |
| `minActiveTime` | 200ms | ACTIVE 상태를 최소 200ms 유지해야 합니다. |

근거: `public/js/workout/exercises/squat-exercise.js:209-220`

### 10.1 상태 판단 규칙

`detectState()`는 주 각도와 threshold를 비교합니다.

스쿼트처럼 `direction`이 `decrease`인 운동에서는 다음 규칙을 사용합니다.

| 조건 | 상태 |
|---|---|
| 무릎 각도 >= `neutral - 10` | `NEUTRAL` |
| 무릎 각도 <= `active + 10` | `ACTIVE` |
| 그 사이 | `TRANSITION` |

근거: `public/js/workout/rep-counter.js:315-339`

스쿼트 기준으로 풀어쓰면 다음과 같습니다.

| 무릎 각도 | 상태 |
|---:|---|
| 150도 이상 | 서 있음, `NEUTRAL` |
| 110도 이하 | 앉은 상태, `ACTIVE` |
| 111~149도 | 전환 중, `TRANSITION` |

### 10.2 rep 시작 시점

이전 상태가 `NEUTRAL`이고 새 상태가 `NEUTRAL`이 아니면 rep가 시작됩니다.

이때 다음 값들이 초기화됩니다.

- `repStartTime`
- `hadActive`
- `activeStateEnterTime`
- `activeTimeMs`
- `currentRepScores`
- `currentRepAllScores`
- `currentMovementScores`
- 스쿼트 전용 rep tracking 정보

근거: `public/js/workout/rep-counter.js:264-274`

### 10.3 rep 완료 조건

`checkRepCompletion()`은 다음 조건을 모두 만족해야 true를 반환합니다.

1. rep가 시작되어 있어야 합니다.
2. 중간에 `ACTIVE` 상태를 거쳐야 합니다.
3. 다시 `NEUTRAL`로 돌아와야 합니다.
4. 전체 동작 시간이 `minDuration` 이상이어야 합니다.
5. ACTIVE 체류 시간이 `minActiveTime` 이상이어야 합니다.

근거: `public/js/workout/rep-counter.js:345-375`

스쿼트 기준으로는 다음과 같습니다.

```text
서 있음
→ 무릎이 굽혀지며 내려감
→ 충분히 앉아서 ACTIVE 진입
→ 다시 일어남
→ 최소 시간 조건 만족
→ 1회 완료
```

---

## 11. 스쿼트 전용 페이즈 추적

`RepCounter`는 공통 상태만 관리하지만, 스쿼트 모듈은 더 세밀한 페이즈를 기록합니다.

스쿼트 페이즈는 다음과 같습니다.

| 페이즈 | 의미 |
|---|---|
| `NEUTRAL` | 아직 동작 전이거나 안정적으로 서 있는 상태입니다. |
| `DESCENT` | 내려가는 구간입니다. |
| `BOTTOM` | 최저점에 도달한 구간입니다. |
| `ASCENT` | 다시 올라오는 구간입니다. |
| `LOCKOUT` | 무릎과 엉덩이를 펴고 마무리한 상태입니다. |

근거: `public/js/workout/exercises/squat-exercise.js:20-27`

`RepCounter`가 매 프레임 `updateRepTracking()`을 호출하면, 스쿼트 모듈은 내부에서 `detectPhase()`로 현재 페이즈를 판단합니다.  
근거: `public/js/workout/rep-counter.js:523-530`, `public/js/workout/exercises/squat-exercise.js:240-261`

### 11.1 하강 구간 판단

아직 최저점에 도달하지 않았고 무릎 각도가 줄어드는 흐름이면 `DESCENT`로 봅니다.

근거: `public/js/workout/exercises/squat-exercise.js:647-659`

### 11.2 최저점 판단

무릎 각도가 active 기준 근처까지 내려오고, 변화량이 안정적이면 `BOTTOM`으로 봅니다.

근거: `public/js/workout/exercises/squat-exercise.js:647-653`

### 11.3 상승 구간 판단

최저점에 도달한 뒤 무릎 각도가 증가하기 시작하면 `ASCENT`로 봅니다.

근거: `public/js/workout/exercises/squat-exercise.js:661-668`

### 11.4 마무리 판단

다시 선 자세에 가까워지고 `RepCounter` 상태도 `NEUTRAL`이면 `LOCKOUT`으로 봅니다.

근거: `public/js/workout/exercises/squat-exercise.js:637-644`, `public/js/workout/exercises/squat-exercise.js:670-671`

---

## 12. rep 중 누적되는 스냅샷 데이터

스쿼트 모듈은 매 프레임 현재 자세를 스냅샷으로 저장합니다.

`getSnapshot()`은 다음 값을 수집합니다.

- 무릎 각도
- 엉덩이 각도
- 상체 기울기
- 좌우 무릎 대칭
- 무릎 정렬
- 품질 점수
- 촬영 뷰
- 정강이 각도
- 상체-정강이 각도
- 뒤꿈치 접지
- 엉덩이-무릎 높이 관계
- 무릎 valgus
- 메트릭별 신뢰도

근거: `public/js/workout/exercises/squat-exercise.js:773-847`

그 후 `recordFrame()`과 `recordPhaseFrame()`이 전체 요약과 페이즈별 요약에 데이터를 누적합니다.  
근거: `public/js/workout/exercises/squat-exercise.js:854-897`

예를 들어 한 번의 스쿼트에서는 다음처럼 데이터가 쌓입니다.

```text
DESCENT:
- kneeAngle: 145, 135, 125
- spineAngle: 20, 23, 25

BOTTOM:
- kneeAngle: 98, 96, 97
- heelContact: 1, 1, 1
- hipBelowKnee: 1, 1, 1

ASCENT:
- kneeAngle: 115, 135, 155
- kneeValgus: 0.04, 0.05, 0.04
```

이렇게 페이즈별로 쌓는 이유는 최종 채점에서 “순간값”이 아니라 “동작 전체의 안정적인 통계”를 쓰기 위해서입니다.

---

## 13. robust 통계 요약

rep가 완료되면 `finalizeRepSummary()`가 호출됩니다.  
근거: `public/js/workout/exercises/squat-exercise.js:263-287`

각 페이즈 요약은 `finalizePhaseSummary()`에서 완성되고, 여기서 `buildRobustSummary()`가 호출됩니다.  
근거: `public/js/workout/exercises/squat-exercise.js:948-963`

`buildRobustSummary()`는 다음 값을 만듭니다.

| 값 | 의미 |
|---|---|
| `bottomKneeMedian` | 무릎 각도의 중앙값입니다. |
| `bottomKneeLow10Avg` | 가장 깊게 앉은 하위 10% 무릎 각도 평균입니다. |
| `bottomHipMedian` | 엉덩이 각도의 중앙값입니다. |
| `bottomHipLow10Avg` | 하위 10% 엉덩이 각도 평균입니다. |
| `hipBelowKnee` | 엉덩이가 무릎 아래였는지 여부입니다. |
| `hipNearKnee` | 엉덩이가 무릎 높이 근처였는지 여부입니다. |
| `trunkLeanP90` | 상체 기울기 상위 90퍼센타일입니다. |
| `trunkTibiaAbsP90` | 상체-정강이 각도 차이 상위 90퍼센타일입니다. |
| `valgusAvg` | 무릎 valgus 평균입니다. |
| `valgusP90` | 무릎 valgus 상위 90퍼센타일입니다. |
| `valgusBadRatio` | valgus가 나쁜 프레임 비율입니다. |
| `heelContactAvg` | 뒤꿈치 접지 평균입니다. |
| `heelContactBreakFrames` | 뒤꿈치가 연속으로 떨어진 최대 프레임 수입니다. |

근거: `public/js/workout/exercises/squat-exercise.js:965-998`

이 robust 통계 덕분에 한두 프레임의 흔들림이 최종 점수를 과도하게 좌우하지 않습니다.

---

## 14. 스쿼트 최종 채점 흐름

rep가 완료되면 `RepCounter.completeRep()`가 기본 repRecord를 만들고, `repEvaluator`를 호출합니다.  
근거: `public/js/workout/rep-counter.js:380-416`

이 프로젝트에서는 `repEvaluator`가 `scoringEngine.scoreRep(repRecord)`로 연결되어 있습니다.  
근거: `public/js/workout/session-controller.js:1058-1061`

`ScoringEngine.scoreRep()`는 운동 모듈의 `scoreRep()`로 위임합니다.  
근거: `public/js/workout/scoring-engine.js:688-698`

스쿼트 최종 채점은 `squatExercise.scoreRep()`에서 이루어집니다.  
근거: `public/js/workout/exercises/squat-exercise.js:289-591`

최종 채점 순서는 다음과 같습니다.

1. 촬영 뷰 확인
2. robust 통계에서 핵심 측정값 추출
3. 깊이 등급 분류
4. hard fail 검사
5. 뷰별 메트릭 플랜 구성
6. 메트릭별 normalized score 계산
7. 가중 평균 계산
8. confidence factor 적용
9. 깊이/락아웃/신뢰도에 따른 점수 cap 적용
10. soft fail과 feedback 결정
11. 최종 status 결정
12. repRecord에 최종 결과 반영

---

## 15. 촬영 뷰 검증 기준

스쿼트 최종 채점에서는 먼저 요청 뷰와 실제 dominant view를 확인합니다.

### 15.1 대각선 뷰

요청 뷰나 dominant view가 `DIAGONAL`이면 최종 채점 대신 카메라 보류 결과를 반환합니다.

피드백:

```text
정면 또는 측면에서 촬영해주세요.
```

근거: `public/js/workout/exercises/squat-exercise.js:299-309`

### 15.2 측면 요청인데 실제 측면이 아닌 경우

사용자가 `SIDE`를 요청했는데 dominant view가 `SIDE`가 아니면 보류합니다.

피드백:

```text
측면이 잘 보이도록 카메라 위치를 조정해주세요.
```

근거: `public/js/workout/exercises/squat-exercise.js:311-324`

---

## 16. 정면/측면 채점 메트릭과 가중치

스쿼트 모듈은 정면과 측면의 채점 기준을 다르게 둡니다.

### 16.1 정면 스쿼트 채점 기준

정면에서는 무릎이 안쪽으로 무너지는지와 좌우 균형이 중요합니다.

| 메트릭 | 가중치 | 의미 |
|---|---:|---|
| `knee_valgus` | 0.40 | 무릎이 안쪽으로 무너지는 정도입니다. |
| `depth` | 0.25 | 충분히 깊이 앉았는지 봅니다. |
| `knee_symmetry` | 0.20 | 좌우 무릎 각도 차이를 봅니다. |
| `trunk_stability` | 0.15 | 상체 기울기 안정성을 봅니다. |

근거: `public/js/workout/exercises/squat-exercise.js:37-45`

### 16.2 측면 스쿼트 채점 기준

측면에서는 깊이, 힙 힌지, 상체-정강이 관계, 뒤꿈치 접지가 중요합니다.

| 메트릭 | 가중치 | 의미 |
|---|---:|---|
| `depth` | 0.36 | 충분히 깊이 앉았는지 봅니다. |
| `trunk_tibia_angle` | 0.22 | 상체와 정강이 각도 차이를 봅니다. |
| `hip_angle` | 0.18 | 엉덩이를 뒤로 보내는 힙 힌지를 봅니다. |
| `trunk_stability` | 0.16 | 상체 기울기 안정성을 봅니다. |
| `heel_contact` | 0.08 | 뒤꿈치 접지를 봅니다. |

근거: `public/js/workout/exercises/squat-exercise.js:46-54`

---

## 17. 메트릭별 점수 커브

스쿼트 최종 채점은 여러 커브를 사용합니다.

커브는 “측정값이 이 정도면 몇 점”이라는 기준표입니다.

근거: `public/js/workout/exercises/squat-exercise.js:56-65`

### 17.1 깊이 점수: `kneeDepth`

| 무릎 각도 | 점수 |
|---:|---:|
| 90 | 100 |
| 100 | 85 |
| 115 | 50 |
| 130 | 15 |
| 150 | 0 |

근거: `public/js/workout/exercises/squat-exercise.js:57`

해석:

- 무릎 각도가 작을수록 더 깊게 앉은 것입니다.
- 90도에 가까우면 좋은 깊이입니다.
- 130도 이상이면 얕은 스쿼트로 크게 감점됩니다.

### 17.2 무릎 valgus 점수: `kneeValgus`

| valgus 값 | 점수 |
|---:|---:|
| 0.03 | 100 |
| 0.06 | 70 |
| 0.10 | 30 |
| 0.15 | 5 |
| 0.20 | 0 |

근거: `public/js/workout/exercises/squat-exercise.js:58`

해석:

- 값이 작을수록 무릎이 안정적입니다.
- 0.10 이상이면 무릎이 안쪽으로 많이 무너진 것으로 봅니다.

### 17.3 상체 안정성 점수: `trunkLean`

| 상체 기울기 | 점수 |
|---:|---:|
| 25 | 100 |
| 40 | 75 |
| 55 | 40 |
| 70 | 10 |
| 85 | 0 |

근거: `public/js/workout/exercises/squat-exercise.js:59`

해석:

- 상체 기울기가 작을수록 안정적입니다.
- 과도하게 숙이면 감점됩니다.

### 17.4 힙 힌지 점수: `hipDepth`

| 엉덩이 각도 | 점수 |
|---:|---:|
| 110 | 100 |
| 120 | 80 |
| 140 | 40 |
| 155 | 10 |
| 170 | 0 |

근거: `public/js/workout/exercises/squat-exercise.js:60`

해석:

- 측면에서 엉덩이 각도가 적절히 접히면 점수가 높습니다.
- 너무 서 있는 형태로 내려가지 않으면 낮은 점수가 됩니다.

### 17.5 좌우 대칭 점수: `symmetry`

| 좌우 무릎 각도 차이 | 점수 |
|---:|---:|
| 10 | 100 |
| 18 | 70 |
| 28 | 25 |
| 40 | 0 |

근거: `public/js/workout/exercises/squat-exercise.js:61`

해석:

- 좌우 무릎 각도 차이가 작을수록 좋습니다.

### 17.6 상체-정강이 평행도 점수: `angleDiff`

| 상체-정강이 각도 차이 | 점수 |
|---:|---:|
| 10 | 100 |
| 20 | 70 |
| 35 | 30 |
| 50 | 5 |
| 65 | 0 |

근거: `public/js/workout/exercises/squat-exercise.js:62`

해석:

- 측면에서 상체와 정강이 기울기의 차이가 너무 크면 감점됩니다.

### 17.7 무릎 정렬 점수: `alignment`

| 정렬 오차 | 점수 |
|---:|---:|
| 0.03 | 100 |
| 0.05 | 75 |
| 0.08 | 30 |
| 0.12 | 5 |
| 0.16 | 0 |

근거: `public/js/workout/exercises/squat-exercise.js:63`

### 17.8 뒤꿈치 접지 점수: `heelContact`

| 접지 평균 | 점수 |
|---:|---:|
| 0.85 | 100 |
| 0.70 | 75 |
| 0.55 | 45 |
| 0.40 | 15 |
| 0 | 0 |

근거: `public/js/workout/exercises/squat-exercise.js:64`

해석:

- 1에 가까울수록 뒤꿈치가 계속 붙어 있었다는 뜻입니다.

---

## 18. 깊이 판정 기준

스쿼트 깊이는 `classifyDepth()`와 `isDepthGood()`에서 판정합니다.

근거: `public/js/workout/exercises/squat-exercise.js:1294-1306`

### 18.1 좋은 깊이

다음 중 하나면 좋은 깊이입니다.

1. `bottomKnee <= 100`
2. `bottomKnee <= 110`이고 `hipBelowKnee === 1`

근거: `public/js/workout/exercises/squat-exercise.js:1301-1305`

### 18.2 부분 깊이

다음 중 하나면 부분 깊이입니다.

1. `bottomKnee <= 130`
2. `hipNearKnee === 1`

근거: `public/js/workout/exercises/squat-exercise.js:1294-1298`

### 18.3 깊이 실패

위 조건을 만족하지 못하면 `depth_fail`입니다.  
근거: `public/js/workout/exercises/squat-exercise.js:1298`

예시:

| 최저점 무릎 각도 | 추가 조건 | 판정 |
|---:|---|---|
| 96도 | 없음 | `depth_good` |
| 108도 | 엉덩이가 무릎 아래 | `depth_good` |
| 122도 | 없음 | `depth_partial` |
| 142도 | 없음 | `depth_fail` |

---

## 19. 깊이 부족 시 점수 상한

최종 점수는 `applyDepthCap()`을 통과합니다.

근거: `public/js/workout/exercises/squat-exercise.js:1284-1292`

규칙은 다음과 같습니다.

| 조건 | 점수 상한 |
|---|---:|
| 무릎 각도를 계산하지 못함 | 최대 60점 |
| 좋은 깊이 | 상한 없음 |
| `bottomKnee <= 130` | 85~55점 사이로 보간된 상한 적용 |
| 그 외 | 최대 55점 |

즉, 깊이가 부족한 스쿼트는 다른 항목이 좋아도 높은 점수를 받기 어렵습니다.

---

## 20. 락아웃 완료 기준

스쿼트는 내려갔다가 올라오는 것뿐 아니라 마지막에 다시 충분히 펴야 합니다.

락아웃 완료 여부는 `isLockoutComplete()`에서 판단합니다.  
근거: `public/js/workout/exercises/squat-exercise.js:1354-1366`

기본적으로는 다음을 확인합니다.

1. `LOCKOUT` 페이즈에 도달했는지
2. 기준 자세 baseline이 있으면 무릎과 엉덩이가 baseline에 충분히 가까운지
3. baseline이 없으면 무릎 각도가 150도 이상인지

근거: `public/js/workout/exercises/squat-exercise.js:1354-1366`

락아웃이 부족하면 `lockout_incomplete` hard fail이 추가되고 최종 점수는 최대 65점으로 제한됩니다.  
근거: `public/js/workout/exercises/squat-exercise.js:450-452`, `public/js/workout/exercises/squat-exercise.js:503-506`

---

## 21. hard fail 기준

최종 채점 중 다음 조건은 hard fail로 들어갑니다.

| hard fail | 조건 | 결과 |
|---|---|---|
| `depth_not_reached` | 깊이 판정이 `depth_fail` | 부분 rep 처리 가능 |
| `lockout_incomplete` | 끝까지 일어서지 못함 | 부분 rep 처리 가능, 점수 최대 65점 |
| `low_confidence` | 프레임 신뢰도가 낮음 | 점수 최대 60점 |

근거: `public/js/workout/exercises/squat-exercise.js:446-455`, `public/js/workout/exercises/squat-exercise.js:503-509`

최종 status는 `resolveRepStatus()`에서 정합니다.

- 깊이 부족 또는 락아웃 부족이면 `PARTIAL_REP`
- 신뢰도 LOW이고 최종 점수 60점 이하이면 `PARTIAL_REP`
- 그 외는 `VALID_REP`

근거: `public/js/workout/exercises/squat-exercise.js:1308-1316`

---

## 22. soft fail 기준

soft fail은 breakdown에서 각 메트릭 점수가 해당 항목 최대 점수의 70% 미만이면 추가됩니다.

근거: `public/js/workout/exercises/squat-exercise.js:513-515`

측면 스쿼트에서는 뒤꿈치가 3프레임 이상 연속으로 떨어지면 `heel_contact`가 soft fail에 추가됩니다.  
근거: `public/js/workout/exercises/squat-exercise.js:517-521`

soft fail은 rep를 완전히 무효로 만들기보다 피드백과 감점 사유로 사용됩니다.

---

## 23. 피드백 결정 기준

피드백은 `pickFeedback()`에서 결정됩니다.

근거: `public/js/workout/exercises/squat-exercise.js:1492-1548`

우선순위는 다음과 같습니다.

1. 신뢰도 낮음
2. 깊이 부족
3. 락아웃 부족
4. 측면에서 뒤꿈치 접지 실패
5. 측면 메트릭 중 낮은 항목
6. breakdown에서 가장 나쁜 메트릭의 feedback
7. 측면 보조 조건
8. 정면 무릎 valgus 조건
9. 기본 칭찬 문구

대표 피드백은 다음과 같습니다.

| 조건 | 피드백 |
|---|---|
| 신뢰도 낮음 | `카메라에 전신이 잘 보이도록 위치를 다시 맞춰주세요` |
| 깊이 부족 | `조금 더 깊이 앉아주세요` |
| 락아웃 부족 | `올라올 때 무릎과 엉덩이를 끝까지 펴주세요` |
| 뒤꿈치 접지 실패 | `뒤꿈치가 떨어지지 않도록 유지해주세요` |
| 상체 불안정 | `가슴을 들고 상체를 더 안정적으로 유지해주세요` |
| 무릎 valgus | `무릎이 안쪽으로 물어지지 않도록 바깥쪽 힘으로 밀어주세요` |
| 문제 없음 | `좋아요! 같은 흐름으로 반복해보세요` |

근거: `public/js/workout/exercises/squat-exercise.js:1504-1548`

---

## 24. 예시 시나리오: 정상 정면 스쿼트 1회

### 24.1 입력 상황

사용자는 정면 뷰를 선택하고 카메라 앞에 전신이 잘 보이게 섭니다.

예시 프레임 흐름:

| 단계 | 무릎 각도 | 엉덩이 각도 | 상체 기울기 | 상태 |
|---|---:|---:|---:|---|
| 시작 | 170 | 165 | 18 | 서 있음 |
| 하강 | 135 | 140 | 24 | 내려가는 중 |
| 최저점 | 96 | 108 | 31 | 충분히 앉음 |
| 상승 | 130 | 135 | 28 | 올라오는 중 |
| 마무리 | 166 | 158 | 20 | 다시 섬 |

### 24.2 처리 흐름

1. `PoseEngine`이 관절 각도를 계산합니다.
2. 품질 게이트가 통과됩니다.
3. `ScoringEngine.calculate()`가 실시간 점수를 계산합니다.
4. `RepCounter`가 `NEUTRAL → TRANSITION → ACTIVE → TRANSITION → NEUTRAL` 흐름을 확인합니다.
5. 스쿼트 모듈은 내부적으로 `DESCENT → BOTTOM → ASCENT → LOCKOUT`을 기록합니다.
6. `checkRepCompletion()`이 최소 시간과 ACTIVE 체류 조건을 확인합니다.
7. `completeRep()`가 repRecord를 만듭니다.
8. `squatExercise.scoreRep()`가 최종 점수를 계산합니다.
9. `handleRepComplete()`가 UI와 세션 기록을 업데이트합니다.

### 24.3 최종 채점 예시

예시 robust 측정값:

| 값 | 예시 |
|---|---:|
| `bottomKnee` | 96 |
| `bottomHip` | 108 |
| `maxSpine` | 31 |
| `kneeSymmetry` | 8 |
| `avgKneeValgus` | 0.045 |
| `lockoutKnee` | 166 |
| `lockoutHip` | 158 |
| `confidence.level` | HIGH |

정면 메트릭 점수 예시:

| 메트릭 | 값 | normalized score | 가중치 |
|---|---:|---:|---:|
| `knee_valgus` | 0.045 | 약 85 | 0.40 |
| `depth` | 96 | 약 94 | 0.25 |
| `knee_symmetry` | 8 | 100 | 0.20 |
| `trunk_stability` | 31 | 약 90 | 0.15 |

가중 평균 예시:

```text
0.40 * 85 = 34
0.25 * 94 = 23.5
0.20 * 100 = 20
0.15 * 90 = 13.5

baseScore = 91
confidence factor = 1
finalScore = 91
```

최종 결과:

```text
status = VALID_REP
score = 91
feedback = 좋아요! 같은 흐름으로 반복해보세요
```

---

## 25. 예시 시나리오: 얕은 스쿼트

### 25.1 입력 상황

사용자가 무릎을 충분히 굽히지 않고 140도 정도까지만 내려갔다가 다시 일어납니다.

예시:

```text
bottomKnee = 140
hipBelowKnee = 0
```

### 25.2 깊이 판정

`classifyDepth()` 기준으로 `bottomKnee`가 130도보다 크고, 엉덩이도 무릎 근처 또는 아래가 아니면 `depth_fail`입니다.

근거: `public/js/workout/exercises/squat-exercise.js:1294-1298`

### 25.3 최종 결과

`depth_fail`이면 `depth_not_reached` hard fail이 추가됩니다.  
근거: `public/js/workout/exercises/squat-exercise.js:446-449`

결과:

```text
hardFails = ["depth_not_reached"]
status = PARTIAL_REP
feedback = 조금 더 깊이 앉아주세요
```

status 결정 근거: `public/js/workout/exercises/squat-exercise.js:1308-1316`  
피드백 결정 근거: `public/js/workout/exercises/squat-exercise.js:1507-1509`

---

## 26. 예시 시나리오: 끝까지 일어서지 못한 스쿼트

### 26.1 입력 상황

사용자가 충분히 앉기는 했지만, 올라올 때 무릎과 엉덩이를 끝까지 펴지 못합니다.

예시:

```text
bottomKnee = 95
lockoutKnee = 138
summary.flags.lockoutReached = false
```

### 26.2 락아웃 판정

`isLockoutComplete()`는 `LOCKOUT` 페이즈에 도달하지 못하면 false를 반환합니다.  
근거: `public/js/workout/exercises/squat-exercise.js:1354-1356`

### 26.3 최종 결과

락아웃이 부족하면 `lockout_incomplete` hard fail이 추가됩니다.  
근거: `public/js/workout/exercises/squat-exercise.js:450-452`

결과:

```text
hardFails = ["lockout_incomplete"]
status = PARTIAL_REP
score <= 65
feedback = 올라올 때 무릎과 엉덩이를 끝까지 펴주세요
```

점수 상한 근거: `public/js/workout/exercises/squat-exercise.js:503-506`  
피드백 근거: `public/js/workout/exercises/squat-exercise.js:1510-1512`

---

## 27. rep 완료 후 UI와 기록 처리

rep가 완료되면 `completeRep()`가 다음 작업을 합니다.

1. `repCount` 증가
2. 기본 rep 점수 계산
3. rep summary 생성
4. `repEvaluator`로 최종 점수 보강
5. repRecord 저장
6. 상태 초기화
7. `onRepComplete()` 호출

근거: `public/js/workout/rep-counter.js:380-440`

그 후 `handleRepComplete()`가 다음 작업을 합니다.

1. 현재 rep 번호를 상태에 저장
2. 카운터 UI 업데이트
3. 마지막 rep metric summary 생성
4. `SessionBuffer`에 rep 기록 저장
5. `REP_COMPLETE` 이벤트 저장
6. 루틴 모드면 다음 단계 진행 확인
7. rep 피드백 표시

근거: `public/js/workout/session-controller.js:2118-2172`

---

## 28. 최종 정리

현재 스쿼트 로직은 다음 원칙으로 설계되어 있습니다.

### 28.1 단순 카운팅이 아니라 단계별 검증을 수행한다

스쿼트 1회는 단순히 무릎이 굽혀졌다 펴지는 것만으로 끝나지 않습니다.

- 충분히 내려갔는지
- 최저점이 있었는지
- 다시 올라왔는지
- 끝까지 일어섰는지
- 카메라와 관절 인식 품질이 충분한지
- 정면/측면 기준에 맞는 메트릭을 사용했는지

이 과정을 모두 거쳐 최종 결과가 만들어집니다.

### 28.2 실시간 피드백과 최종 채점은 다르다

실시간 피드백은 현재 프레임 기준입니다. 사용자가 운동 중 바로 고칠 수 있도록 도와줍니다.

최종 채점은 rep 전체 데이터를 바탕으로 합니다. 하강, 최저점, 상승, 락아웃 구간의 robust 통계를 사용하기 때문에 더 안정적입니다.

### 28.3 정면과 측면의 기준이 다르다

정면은 무릎 valgus, 좌우 대칭, 정렬이 중요합니다.

측면은 깊이, 힙 힌지, 상체-정강이 관계, 뒤꿈치 접지가 중요합니다.

### 28.4 깊이와 마무리는 강한 조건이다

깊이가 부족하면 점수 상한이 걸리고, 심하면 `PARTIAL_REP`가 됩니다.

끝까지 일어서지 못해도 `PARTIAL_REP`가 되고 점수가 제한됩니다.

### 28.5 카메라 품질이 낮으면 채점하지 않는다

몸이 화면 밖으로 벗어나거나 관절이 충분히 보이지 않으면 해당 프레임은 채점과 rep 진행에 반영하지 않습니다.

이렇게 해서 잘못된 인식으로 인한 오채점을 줄입니다.
