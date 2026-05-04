# AI Growth Report Deferred: Cache Persistence

> Parent roadmap: `docs/plans/2026-05-03_ai_growth_report_implementation_plan.md`
> Status: Deferred. This is not part of the on-demand MVP.

## Why Deferred

The current `session_event` schema is session-scoped, not user-report-scoped:

- `session_id BIGINT NOT NULL`
- no `user_id` column
- no `occurred_at` column

AI growth reports are user-level summaries over recent workout history, so saving them into the current `session_event` table would require schema changes first.

## MVP Rule

- `GET /api/users/me/coach-report` calculates on demand.
- `POST /api/users/me/coach-report/rebuild` recalculates on demand.
- responses use `source: "generated"`.
- no cache lookup.
- no cache insert.
- no `ai-history-report.repository.js` in MVP.

## Future Options

### Option A: Extend `session_event`

```sql
ALTER TABLE session_event
  ALTER COLUMN session_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_user(user_id),
  ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_session_event_user_type_occurred
  ON session_event (user_id, type, occurred_at DESC);
```

Use this only if `session_event` is intentionally broadened from workout-session events to user-level report events.

### Option B: Add Dedicated Report Table

Create a dedicated table such as `ai_growth_report` with explicit columns for `user_id`, `period`, `exercise_key`, `payload`, and `created_at`. This is cleaner if report persistence becomes product behavior rather than an event-log detail.

## Activation Gate

Do not implement cache persistence until one storage option is selected and the migration is part of the plan.
