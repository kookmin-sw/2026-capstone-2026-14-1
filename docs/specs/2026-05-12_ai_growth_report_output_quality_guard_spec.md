# AI Growth Report Output Quality Guard Spec

## Goal

AI growth report output must not contradict the server-computed workout history feature. The server owns factual decisions such as data quality, whether the user is doing well, and which focus metrics are allowed. The LLM only turns those facts into readable coaching text.

## Problem

The LLM can produce a coherent-looking report that conflicts with the computed feature data. One observed example is a report saying recent squat sessions averaged 92 points and were stable, while also labeling data quality as low and warning that the report is only for reference. This happens because `data_quality_note`, `weak_points`, and `next_mission` are accepted from the LLM with only structural validation.

## Final Policy

After an LLM response passes schema validation, the service must post-process it against the history feature before returning it to the client.

The server-computed `feature.data_quality` is authoritative. The final report must use `feature.data_quality.confidence_label` and `feature.data_quality.note` for `data_quality_note`. The LLM may not downgrade or contradict data quality.

When `feature.is_doing_well` is true, the final report must not invent weak points. `weak_points` must be an empty array. The next mission must remain a maintenance or consistency mission. If the LLM emits a mission tied to a missing or unsupported metric, the service must replace it with a maintenance mission using `general_maintenance`.

The final `next_mission.metric_key` must be either one of the server-provided focus candidate metric keys, one of the emitted improvement or weak point metric keys, or `general_maintenance`. Unknown metric keys must be replaced with `general_maintenance`.

The service may keep LLM-generated summary, improvements, and coach comment when they do not conflict with the authoritative feature. The service must normalize common LLM field variants before validation, such as `description` to `action` and `confidence_label` to `label`.

History data quality must distinguish between missing detailed metric trends and genuinely unreliable input. If the recent period has enough completed sessions but no metric trend rows, the report must not be labeled low quality solely because metric detail is absent. In that case, use at least medium confidence with a message that the analysis is based mainly on session scores. Low confidence should be reserved for genuinely insufficient sessions, low sample evidence, or camera/visibility problems.

Date range periods must be interpreted as date ranges, not as recent-session aliases. `last_7_days` and `last_30_days` must query sessions whose `ended_at` is inside the requested window and must pass a date-range period label into the history feature. The report must not describe a `last_30_days` request as "recent 5 sessions" unless only five sessions actually exist and the wording still names the 30-day range.

Camera event penalties must not downgrade a sufficiently populated completed-session report to low confidence solely because each session had a transient camera event. Raw camera event counts may be reported, but confidence should be based on affected sessions and available completed history.

Report content must be balanced and specific. If the user has a strong overall score or a stable/improving trend, the final report must include at least one concrete positive item even when weak points exist. Positive and corrective items must include `title`, `evidence`, and `meaning`: the evidence should mention available period, average score, completed count, occurrence count, or metric average; the meaning should explain what that metric implies for the actual posture.

## Implementation Scope

Create a post-processing helper in `backend/analysis/llm-coach/report-post-processor.js`.

Use the helper from `backend/analysis/service/ai-growth-report.service.js` immediately after `validateGrowthReportOutput` succeeds and before `buildResponse`.

Update history data quality calculation so completed session count can raise the baseline confidence when metric trends are absent but session-level scores are available.

Add focused tests proving:

- Data quality in the final LLM report is overwritten from `feature.data_quality`.
- Doing-well reports remove invented weak points.
- Doing-well reports replace unsupported next mission metric keys with `general_maintenance`.
- Stable recent completed sessions without metric trends are not marked low quality only because metric rows are absent.
- `last_30_days` uses a date filter and the analyzer treats all returned sessions as the selected range.
- Transient camera events across enough completed sessions remain medium quality rather than low quality.
- Strong or stable reports with weak points still include a detailed positive item.
- Weak point items are enriched with concrete metric evidence and posture meaning.
- Existing provider and schema fallback behavior remains unchanged.

## Non-Goals

This change does not alter metric trend detection, OpenRouter client behavior, or the report UI layout.
