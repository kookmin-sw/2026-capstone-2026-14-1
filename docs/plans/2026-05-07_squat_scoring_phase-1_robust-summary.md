# Phase 1: Robust 요약 필드

## 목적

phase별로 샘플 시퀀스를 모아 **p90, 중앙값, 하위 10% 평균, bad-frame ratio, 연속 이탈**을 계산할 수 있게 한다.

## 주요 변경 파일

- `public/js/workout/exercises/squat-exercise.js`
  - `createPhaseSummary`: 내부 `_series` 버퍼 추가 (`spineAngle`, `trunkTibia`, `kneeValgus`, `heelContact`, `kneeAngle`, `hipY`, `kneeY`, metric별 confidence 시리즈 포함)
  - `recordPhaseFrame`: 유효한 스냅샷 값을 시리즈에 push만 수행 (signed `trunkTibia`도 별도 보관)
  - `finalizePhaseSummary`: 시리즈를 요약한 `robust` 및 `robustConfidence` 객체를 phase 결과에 포함 (`_series`는 직렬화 대상에서 제외)

## 성능·직렬화 계약

프레임 처리 중에는 정렬/percentile/median 계산을 하지 않는다. `recordPhaseFrame`은 O(1)에 가까운 push 작업만 수행하고, `percentile`, `median`, `bad-frame ratio`, 연속 이탈 프레임 계산은 `finalizePhaseSummary` 또는 rep 종료 시점에 한 번만 수행한다.

```js
const MAX_SERIES_SAMPLES = 300;

function pushFiniteLimited(arr, value) {
  if (!Number.isFinite(value)) return;
  arr.push(value);
  if (arr.length > MAX_SERIES_SAMPLES) arr.shift();
}
```

각 `_series` 배열은 최대 샘플 수를 가진다. 기본값은 rep 단위 `MAX_SERIES_SAMPLES = 300`으로 두고, 필요하면 phase별 제한을 더 세분화한다.

```js
const MAX_PHASE_SAMPLES = {
  DESCENT: 120,
  BOTTOM: 90,
  ASCENT: 120
};
```

`_series`는 내부 계산용 버퍼이므로 최종 `scoreRep` 결과, `rawMetrics`, DB payload, UI state, 장기 로그에 포함하지 않는다.

```js
function finalizePhaseSummary(summary) {
  const robust = buildRobustSummary(summary._series);
  const robustConfidence = buildRobustConfidence(summary._series);
  const { _series, ...serializableSummary } = summary;

  return {
    ...serializableSummary,
    robust,
    robustConfidence
  };
}
```

view별 필요한 metric만 저장하는 최적화는 선택 사항이다. 초기 구현은 단순성을 위해 공통 시리즈를 저장해도 되지만, 프레임마다 요약 계산을 수행하거나 `_series`를 직렬화해서는 안 된다.

## `robust` 객체 필드 명세

`finalizePhaseSummary`가 반환하는 `robust` 객체는 다음 필드를 포함한다.

```js
robust: {
  bottomKneeMedian,       // BOTTOM phase 무릎각 중앙값
  bottomKneeLow10Avg,     // BOTTOM phase 하위 10% 평균 (중앙값 없을 때 대체)
  hipBelowKnee,            // 기존 summary 값 또는 hipY > kneeY 기반 0/1
  hipNearKnee,             // hipY와 kneeY 차이가 신체 스케일 기준 threshold 이하이면 1
  trunkLeanP90,           // DESCENT+BOTTOM+ASCENT spineAngle p90
  trunkTibiaAbsP90,       // 절대값 trunkTibia p90 (채점용)
  signedTrunkTibiaP90,    // signed trunkTibia p90 (피드백 방향용)
  valgusAvg,              // kneeValgus avg (전체 채점 phase)
  valgusP90,              // kneeValgus p90
  valgusBadRatio,         // kneeValgus > 0.10인 프레임 비율
  heelContactAvg,         // heelContact avg
  heelContactBreakFrames  // heelContact === 0인 연속 최대 프레임 수
}
```

