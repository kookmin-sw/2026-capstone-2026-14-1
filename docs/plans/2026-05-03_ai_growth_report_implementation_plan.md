# AI 성장 리포트 구현 계획

> **자동화 에이전트용:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement phase files task-by-task.

**목표:** FitPlus AI 성장 리포트 MVP 구축 — 기존 운동 기록을 서버에서 분석하고, 결정론적 fallback/선택적 LLM을 통해 히스토리/운동 화면에 성장 리포트와 다음 미션을 보여준다.

**MVP 결정:** on-demand only. 리포트 결과는 DB에 저장하지 않는다. `GET /api/users/me/coach-report`와 `POST /api/users/me/coach-report/rebuild`는 매 요청마다 생성하고 `source: "generated"`를 반환한다.

**Deferred:** 사용자 단위 리포트 저장/cache는 현재 `session_event` schema와 맞지 않으므로 schema migration 이후 별도 진행한다.

---

## 현재 정리한 문제점

- 기존 단일 plan 파일이 2,300줄 이상이라 phase 단위 작업 추적이 어렵다.
- 상단과 Phase 0은 on-demand MVP를 말하지만, Phase 2/Task 8에는 캐시 repository 구현 절차가 남아 있었다.
- Task 12에는 `reportRepo.saveReport()` optional 저장 경로가 남아 있어 "저장 없음" 결정과 충돌했다.
- `session_event`는 `session_id NOT NULL`, `user_id` 없음, `occurred_at` 없음이라 사용자 단위 리포트 캐시 저장소로 바로 쓸 수 없다.

---

## Phase Files

1. [Phase 0: DB/schema compatibility spike](./2026-05-04_ai_growth_report_phase-0_schema-compatibility.md)
2. [Phase 1: 결정론적 HistoryTrendFeature](./2026-05-04_ai_growth_report_phase-1_history-trend-feature.md)
3. [Phase 2: Workout History Repository](./2026-05-04_ai_growth_report_phase-2_workout-history-repository.md)
4. [Phase 3: 폴백 및 LLM 코칭](./2026-05-04_ai_growth_report_phase-3_fallback-and-llm-coaching.md)
5. [Phase 4: 서비스와 API](./2026-05-04_ai_growth_report_phase-4_service-and-api.md)
6. [Phase 5: 프론트엔드 UI](./2026-05-04_ai_growth_report_phase-5_frontend-ui.md)
7. [Phase 6: 검증 및 문서화](./2026-05-04_ai_growth_report_phase-6_verification-and-docs.md)
8. [Deferred: Cache Persistence](./2026-05-04_ai_growth_report_deferred-cache-persistence.md)

---

## 실행 순서

1. Phase 0을 먼저 실행해 현재 DB/schema 가정을 검증한다.
2. Phase 1에서 LLM/DB 저장 없이 분석 JSON을 만든다.
3. Phase 2에서 기존 DB 운동 기록 repository만 만든다.
4. Phase 3에서 fallback과 선택적 LLM 문장화 경로를 만든다.
5. Phase 4에서 on-demand API를 연다.
6. Phase 5에서 UI 카드를 붙인다.
7. Phase 6에서 LLM 실패 fallback, API 응답, QA 문서를 검증한다.

---

## Cache Persistence Policy

MVP에서는 아래를 구현하지 않는다:

- `ai-history-report.repository.js`
- `session_event` cache lookup
- `session_event` cache insert
- `source: "cached"` 응답

저장형 리포트가 필요해지면 [Deferred: Cache Persistence](./2026-05-04_ai_growth_report_deferred-cache-persistence.md)를 먼저 업데이트하고 migration 결정을 확정한다.
