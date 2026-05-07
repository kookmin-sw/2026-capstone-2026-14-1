# Phase 0: 계약·테스트 선행

## 목적

스펙 §15·§16 시나리오 전체(SQ-01~10)를 **테스트로 먼저 고정**해 이후 리팩터링 시 회귀를 막는다.

## 산출물

- `test/workout/squat-scoring-robustness.test.js` (신규): synthetic `repSummary`로 `scoreRep` 계약 검증  
  — SQ-01~07(폼 품질 시나리오) + SQ-08~10(홀드 시나리오) 모두 이 파일에 포함  
  — 각 케이스는 `scoreRep`의 반환값(`score`, `status`, `primaryFeedback`, `hardFails`, `rawMetrics`)을 직접 검증
- `test/workout/quality-gate.test.js` (수정): `estimatedView === 'DIAGONAL'` 보류, `estimatedViewConfidence` 시드 0.7 반영 (게이트 단독 동작만 검증)

## 테스트 케이스 배분

| 케이스 | 검증 파일 | 검증 대상 |
|---|---|---|
| SQ-01 정상 스쿼트(FRONT) | robustness.test.js | `score >= 80`, `status: 'VALID_REP'` |
| SQ-02 정상 스쿼트(SIDE) | robustness.test.js | `score >= 80`, `status: 'VALID_REP'` |
| SQ-03 얕은 스쿼트 | robustness.test.js | `score <= 65` 또는 `status: 'PARTIAL_REP'` |
| SQ-04 무릎 안쪽 무너짐 | robustness.test.js | `primaryFeedback`에 knee_valgus 우선 |
| SQ-05 lockout 미완료 | robustness.test.js | `status: 'PARTIAL_REP'` 또는 score <= 65 |
| SQ-06 뒤꿈치 들림 | robustness.test.js | `primaryFeedback`에 heel_contact 경고 |
| SQ-07 상체 과도 숙임 | robustness.test.js | trunk_tibia 또는 trunk_lean 경고 |
| SQ-08 대각선 카메라 | robustness.test.js | `status: 'HOLD_CAMERA'`, `score: null` |
| SQ-09 하체 잘림 | robustness.test.js | `status: 'HOLD_VISIBILITY'`, `score: null` |
| SQ-10 낮은 조명 | robustness.test.js | `status: 'HOLD_CONFIDENCE'` 또는 score <= 60 |

SQ-08~10은 gate 단위 동작(`evaluateQualityGate`)이 아닌 `scoreRep` 전체 반환값을 검증한다.

## 검증 명령

```bash
node --test test/workout/squat-scoring-robustness.test.js test/workout/quality-gate.test.js
npm test
```

## 완료 기준

- SQ-01~10에 대응하는 단위 테스트가 존재하고 구현 후 통과한다.
- 각 테스트는 `scoreRep` 반환 객체의 필수 필드(`score`, `status`, `primaryFeedback`, `hardFails`, `rawMetrics`)를 검증한다.
- 게이트가 대각 추정 시 `withhold`를 반환한다.
