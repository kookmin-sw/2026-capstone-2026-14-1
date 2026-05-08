# Phase 6: 검증 문서·전체 회귀

## 목적

SQ-01~10 실측 결과를 문서로 남기고 전체 테스트를 통과한다.

## 산출물

- `docs/validation/2026-05-07-squat-scoring-robustness-validation.md` — 시나리오별 `score`, `status`, `primaryFeedback`, `hardFails`, `rawMetrics` 기록 가능한 표 템플릿

## 검증 명령

```bash
npm test
```

## 완료 기준

- 스펙 §19 수용 기준을 테스트·문서로 추적 가능하다.
