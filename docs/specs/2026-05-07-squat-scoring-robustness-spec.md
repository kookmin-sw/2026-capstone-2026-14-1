# 스쿼트 채점 안정화 및 Robust Scoring 고정 스펙

**작성일:** 2026-05-07  
**상태:** Spec Locked  
**대상:** 스쿼트 rep scoring / quality gate / feedback priority  
**관련 문서:**  
- [스쿼트 폼 규칙 정렬 패치 스펙](./2026-04-22-squat-form-rule-alignment-spec.md)  
- [런타임 중심 운동 평가 신뢰도 개선 통합 실행 스펙 v3](./2026-04-21-runtime-evaluation-spec-v3.md)  
- [Live score vs Rep score UX Spec](./2026-04-22-live-score-vs-rep-score-ux-spec.md)

---

## 1. 목적

현재 스쿼트 채점은 view-aware metric plan과 phase summary를 사용한다는 방향은 맞지만, 단일 hard threshold와 `max`/`avg` 대표값에 의존하는 구간이 있어 pose estimation 오차에 취약하다.

이 스펙은 스쿼트 채점 기준을 다음 원칙으로 고정한다.

1. 단일 경계값 hard fail을 줄이고 연속 cap을 사용한다.
2. phase별 robust metric을 사용한다.
3. 정면/측면별 신뢰 metric을 더 명확히 분리한다.
4. landmark/view confidence가 낮으면 무리하게 점수화하지 않는다.
5. 점수, rep 상태, feedback, raw metric snapshot을 분리해 디버깅 가능하게 만든다.

핵심 구조는 다음 순서로 고정한다.

```text
Quality Gate -> Robust Metric Extraction -> Metric Score -> Weighted Average -> Caps -> Feedback Priority
```

---

## 2. 현재 문제 요약

### 2.1 깊이 hard fail이 단일 경계값에 의존

현재는 `bottomKnee <= 130`이면 깊이 hard fail을 피하고, `131`이면 갑자기 55점 cap이 걸릴 수 있다. 이 구조는 다음 문제가 있다.

- 1도 차이로 최종 점수가 크게 튄다.
- 단일 카메라 pose estimation 오차에 취약하다.
- `130` 이내에만 들어오면 얕은 스쿼트도 다른 항목 점수로 70점대까지 올라갈 수 있다.

### 2.2 `spine_angle` 의미가 불명확

현재 `spine_angle`이 상체가 수직에서 얼마나 기울었는지를 보는 값이라면, 이를 허리 말림이나 neutral spine 위반으로 강하게 감점하면 안 된다.

스쿼트에서는 trunk position, tibia position, stance width, foot rotation, depth 등이 함께 동작을 결정한다. 따라서 상체 기울기 자체를 무조건 잘못된 자세로 처리하지 않는다.

### 2.3 대표값 추출 방식이 튐과 누락에 취약

- `max`는 한 프레임 튐에도 점수를 크게 떨어뜨린다.
- `avg`는 순간적으로 크게 무너지는 동작을 놓칠 수 있다.
- `min bottomKnee`는 한 프레임만 깊게 찍혀도 깊이를 과대평가할 수 있다.

### 2.4 view별 가중치가 일부 metric을 과신

- FRONT에서 `knee_symmetry` 30%는 카메라가 약간 돌아가 있거나 한쪽 landmark가 흔들려도 크게 흔들릴 수 있다.
- SIDE에서 `hip_angle`과 `spine_angle`은 체형, 스쿼트 스타일, 카메라 각도에 민감하다.
- SIDE에서 frontal knee valgus 계열 metric은 낮은 가중치 또는 제외가 필요하다.

### 2.5 lockout 기준이 고정 각도에 의존

`lockoutKnee >= 150` 같은 고정 기준은 사람마다 다른 기본 선 자세, 카메라 각도, 추정 오차를 반영하지 못한다.

### 2.6 DIAGONAL view와 낮은 confidence 처리 기준이 부족

정면/측면 사이의 애매한 각도에서는 정면 metric과 측면 metric이 모두 불안정하다. 캡스톤 데모 관점에서는 틀린 점수를 내는 것보다 채점 보류와 카메라 안내가 더 좋은 UX다.

---

## 3. 최우선 변경: 깊이 hard fail을 연속 cap으로 변경

### 3.1 원칙

