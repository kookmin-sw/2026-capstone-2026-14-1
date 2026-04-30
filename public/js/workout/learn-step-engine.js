function clampLearnValue(value, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeLearnChecks(checks = []) {
  if (!Array.isArray(checks)) return [];

  return checks
    .map((item, index) => {
      const label = String(item?.label || item?.title || `체크 ${index + 1}`).trim();
      const progress = item?.passed === true
        ? 1
        : clampLearnValue(item?.progress, 0, 1);

      return {
        id: String(item?.id || `check_${index + 1}`),
        label,
        passed: item?.passed === true,
        progress,
        detail: typeof item?.detail === 'string' ? item.detail.trim() : null,
      };
    })
    .filter((item) => item.label);
}

function normalizeLearnStepEvaluation(rawEvaluation = null) {
  const checks = normalizeLearnChecks(rawEvaluation?.checks || []);
  const derivedProgress = checks.length > 0
    ? (checks.reduce((sum, item) => sum + (item.passed ? 1 : item.progress), 0) / checks.length)
    : 0;
  const progress = rawEvaluation?.passed === true
    ? 1
    : clampLearnValue(
      rawEvaluation?.progress != null ? rawEvaluation.progress : derivedProgress,
      0,
      1,
    );

  return {
    passed: rawEvaluation?.passed === true,
    progress,
    checks,
    feedback: typeof rawEvaluation?.feedback === 'string' ? rawEvaluation.feedback.trim() : null,
    status: typeof rawEvaluation?.status === 'string' ? rawEvaluation.status.trim() : null,
  };
}

function updateLearnHoldState({
  currentHoldMs = 0,
  deltaMs = 0,
  holdMs = 0,
  passed = false,
}) {
  const safeTargetMs = Math.max(0, Math.round(Number(holdMs) || 0));
  const safeDeltaMs = Math.max(0, Math.min(200, Math.round(Number(deltaMs) || 0)));
  const nextHoldMs = passed
    ? Math.max(0, currentHoldMs + safeDeltaMs)
    : 0;

  if (safeTargetMs === 0) {
    return {
      holdMs: passed ? 0 : 0,
      holdProgress: passed ? 1 : 0,
      completed: passed,
    };
  }

  return {
    holdMs: nextHoldMs,
    holdProgress: clampLearnValue(nextHoldMs / safeTargetMs, 0, 1),
    completed: passed && nextHoldMs >= safeTargetMs,
  };
}

const LearnStepEngine = {
  clampLearnValue,
  normalizeLearnChecks,
  normalizeLearnStepEvaluation,
  updateLearnHoldState,
};

if (typeof window !== 'undefined') {
  window.LearnStepEngine = LearnStepEngine;
}

if (typeof module !== 'undefined') {
  module.exports = LearnStepEngine;
}
