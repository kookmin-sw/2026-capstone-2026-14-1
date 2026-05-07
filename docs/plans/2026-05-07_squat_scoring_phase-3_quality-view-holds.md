# Phase 3: 품질 게이트·뷰 홀드

## 목적

낮은 뷰 신뢰도·대각 추정·필수 landmark confidence 부족 시 **무리한 점수화를 막고** 홀드 상태를 일관되게 만든다.

## 주요 변경 파일

### `public/js/workout/scoring-engine.js` (게이트 레벨)

- `QUALITY_GATE_THRESHOLDS.estimatedViewConfidence`를 **0.7**로 상향 (스펙 §9.2)
- `inputs.estimatedView === 'DIAGONAL'`이면 `withhold` + `view_mismatch` (기존 게이트 이유 코드 유지)

### `public/js/workout/exercises/squat-exercise.js` (scoreRep 레벨)

**DIAGONAL 조기 반환** (스펙 §8):

```js
if (view === 'DIAGONAL' || dominantView === 'DIAGONAL') {
  return { score: null, status: 'HOLD_CAMERA', reason: 'camera_angle_diagonal',
           primaryFeedback: '정면 또는 측면에서 촬영해주세요.' };
}
```

**view confidence 낮을 때 조기 반환** (스펙 §9.2):

```js
if (viewConfidence < 0.7) {
  return { score: null, status: 'HOLD_CAMERA', reason: 'view_confidence_low',
           primaryFeedback: '정면 또는 측면으로 카메라를 맞춰주세요.' };
}
```

**필수 metric confidence 부족 시 조기 반환** (스펙 §9.1):

```js
const REQUIRED_BY_VIEW = {
  FRONT: ['knee_valgus', 'knee_symmetry'],
  SIDE:  ['depth', 'hip_angle', 'trunk_tibia_angle']
};
```

view별 필수 metric 중 하나라도 Phase 1의 `robustConfidence[metricKey] < 0.6`이면 재정규화하지 않고 채점 보류한다.

```js
// 필수 metric이 낮으면 HOLD_CONFIDENCE 반환
return { score: null, status: 'HOLD_CONFIDENCE', reason: 'required_landmark_low_confidence',
         primaryFeedback: '카메라에 전신이 잘 보이도록 위치를 다시 맞춰주세요.' };
```

필수 metric이 아닌 일반 metric의 confidence가 낮으면 해당 metric을 제외하고 가중치를 재정규화한다.

## HOLD와 cap 기준 분리

계산 불가와 낮은 신뢰도를 같은 경로로 처리하지 않는다.

| 상황 | 처리 |
|---|---|
| `view === 'DIAGONAL'` 또는 `viewConfidence < 0.7` | `HOLD_CAMERA`, `score: null` |
| 필수 landmark/metric confidence 부족으로 핵심 metric 계산 불가 | `HOLD_CONFIDENCE`, `score: null` |
| 전신 또는 하체 visibility 부족 | `HOLD_VISIBILITY`, `score: null` |
| metric 계산은 가능하지만 전체 confidence가 LOW | 점수 계산 후 `applyConfidenceCap(..., 60)`, status는 Phase 5에서 결정 |

즉, **계산 불가면 HOLD**, **계산 가능하지만 불안정하면 cap**이다.

**하체 잘림 (HOLD_VISIBILITY)** (스펙 §9.1):

repSummary에서 하체 keypoint visibility가 결정적으로 낮거나 필수 하체 metric이 visibility 부족으로 계산 불가한 경우:

```js
return { score: null, status: 'HOLD_VISIBILITY', reason: 'body_not_visible',
         primaryFeedback: '카메라에 하체가 보이도록 거리를 조정해주세요.' };
```

**LOW confidence cap**:

필수 metric은 계산 가능하지만 `repSummary.confidence.level === 'LOW'`인 경우에는 홀드하지 않고 점수를 계산한 뒤 60점 cap을 적용한다.

```js
finalScore = applyConfidenceCap(finalScore, repSummary.confidence);
hardFails.push('low_confidence_cap');
```

## 완료 기준

- `quality-gate.test.js`가 새 임계(0.7)와 DIAGONAL 게이트 경로를 반영한다.
- `squat-scoring-robustness.test.js`의 SQ-08(DIAGONAL), SQ-09(하체 잘림), SQ-10(낮은 조명)이 각각 `HOLD_CAMERA`, `HOLD_VISIBILITY`, `HOLD_CONFIDENCE`를 반환한다.
- 필수 metric confidence 부족 시 재정규화 없이 `HOLD_CONFIDENCE`가 반환된다.
- metric 계산은 가능하지만 전체 confidence만 LOW인 경우 `HOLD_CONFIDENCE`가 아니라 confidence cap을 적용한다.