`depth_not_reached`는 더 이상 `130도 통과/실패` 단일 hard threshold로 처리하지 않는다. `bottomKnee` 구간에 따라 최종 점수 상한을 연속적으로 낮춘다.

### 3.2 고정 규칙

```js
function isDepthGood(bottomKnee, hipBelowKnee) {
  return bottomKnee <= 100 || (bottomKnee <= 110 && hipBelowKnee === 1);
}

function applyDepthCap(score, bottomKnee, hipBelowKnee) {
  if (!Number.isFinite(bottomKnee)) return Math.min(score, 60);
  if (isDepthGood(bottomKnee, hipBelowKnee)) return score;

  if (bottomKnee <= 130) {
    return Math.min(score, interpolate(bottomKnee, 100, 130, 85, 55));
  }

  return Math.min(score, 55);
}
```

### 3.3 cap 구간

| 조건 | 최종 점수 cap |
|---|---:|
| `bottomKnee <= 100` | cap 없음 |
| `bottomKnee <= 110 && hipBelowKnee === 1` | cap 없음 |
| `100 < bottomKnee <= 130` | `85 -> 55` 선형 감소 |
| `bottomKnee > 130` | `55` |
| `bottomKnee` 미측정 | `60` |

### 3.4 `hipBelowKnee` 사용 제한

`hipBelowKnee`는 좋은 보조 지표지만, `bottomKnee`가 너무 큰 경우까지 충분한 깊이로 통과시키는 OR 조건으로 사용하지 않는다.

```js
const depthGood = bottomKnee <= 100 || (bottomKnee <= 110 && hipBelowKnee === 1);
const depthPartial = bottomKnee <= 130 || hipNearKnee === 1;
const depthFail = !depthPartial;
```

---

## 4. `spine_angle`을 상체 기울기와 허리 말림으로 분리

### 4.1 이번 구현 결정

현재 `spine_angle`은 허리 말림이 아니라 상체 전체 기울기 proxy로 취급한다. 따라서 이름과 피드백을 다음처럼 정리한다.

- 내부 채점 key: `trunk_stability` 또는 `trunk_lean`
- 기존 호환 key: `spine_angle`
- 금지 표현: `허리 말림을 직접 측정`, `요추 중립 직접 판정`

### 4.2 trunk lean 점수 커브

기존 `<=15° 100`, `15~30° 100→70`, `30~45° 70→35`, `45~60° 35→5` 기준은 너무 엄격하므로 다음으로 완화한다.

| `trunk_lean` | normalized score |
|---:|---:|
| `<= 25°` | `100` |
| `25° ~ 40°` | `100 -> 75` |
| `40° ~ 55°` | `75 -> 40` |
| `55° ~ 70°` | `40 -> 10` |
| `> 70°` | `0` |

### 4.3 추후 분리 후보

진짜 허리 말림 proxy를 보려면 상체 전체 기울기와 별도 metric으로 분리한다.

```js
const trunkLean = angleBetweenVertical(shoulderMid, hipMid);
const spinalFlexionProxy = angleBetween(shoulderMid, hipMid, kneeMid);
```

이번 스펙에서는 `trunkLean`만 활성 채점 대상으로 둔다. `spinalFlexionProxy`는 후속 과제다.

---

## 5. robust metric extraction

### 5.1 대표값 변경

| 항목 | 현재 방식 | 변경 방식 |
|---|---|---|
| `trunk_lean` | `max` | `p90` 또는 3프레임 이상 지속된 max |
| `trunk_tibia_angle` | `max` | `p90` |
| `knee_valgus` | `avg` | `avg + p90 + bad-frame ratio` |
| `heel_contact` | `avg` | `avg + 연속 이탈 프레임` |
| `depth` | `min bottomKnee` | bottom phase 중앙값 또는 하위 10% 평균 |

### 5.2 percentile helper

```js
function percentile(values, p) {
  const arr = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!arr.length) return null;
  const idx = Math.floor((arr.length - 1) * p);
  return arr[idx];
}
```

### 5.3 valgus bad-frame ratio

무릎 안쪽 무너짐은 평균값만 보지 않는다. 나쁜 프레임이 전체의 몇 %였는지를 함께 본다.

```js
const valgusP90 = percentile(kneeValgusSamples, 0.9);
const valgusBadRatio = kneeValgusSamples.filter((value) => value > 0.10).length / kneeValgusSamples.length;
```

