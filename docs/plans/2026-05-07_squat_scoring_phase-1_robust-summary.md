# Phase 1: Robust 요약 필드

## 목적

phase별로 샘플 시퀀스를 모아 **p90, 중앙값, 하위 10% 평균, bad-frame ratio, 연속 이탈**을 계산할 수 있게 한다.

## 주요 변경 파일

- `public/js/workout/exercises/squat-exercise.js`
  - `createPhaseSummary`: 내부 `_series` 버퍼 추가 (`spineAngle`, `trunkTibia`, `kneeValgus`, `heelContact`, `kneeAngle` 시리즈 포함)
  - `recordPhaseFrame`: 유효한 스냅샷 값을 시리즈에 push (signed `trunkTibia`도 별도 보관)
  - `finalizePhaseSummary`: 시리즈를 요약한 `robust` 객체를 phase 결과에 포함 (`_series`는 직렬화 대상에서 제외)

## `robust` 객체 필드 명세

`finalizePhaseSummary`가 반환하는 `robust` 객체는 다음 필드를 포함한다.

```js
robust: {
  bottomKneeMedian,       // BOTTOM phase 무릎각 중앙값
  bottomKneeLow10Avg,     // BOTTOM phase 하위 10% 평균 (중앙값 없을 때 대체)
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
- `robust` 객체의 모든 필드가 null 없이 계산되며 Phase 2~5의 채점 입력으로 사용 가능하다.