계산 불가한 선택 metric은 억지 fallback으로 채우지 않고 `null`을 유지한다. `scoreRep`는 Phase 3/5에서 `null` metric을 만나도 HOLD 또는 weight 재정규화로 처리해야 한다.

## `robustConfidence` 객체 필드 명세

Phase 3의 필수 metric confidence 판단을 위해 metric별 confidence를 함께 저장한다.

```js
robustConfidence: {
  depth,              // knee/hip/ankle 기반 depth 대표값 신뢰도
  hip_angle,          // hip angle 신뢰도
  trunk_stability,    // spineAngle/trunkLean 신뢰도
  trunk_tibia_angle,  // trunk-tibia 관계 신뢰도
  knee_valgus,        // hip/knee/ankle 기반 valgus 신뢰도
  knee_symmetry,      // 좌우 knee angle 신뢰도
  heel_contact,       // heel/footIndex/ankle 기반 접지 신뢰도
  knee_alignment      // 정렬 proxy 신뢰도
}
```

confidence 산출은 가능한 경우 landmark visibility를 우선하고, synthetic summary/test 입력에서는 유효 샘플 비율을 fallback으로 사용한다.

```js
const metricConfidence = validSampleCount / expectedSampleCount;

const depthConfidence = minVisibility(['hip', 'knee', 'ankle']);
const heelContactConfidence = minVisibility(['heel', 'footIndex', 'ankle']);
const valgusConfidence = minVisibility(['hip', 'knee', 'ankle']);
```

landmark visibility와 sample ratio가 모두 있으면 더 보수적인 값(`Math.min`)을 사용한다.

## `hipNearKnee` 산출

`hipBelowKnee`는 기존 summary 값 또는 `hipY > kneeY`를 사용한다. `hipNearKnee`는 깊이가 borderline인 경우 partial 판정을 위한 보조 지표다.

```js
function computeHipNearKnee(hipY, kneeY, torsoLength) {
  if (!Number.isFinite(hipY) || !Number.isFinite(kneeY) || !Number.isFinite(torsoLength)) return null;
  const tolerance = torsoLength * 0.08;
  return Math.abs(hipY - kneeY) <= tolerance ? 1 : 0;
}
```

`torsoLength`를 계산할 수 없으면 `hipNearKnee`는 `null`로 두고, Phase 2에서 `bottomKnee` 기준만으로 partial/fail을 결정한다.

## 깊이 대표값

BOTTOM phase 무릎 각 시퀀스에 대해: **`bottomKneeMedian` → `bottomKneeLow10Avg` → 기존 `min` 폴백**  
최종 채점에 쓰이는 `bottomKnee`는 이 우선순위로 결정한다.

## 트렁크·무릎

- 상체 기울기(trunk proxy): `_series.spineAngle`에서 채점 phase 합산 → `trunkLeanP90`
- `trunk-tibia`: signed 값 `_series.signedTrunkTibia`에 별도 보관 후 채점은 `trunkTibiaAbsP90` 활용 (Phase 4에서 signed 값 사용)

## percentile helper

```js
function percentile(values, p) {
  const arr = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!arr.length) return null;
  const idx = Math.floor((arr.length - 1) * p);
  return arr[idx];
}
```

## 완료 기준

- 인위적 여러 스냅샷 요약만으로 깊이/트렁크/p90 규칙이 재현된다.
- `recordPhaseFrame`에서는 정렬/percentile/median 계산을 하지 않고 값 push만 수행한다.
- percentile/median/bad-frame ratio 계산은 `finalizePhaseSummary` 또는 rep 종료 시점에만 수행한다.
- `_series`는 최종 `scoreRep` 결과, `rawMetrics`, DB payload에 포함되지 않는다.
- 각 `_series` 배열은 최대 샘플 수를 가진다.
- 필수 metric은 계산되거나 confidence 부족으로 표시된다.
- 계산 불가한 선택 metric은 `null` 또는 낮은 `robustConfidence`로 표시된다.
- `scoreRep`가 `null` metric을 만나도 HOLD 또는 weight 재정규화로 안전하게 처리할 수 있는 contract가 문서화되어 있다.