### 5.4 depth 대표값

깊이는 단일 프레임 `min`보다 bottom phase의 안정적인 대표값을 우선한다.

우선순위는 다음이다.

1. bottom phase 중앙값
2. bottom phase 하위 10% 평균
3. bottom phase가 부족할 때만 기존 `min bottomKnee` fallback

---

## 6. view별 metric weight 고정

### 6.1 FRONT

정면은 `knee_valgus`를 핵심 metric으로 올리고, `knee_symmetry`는 landmark 흔들림에 민감하므로 낮춘다.

```js
FRONT: [
  { key: 'knee_valgus', weight: 0.40 },
  { key: 'depth', weight: 0.25 },
  { key: 'knee_symmetry', weight: 0.20 },
  { key: 'trunk_stability', weight: 0.15 }
]
```

정면에서 depth 신뢰도가 낮다고 판단되는 경우의 대체안은 다음이다.

```js
FRONT: [
  { key: 'knee_valgus', weight: 0.45 },
  { key: 'knee_symmetry', weight: 0.20 },
  { key: 'depth', weight: 0.20 },
  { key: 'trunk_stability', weight: 0.15 }
]
```

### 6.2 SIDE

측면은 depth, trunk-tibia relationship, hip hinge 중심으로 둔다.

```js
SIDE: [
  { key: 'depth', weight: 0.35 },
  { key: 'trunk_tibia_angle', weight: 0.20 },
  { key: 'hip_angle', weight: 0.17 },
  { key: 'trunk_stability', weight: 0.15 },
  { key: 'heel_contact', weight: 0.08 },
  { key: 'knee_alignment', weight: 0.05 }
]
```

측면에서 `knee_alignment` confidence가 낮거나 frontal-plane 정렬 판단이 불가능하면 제외하고 재정규화한다.

대체안은 다음이다.

```js
SIDE: [
  { key: 'depth', weight: 0.35 },
  { key: 'trunk_tibia_angle', weight: 0.22 },
  { key: 'hip_angle', weight: 0.18 },
  { key: 'trunk_stability', weight: 0.17 },
  { key: 'heel_contact', weight: 0.08 }
]
```

---

## 7. lockout 기준을 개인 baseline 기준으로 변경

### 7.1 원칙

lockout은 고정 `150°`만 보지 않는다. 운동 시작 전 `NEUTRAL` 또는 `READY` 상태에서 0.5~1초 동안 baseline을 수집하고, baseline 대비 회복 여부를 본다.

```js
const standingKneeBaseline = median(neutralFrames.map((frame) => frame.kneeAngle));
const standingHipBaseline = median(neutralFrames.map((frame) => frame.hipAngle));

const kneeLockoutOk = lockoutKnee >= standingKneeBaseline - 15;
const hipLockoutOk = lockoutHip >= standingHipBaseline - 20;

if (!kneeLockoutOk || !hipLockoutOk) {
  hardFails.push('lockout_incomplete');
}
```

### 7.2 fallback

baseline이 충분하지 않으면 기존 고정 기준을 fallback으로 사용한다.

- `lockoutKnee >= 150`
- 가능하면 `lockoutHip`도 함께 확인

lockout 실패 시 최종 점수 cap은 `65`를 유지한다.

---

## 8. DIAGONAL view 처리

캡스톤 데모 기준으로 `DIAGONAL`은 채점하지 않고 보류한다.

```js
if (view === 'DIAGONAL') {
  return {
    score: null,
    status: 'HOLD_CAMERA',
    reason: 'camera_angle_diagonal',
    feedback: '정면 또는 측면에서 촬영해주세요.'
  };
}
```

DIAGONAL 전용 plan은 후속 과제로 둔다. 데모에서는 틀린 점수를 내는 것보다 camera guidance가 우선이다.

---

## 9. metric confidence와 view confidence

### 9.1 metric confidence

metric별 landmark confidence가 낮으면 해당 metric을 제외하고 weight를 재정규화한다.

```js
const validMetrics = plan.filter((metric) => metric.confidence >= 0.6);
const weightSum = validMetrics.reduce((sum, metric) => sum + metric.weight, 0);

const score = validMetrics.reduce((sum, metric) => {
  return sum + metric.score * (metric.weight / weightSum);
}, 0);
```

단, view별 필수 metric이 낮으면 재정규화하지 않고 채점 보류한다.

