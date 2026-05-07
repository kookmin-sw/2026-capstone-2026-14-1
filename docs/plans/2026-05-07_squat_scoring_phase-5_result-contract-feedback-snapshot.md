# Phase 5: 결과 객체·피드백 우선순위·스냅샷

## 목적

스펙 §11·§12·§14·§17에 따라 **`scoreRep()` 전체 아키텍처를 조립**하고, **status / issues / primaryFeedback / rawMetrics / metricScores**를 rep 결과에 포함한다. 기존 `feedback`·`breakdown`·`hardFails`와 호환을 유지한다.

---

## `scoreRep()` 아키텍처 조립 (스펙 §17)

Phase 1~4에서 구현한 구성 요소를 다음 순서로 연결한다.

```js
function scoreRep(repSummary, view) {
  // Phase 3: 홀드 조기 반환 (DIAGONAL, viewConfidence, requiredMetric)
  const holdCheck = evaluateHoldConditions(repSummary, view);
  if (holdCheck) return holdCheck;

  // Phase 4: 개인 baseline 정규화
  const normalized = normalizeByBaseline(repSummary);

  // Phase 1: robust metric 추출 (p90, 중앙값, bad-frame ratio)
  const metrics = extractRobustMetrics(normalized, view);

  // Phase 2: 뷰별 metric 채점 (SQUAT_SCORING_CONFIG + CURVES)
  const metricScores = scoreMetrics(metrics, view);
  let finalScore = weightedAverage(metricScores, view);

  // Phase 2: 연속 caps 적용
  finalScore = applyDepthCap(finalScore, metrics.bottomKnee, metrics.hipBelowKnee);
  finalScore = applyLockoutCap(finalScore, metrics.lockout, normalized.baseline);
  finalScore = applyConfidenceCap(finalScore, repSummary.confidence);

  // Phase 5: status, issues, feedback, snapshot 조립
  const status = resolveStatus(finalScore, metrics, repSummary);
  const issues = collectIssues(metrics, metricScores);
  const primaryFeedback = selectFeedback(metricScores, metrics, issues);
  const rawMetrics = buildRawMetrics(metrics, normalized);

  return {
    status,
    score: status === 'VALID_REP' || status === 'PARTIAL_REP' ? Math.round(finalScore) : null,
    grade: scoreToGrade(finalScore),
    hardFails: metrics.hardFails,
    issues,
    primaryFeedback,
    metricScores,
    rawMetrics,
    // 기존 호환 필드
    feedback: primaryFeedback,
    breakdown: buildBreakdown(metricScores),
    softFails: issues
  };
}
```

---

## `status` 판정 기준 (스펙 §12)

| 조건 | status |
|---|---|
| 홀드 조기 반환 (DIAGONAL, low viewConf, low landmark conf) | `HOLD_CAMERA` / `HOLD_CONFIDENCE` / `HOLD_VISIBILITY` |
| `hardFails`에 `depth_not_reached` 또는 `lockout_incomplete` 포함 | `PARTIAL_REP` |
| `confidence.level === 'LOW'` + 점수 ≤ 60 | `PARTIAL_REP` |
| 위 조건 없이 `finalScore >= 0` | `VALID_REP` |

`INVALID_REP`는 이 스펙 범위에서 gate 이전에 rep 자체가 취소된 경우에만 사용한다 (rep-counter가 반환, scoreRep 미도달).

```js
function resolveStatus(finalScore, metrics, repSummary) {
  if (metrics.hardFails.includes('depth_not_reached') ||
      metrics.hardFails.includes('lockout_incomplete')) {
    return 'PARTIAL_REP';
  }
  if (repSummary.confidence?.level === 'LOW' && finalScore <= 60) {
    return 'PARTIAL_REP';
  }
  return 'VALID_REP';
}
```

---

## 피드백 우선순위 (스펙 §11)

```js
const FEEDBACK_PRIORITY = {
  low_confidence:     100,
  body_not_visible:   100,
  depth_not_reached:   90,
  lockout_incomplete:  85,
  knee_valgus:         80,
  heel_contact:        70,
  trunk_tibia_angle:   60,
  knee_symmetry:       50,
  hip_angle:           40,
  trunk_stability:     30
};
```

1. 카메라·신뢰도  
2. rep 미완료 (깊이·lockout)  
3. valgus  
4. 뒤꿈치  
5. trunk-tibia 불균형  
6. 대칭  
7. hip  
8. trunk stability  

깊이가 약해도 무릎 무너짐이 더 크면 valgus 피드백이 우선한다.

---

## `rawMetrics` 스냅샷 (스펙 §14)

Phase 1의 `robust` 필드를 포함한 전체 snapshot이다.

```js
rawMetrics: {
  bottomKnee, bottomHip,
  trunkLeanP90, trunkTibiaAbsP90, signedTrunkTibiaP90,
  heelContactAvg, heelContactBreakFrames,
  valgusAvg, valgusP90, valgusBadRatio,
  lockoutKnee, lockoutHip,
  standingKneeBaseline, standingHipBaseline,
  confidence: repSummary.confidence?.level
}
```

## `metricScores`

breakdown 정규화 점수를 `key → 점수(0~100)` 객체로 채운다.

```js
metricScores: { depth: 94, hip_angle: 96, trunk_tibia_angle: 88, heel_contact: 95, ... }
```

---

## 완료 기준

- `scoreRep()` 함수가 §17 구조로 리팩터링되어 Phase 1~4 결과를 순서대로 조립한다.
- `status`가 `VALID_REP` / `PARTIAL_REP` / `HOLD_*` 중 하나로 항상 반환된다.
- `rawMetrics`에 Phase 1 `robust` 필드가 모두 포함된다.
- 세션 UI가 깨지지 않으며, 테스트가 스냅샷 필수 필드를 검증한다.
