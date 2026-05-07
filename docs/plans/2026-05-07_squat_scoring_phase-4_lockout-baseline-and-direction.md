# Phase 4: Lockout baseline·방향 성분

## 목적

고정 150° 대신 **서 있는 구간에서 수집한 baseline**으로 lockout을 판정하고, trunk-tibia **signed** 값으로 피드백 방향을 구분한다.

## 주요 변경

- `public/js/workout/rep-counter.js`: `exerciseModule.collectNeutralBaseline(repCounter, angles, machineState)` 호출
- `squat-exercise.js`:
  - NEUTRAL 구간에서 무릎·힙 각 샘플 링버퍼(약 0.5~1초 분량) 유지
  - `finalizeRepSummary`에 `standingKneeBaseline`, `standingHipBaseline`, 샘플 수 포함
  - lockout: `lockoutKnee >= baselineKnee - 15`, `lockoutHip >= baselineHip - 20`, 샘플 부족 시 **150° 등 고정값 폴백**
  - 스냅샷에 `signedTrunkTibia` 필드 추가

## 완료 기준

- baseline이 있을 때와 없을 때 모두 lockout 판정이 안정적으로 동작한다.