```js
const requiredByView = {
  FRONT: ['knee_valgus', 'knee_symmetry'],
  SIDE: ['depth', 'hip_angle', 'trunk_tibia_angle']
};
```

```js
return {
  score: null,
  status: 'HOLD_CONFIDENCE',
  reason: 'required_landmark_low_confidence',
  feedback: '카메라에 전신이 잘 보이도록 위치를 다시 맞춰주세요.'
};
```

### 9.2 view confidence

정면/측면 판정이 애매하면 채점하지 않는다.

```js
if (viewConfidence < 0.7) {
  return {
    score: null,
    status: 'HOLD_CAMERA',
    reason: 'view_confidence_low',
    feedback: '정면 또는 측면으로 카메라를 맞춰주세요.'
  };
}
```

### 9.3 view 판정 기준

정면 판정은 다음 신호를 우선한다.

- shoulderWidth 충분함
- hipWidth 충분함
- left/right visibility 균형
- 몸통 중심선이 화면 중앙 근처

측면 판정은 다음 신호를 우선한다.

- 좌우 어깨/골반 x좌표 차이가 작음
- 한쪽 팔다리 visibility가 우세
- 무릎-발목-엉덩이 라인이 sagittal plane처럼 보임

---

## 10. signed trunk-tibia 저장

채점은 절대값을 사용하되, 피드백에는 방향성이 필요하므로 signed 값도 저장한다.

```js
const signedTrunkTibia = trunkAngle - tibiaAngle;
const absTrunkTibia = Math.abs(signedTrunkTibia);
```

피드백 방향은 다음과 같다.

```js
if (signedTrunkTibia > 20) {
  feedback = '상체가 정강이에 비해 많이 숙여졌습니다.';
} else if (signedTrunkTibia < -20) {
  feedback = '무릎이 앞으로 많이 나가고 상체가 너무 세워져 있습니다.';
}
```

단, 무릎이 앞으로 나가는 것 자체를 무조건 나쁜 자세로 처리하지 않는다. 이 피드백은 “기본 스쿼트 기준에서 벗어남”으로 표현한다.

---

## 11. feedback priority

피드백은 점수가 가장 낮은 metric이 아니라 위험도와 UX 우선순위로 선택한다.

```js
const FEEDBACK_PRIORITY = {
  low_confidence: 100,
  body_not_visible: 100,
  depth_not_reached: 90,
  lockout_incomplete: 85,
  knee_valgus: 80,
  heel_contact: 70,
  trunk_tibia_angle: 60,
  knee_symmetry: 50,
  hip_angle: 40,
  trunk_stability: 30
};
```

우선순위는 다음이다.

1. 카메라/신뢰도 문제
2. rep 미완료: `depth_not_reached`, `lockout_incomplete`
3. 무릎 안쪽 무너짐
4. 뒤꿈치 들림
5. 과도한 상체/정강이 불균형
6. 좌우 비대칭
7. 힙힌지 부족

예를 들어 깊이가 조금 얕고 무릎이 크게 안쪽으로 무너졌다면, `더 깊이 앉으세요`보다 `무릎이 안쪽으로 모이지 않게 하세요`를 먼저 보여준다.

---

## 12. 점수와 rep 상태 분리

최종 결과는 점수 하나로 모든 판정을 대신하지 않는다.

```js
{
  score: 72,
  grade: 'C',
  status: 'VALID_REP',
  issues: ['depth_partial', 'knee_valgus_mild'],
  primaryFeedback: '무릎이 안쪽으로 모이지 않게 발끝 방향으로 밀어주세요.'
}
```

상태 값은 다음으로 고정한다.

- `VALID_REP`
- `PARTIAL_REP`
- `INVALID_REP`
- `HOLD_CAMERA`
- `HOLD_CONFIDENCE`
- `HOLD_VISIBILITY`

이렇게 분리하면 “55점인데 rep 인정인가?”, “점수는 낮지만 카운트는 되는가?” 같은 UX 문제를 줄일 수 있다.

---

## 13. scoring config 분리

view별 plan과 curve는 함수 내부 분기보다 상수 객체로 분리한다.

