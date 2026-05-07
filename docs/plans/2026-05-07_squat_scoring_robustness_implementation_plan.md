# 스쿼트 채점 안정화 구현 계획 (인덱스)

> 스펙: [2026-05-07-squat-scoring-robustness-spec](../specs/2026-05-07-squat-scoring-robustness-spec.md)  
> **문서 작성 언어:** 본 디렉터리의 모든 phase 문서와 본 파일은 한국어로 작성한다. 코드 식별자·파일명·쉘 명령은 원문을 유지한다.

## 목표

스쿼트 rep 채점을 **연속 깊이 cap**, **phase 기반 robust metric**, **뷰/신뢰도 홀드**, **baseline 기반 lockout**, **점수와 rep 상태 분리**, **raw metric 스냅샷** 구조로 정리한다.

## Phase 파일 목록

1. [Phase 0 — 계약·테스트 선행](./2026-05-07_squat_scoring_phase-0_contract-tests.md)
2. [Phase 1 — Robust 요약 필드](./2026-05-07_squat_scoring_phase-1_robust-summary.md)
3. [Phase 2 — 가중치·커브·깊이 cap](./2026-05-07_squat_scoring_phase-2_scorer-config-and-caps.md)
4. [Phase 3 — 품질 게이트·뷰 홀드](./2026-05-07_squat_scoring_phase-3_quality-view-holds.md)
5. [Phase 4 — Lockout baseline·방향 성분](./2026-05-07_squat_scoring_phase-4_lockout-baseline-and-direction.md)
6. [Phase 5 — 결과 객체·피드백·스냅샷](./2026-05-07_squat_scoring_phase-5_result-contract-feedback-snapshot.md)
7. [Phase 6 — 검증 문서·회귀](./2026-05-07_squat_scoring_phase-6_validation-and-docs.md)

## 실행 순서

Phase 0 → 6 순으로 진행한다. 테스트는 가능한 한 Phase 0에서 시나리오를 고정하고, 이후 단계에서 구현을 채운다.

## 범위

- **포함:** `public/js/workout/exercises/squat-exercise.js`, `public/js/workout/scoring-engine.js`(게이트), `public/js/workout/rep-counter.js`(baseline 훅), `test/workout/*`
- **제외:** DIAGONAL 전용 별도 metric plan, 척추 flexion proxy, 서버 스키마 변경
