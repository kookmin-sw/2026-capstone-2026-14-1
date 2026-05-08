# Phase 2: 가중치·커브·연속 깊이 cap

## 목적

스펙 §3·§4·§6·§13의 **연속 깊이 cap**, **트렁크 lean 커브**, **FRONT/SIDE 가중치**, **`CURVES` 상수**를 상수 기반으로 고정한다.

## 주요 변경

### `SQUAT_SCORING_CONFIG` (스펙 §13)

뷰별 metric·가중치·scorer를 상수 객체로 분리한다.

```js
const SQUAT_SCORING_CONFIG = {
  FRONT: {
    metrics: [
      { key: 'knee_valgus',    weight: 0.40, scorer: 'kneeValgus' },
      { key: 'depth',          weight: 0.25, scorer: 'kneeDepth' },
      { key: 'knee_symmetry',  weight: 0.20, scorer: 'symmetry' },
      { key: 'trunk_stability',weight: 0.15, scorer: 'trunkLean' }
    ]
  },
  SIDE: {
    metrics: [
      { key: 'depth',             weight: 0.35, scorer: 'kneeDepth' },
      { key: 'trunk_tibia_angle', weight: 0.20, scorer: 'angleDiff' },
      { key: 'hip_angle',         weight: 0.17, scorer: 'hipDepth' },
      { key: 'trunk_stability',   weight: 0.15, scorer: 'trunkLean' },
      { key: 'heel_contact',      weight: 0.08, scorer: 'heelContact' },
      { key: 'knee_alignment',    weight: 0.05, scorer: 'alignment' }
    ]
  }
};
```

SIDE에서 `knee_alignment` 신뢰 불가 시 해당 metric을 제외하고 나머지 가중치를 재정규화한다.

### `CURVES` 상수 (스펙 §13)

커브별 breakpoint 배열을 상수로 분리한다. 채점 함수는 이 배열을 참조해 선형 보간한다.

```js
const CURVES = {
  kneeDepth: [
    [90, 100], [100, 85], [115, 50], [130, 15], [150, 0]
  ],
  kneeValgus: [
    [0.03, 100], [0.06, 70], [0.10, 30], [0.15, 5], [0.20, 0]
  ],
  trunkLean: [
    [25, 100], [40, 75], [55, 40], [70, 10], [85, 0]
  ],
  hipDepth: [
    [110, 100], [120, 80], [140, 40], [155, 10], [170, 0]
  ],
  symmetry: [
    [10, 100], [18, 70], [28, 25], [40, 0]
  ]
};
```

### `applyDepthCap` (스펙 §3)

`isDepthGood` / 구간별 cap을 스펙 §3.2 그대로 구현한다.

```js
function isDepthGood(bottomKnee, hipBelowKnee) {
  return bottomKnee <= 100 || (bottomKnee <= 110 && hipBelowKnee === 1);
}

function applyDepthCap(score, bottomKnee, hipBelowKnee) {
  if (!Number.isFinite(bottomKnee)) return Math.min(score, 60);
  if (isDepthGood(bottomKnee, hipBelowKnee)) return score;
  if (bottomKnee <= 130) return Math.min(score, interpolate(bottomKnee, 100, 130, 85, 55));
  return Math.min(score, 55);
}
```

### `depth_partial` / `depth_fail` 판정

`hipNearKnee`는 Phase 1의 `computeHipNearKnee(hipY, kneeY, torsoLength)` 결과를 사용한다.

```js
function classifyDepth(bottomKnee, hipBelowKnee, hipNearKnee) {
  if (bottomKnee <= 100 || (bottomKnee <= 110 && hipBelowKnee === 1)) {
    return 'depth_good';
  }
  if (bottomKnee <= 130 || hipNearKnee === 1) {
    return 'depth_partial';
  }
  return 'depth_fail';
}
```

`hipNearKnee`가 `null`이면 보조 판정 없이 `bottomKnee` 기준만 사용한다. `hipNearKnee`는 좋은 깊이 통과 조건에는 쓰지 않고, partial/fail 경계에서만 보조한다.

### trunk lean 커브 완화 (스펙 §4.2)

기존 `scoreSpine`의 `15°/30°/45°/60°` 경계를 `CURVES.trunkLean`의 `25°/40°/55°/70°`로 교체한다.

## 완료 기준

- `bottomKnee = 130/131` 경계에서 점수가 급락하지 않는다.
- 얕은 스쿼트가 다른 metric 고득점만으로 70점대 이상을 받지 않는다.
- `CURVES` 및 `SQUAT_SCORING_CONFIG`가 함수 내부 분기 없이 상수로 분리되어 있다.