```js
const SQUAT_SCORING_CONFIG = {
  FRONT: {
    metrics: [
      { key: 'knee_valgus', weight: 0.40, scorer: 'ratioLowerIsBetter' },
      { key: 'depth', weight: 0.25, scorer: 'kneeDepth' },
      { key: 'knee_symmetry', weight: 0.20, scorer: 'angleDiffLowerIsBetter' },
      { key: 'trunk_stability', weight: 0.15, scorer: 'trunkLean' }
    ]
  },
  SIDE: {
    metrics: [
      { key: 'depth', weight: 0.35, scorer: 'kneeDepth' },
      { key: 'trunk_tibia_angle', weight: 0.20, scorer: 'angleDiffLowerIsBetter' },
      { key: 'hip_angle', weight: 0.17, scorer: 'hipDepth' },
      { key: 'trunk_stability', weight: 0.15, scorer: 'trunkLean' },
      { key: 'heel_contact', weight: 0.08, scorer: 'ratioHigherIsBetter' },
      { key: 'knee_alignment', weight: 0.05, scorer: 'ratioLowerIsBetter' }
    ]
  }
};
```

```js
const CURVES = {
  kneeDepth: [
    [90, 100],
    [100, 85],
    [115, 50],
    [130, 15],
    [150, 0]
  ],
  kneeValgus: [
    [0.03, 100],
    [0.06, 70],
    [0.10, 30],
    [0.15, 5],
    [0.20, 0]
  ],
  trunkLean: [
    [25, 100],
    [40, 75],
    [55, 40],
    [70, 10],
    [85, 0]
  ]
};
```

---

## 14. raw metric snapshot 저장

각 rep마다 최종 점수뿐 아니라 원본 metric과 metric별 점수를 저장한다.

```js
{
  repId: 12,
  view: 'SIDE',
  score: 78,
  grade: 'B',
  status: 'VALID_REP',
  hardFails: [],
  issues: [],
  rawMetrics: {
    bottomKnee: 96,
    bottomHip: 112,
    trunkLeanP90: 24,
    trunkTibiaP90: 14,
    signedTrunkTibiaP90: 8,
    heelContactAvg: 0.88,
    heelContactBreakFrames: 0,
    valgusAvg: 0.02,
    valgusP90: 0.04,
    valgusBadRatio: 0.00,
    lockoutKnee: 161,
    lockoutHip: 165,
    standingKneeBaseline: 170,
    standingHipBaseline: 172,
    confidence: 'HIGH'
  },
  metricScores: {
    depth: 94,
    hip_angle: 96,
    trunk_tibia_angle: 88,
    heel_contact: 95
  },
  primaryFeedback: null
}
```

이 snapshot은 “왜 얕은 스쿼트가 75점이 나왔는지” 같은 문제를 나중에 재현하고 설명하기 위한 필수 데이터다.

---

## 15. 검증 시나리오

최소 검증 세트는 다음으로 고정한다.

| ID | 케이스 | 기대 결과 |
|---|---|---|
| `SQ-01` | 정상 스쿼트, 정면 | 80점 이상, 주요 경고 없음 |
| `SQ-02` | 정상 스쿼트, 측면 | 80점 이상, 주요 경고 없음 |
| `SQ-03` | 얕은 스쿼트 | depth 낮음, 65점 이하 또는 `PARTIAL_REP` |
| `SQ-04` | 무릎 안쪽 무너짐 | `knee_valgus` 경고 우선 |
| `SQ-05` | lockout 미완료 | `PARTIAL_REP` 또는 65점 cap |
| `SQ-06` | 뒤꿈치 들림 | `heel_contact` 경고 |
| `SQ-07` | 상체 과도하게 숙임 | `trunk_tibia_angle` 또는 `trunk_lean` 경고 |
| `SQ-08` | 카메라 대각선 | `HOLD_CAMERA` |
| `SQ-09` | 하체 잘림 | `HOLD_VISIBILITY` |
| `SQ-10` | 낮은 조명 | `HOLD_CONFIDENCE` 또는 low-confidence cap |

검증 문서에는 각 시나리오의 실제 `score`, `status`, `primaryFeedback`, `hardFails`, `rawMetrics`를 기록한다.

---

## 16. 필수 단위 테스트

synthetic summary 기반 단위 테스트를 추가한다.

