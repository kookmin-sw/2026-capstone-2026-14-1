# Phase 4: Lockout baseline·방향 성분

## 목적

고정 150° 대신 **서 있는 구간에서 수집한 baseline**으로 lockout을 판정하고, trunk-tibia **signed** 값으로 피드백 방향을 구분한다.

## 주요 변경

- `public/js/workout/rep-counter.js`: `exerciseModule.collectNeutralBaseline(repCounter, angles, machineState)` 호출
- `squat-exercise.js`:
  - NEUTRAL 구간에서 무릎·힙 각 샘플 링버퍼(약 0.5~1초 분량, 기본 30개) 유지
  - `finalizeRepSummary`에 `standingKneeBaseline`, `standingHipBaseline`, 샘플 수 포함
  - lockout: `lockoutKnee >= baselineKnee - 15`, `lockoutHip >= baselineHip - 20`, 샘플 부족 시 **150° 등 고정값 폴백**
  - 스냅샷에 `signedTrunkTibia` 필드 추가

## baseline buffer 제한

baseline 샘플도 무제한 배열로 저장하지 않는다. 30fps 기준 약 1초 분량이면 충분하므로 기본 크기는 30으로 둔다.

```js
const BASELINE_BUFFER_SIZE = 30;

function pushBaseline(buffer, value, max = BASELINE_BUFFER_SIZE) {
  if (!Number.isFinite(value)) return;
  buffer.push(value);
  if (buffer.length > max) buffer.shift();
}
```

## 완료 기준

- baseline 충분 + 정상 lockout이면 `VALID_REP`이며 `lockout_incomplete`가 없다.
- baseline 충분 + knee/hip 미복귀이면 `PARTIAL_REP`이며 `hardFails`에 `lockout_incomplete`가 포함된다.
- baseline 샘플 부족이면 기존 고정 기준(`lockoutKnee >= 150`, 가능하면 `lockoutHip`) fallback을 사용한다.
- baseline 샘플 버퍼는 최대 크기를 가지며 rep/세션 전체에 걸쳐 무제한 증가하지 않는다.
- Phase 0의 baseline lockout 계약 테스트 3개가 통과한다.