1. 정상 스쿼트는 80점 이상
2. `bottomKnee = 125`는 depth cap 적용
3. `bottomKnee = 131`은 55점 이하
4. lockout이 낮으면 65점 이하 또는 `PARTIAL_REP`
5. LOW confidence면 60점 이하 또는 `HOLD_CONFIDENCE`
6. FRONT에서 `knee_valgus`가 높으면 `knee_valgus` feedback 우선
7. SIDE에서 `heel_contact`가 낮으면 heel feedback 발생
8. 필수 landmark confidence가 낮으면 `HOLD_CONFIDENCE`
9. DIAGONAL이면 `HOLD_CAMERA`

예시 테스트 의도는 다음과 같다.

```js
test('얕은 스쿼트는 다른 metric이 좋아도 65점 이하', () => {
  const summary = {
    bottomKnee: 125,
    bottomHip: 100,
    trunkLeanP90: 10,
    trunkTibiaP90: 5,
    heelContactAvg: 1,
    lockoutKnee: 170,
    lockoutHip: 170,
    hipBelowKnee: 0,
    confidence: 'HIGH'
  };

  const result = scoreRep(summary, 'SIDE');
  expect(result.score).toBeLessThanOrEqual(65);
});
```

---

## 17. 최종 권장 `scoreRep()` 구조

```js
function scoreRep(repSummary, view) {
  const quality = evaluateQualityGate(repSummary, view);
  if (!quality.ok) return holdResult(quality.reason);

  const normalized = normalizeByBaseline(repSummary);
  const metrics = extractRobustMetrics(normalized, view);
  const metricScores = scoreMetrics(metrics, view);
  let finalScore = weightedAverage(metricScores, view);

  finalScore = applyDepthCap(finalScore, metrics.bottomKnee, metrics.hipBelowKnee);
  finalScore = applyLockoutCap(finalScore, metrics.lockout, normalized.baseline);
  finalScore = applyConfidenceCap(finalScore, repSummary.confidence);

  const feedback = selectFeedback(metricScores, metrics, quality);

  return {
    status: 'VALID_REP',
    score: Math.round(finalScore),
    metricScores,
    rawMetrics: metrics,
    feedback
  };
}
```

---

## 18. 구현 우선순위

### 18.1 가장 먼저 할 것

1. `depth_not_reached` hard fail을 연속 cap으로 변경
2. `spine_angle` 의미 재정의: 상체 기울기인지 허리 말림인지 분리
3. `max`/`avg` 대신 `p90`, bad-frame ratio, bottom phase median 사용
4. FRONT 가중치 조정: `knee_valgus` 증가, `knee_symmetry` 감소
5. SIDE 가중치 조정: `depth` 증가, `hip_angle`/`trunk_stability` 민감도 완화
6. lockout을 고정 150도가 아니라 개인 baseline 기준으로 변경

### 18.2 그다음 할 것

1. DIAGONAL view는 채점 보류 또는 별도 plan으로 분리
2. landmark confidence 기반 metric 제외/재정규화
3. view confidence 낮으면 채점 보류
4. signed `trunk_tibia_angle` 저장해서 피드백 방향 구분
5. 점수와 rep 상태 분리
6. scoring config를 상수 객체로 분리
7. raw metric snapshot 저장
8. 검증 문서에 실제 결과 기록
9. synthetic summary 기반 단위 테스트 추가

---

## 19. 수용 기준

다음 조건을 만족하면 이 스펙 구현이 완료된 것으로 본다.

1. `bottomKnee` 130/131 경계에서 점수가 급락하지 않는다.
2. 얕은 스쿼트가 다른 metric 고득점만으로 70점대 이상을 받지 않는다.
3. `spine_angle` 피드백이 허리 말림 직접 판정처럼 표현되지 않는다.
4. FRONT는 `knee_valgus` 중심, SIDE는 `depth/trunk_tibia/hip` 중심으로 채점된다.
5. LOW confidence 또는 DIAGONAL view에서는 무리하게 점수화하지 않는다.
6. lockout은 가능하면 개인 baseline 기준으로 판정한다.
7. 결과에 `status`, `issues`, `primaryFeedback`, `rawMetrics`, `metricScores`가 남는다.
8. 필수 synthetic summary 테스트가 모두 통과한다.

---

## 20. 핵심 결론

현재 rule base의 방향은 유지한다. 다만 hard threshold 중심 구조를 줄이고, phase별 robust metric, 연속 cap, confidence gate를 결합하는 구조로 바꾼다.

가장 중요한 변경은 다음 한 줄로 요약된다.

```text
단일 경계값 대신 robust representative metric + continuous cap + confidence hold를 사용한다.
```
