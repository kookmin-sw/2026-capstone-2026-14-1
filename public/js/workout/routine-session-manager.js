function resolveRoutineAdvanceAction({
  action,
  restSec = 0,
  nextSessionId = null,
  currentSet = 1,
  totalSets = 1,
  hasNextExerciseStep = false,
  fallbackRestSec = 0,
}) {
  const normalizedAction = String(action || '').toUpperCase();

  if (normalizedAction === 'NEXT_SET') {
    return { action: 'NEXT_SET', restSec, nextSessionId };
  }

  if (normalizedAction === 'NEXT_STEP') {
    return { action: 'NEXT_STEP', restSec, nextSessionId };
  }

  if (normalizedAction === 'ROUTINE_COMPLETE') {
    return { action: 'ROUTINE_COMPLETE', restSec, nextSessionId };
  }

  if (currentSet < totalSets) {
    return { action: 'NEXT_SET', restSec: fallbackRestSec, nextSessionId };
  }

  if (hasNextExerciseStep) {
    return { action: 'NEXT_STEP', restSec: fallbackRestSec, nextSessionId };
  }

  return {
    action: 'ROUTINE_COMPLETE',
    restSec: fallbackRestSec,
    nextSessionId,
  };
}

function createRoutineSessionManager(deps = {}) {
  const state = deps.state || {};
  const fetchImpl =
    typeof deps.fetchImpl === 'function'
      ? deps.fetchImpl
      : typeof fetch === 'function'
        ? fetch
        : null;
  const startRest =
    typeof deps.startRest === 'function' ? deps.startRest : () => {};
  const finishWorkout =
    typeof deps.finishWorkout === 'function'
      ? deps.finishWorkout
      : async () => {};

  async function recordRoutineSetCompletion({
    actualValue,
    targetType,
    durationSec,
    score,
    sessionPayload = null,
  }) {
    if (!state.sessionId) {
      throw new Error('sessionId가 없어 루틴 세트를 저장할 수 없습니다.');
    }

    if (typeof fetchImpl !== 'function') {
      throw new Error('routine session manager requires fetch.');
    }

    const payload =
      sessionPayload && typeof sessionPayload === 'object'
        ? { ...sessionPayload }
        : {};

    payload.actual_value = Math.max(0, Math.round(Number(actualValue) || 0));
    payload.duration_sec = Math.max(0, Math.round(Number(durationSec) || 0));
    payload.score = Number.isFinite(Number(score))
      ? Math.round(Number(score))
      : null;

    if (targetType === 'REPS') {
      payload.actual_reps = payload.actual_value;
    }

    const response = await fetchImpl(`/api/workout/session/${state.sessionId}/set`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data?.success) {
      throw new Error(
        data?.error || data?.message || '루틴 세트 저장에 실패했습니다.',
      );
    }

    return data?.routine || null;
  }

  async function checkRoutineProgress({
    actualValue,
    targetValue,
    currentSet,
    totalSets,
    hasNextExerciseStep,
    fallbackRestSec = 0,
    payload,
  }) {
    if (actualValue < targetValue) {
      return { action: 'NONE', restSec: 0, nextSessionId: null };
    }

    const routineState = await recordRoutineSetCompletion(payload);
    const normalizedAction = String(routineState?.action || '').toUpperCase();

    if (normalizedAction === 'ALREADY_PROCESSED') {
      return {
        action: 'ALREADY_PROCESSED',
        restSec: 0,
        nextSessionId: null,
        routineState,
      };
    }

    const actionResult = resolveRoutineAdvanceAction({
      action: routineState?.action,
      restSec: Math.max(
        0,
        Number(
          routineState?.rest_sec != null ? routineState.rest_sec : fallbackRestSec,
        ) || 0,
      ),
      nextSessionId: Number(routineState?.next_session?.session_id) || null,
      currentSet,
      totalSets,
      hasNextExerciseStep,
      fallbackRestSec: Math.max(0, Number(fallbackRestSec) || 0),
    });

    if (
      (actionResult.action === 'NEXT_SET' || actionResult.action === 'NEXT_STEP') &&
      (!Number.isFinite(actionResult.nextSessionId) || actionResult.nextSessionId <= 0)
    ) {
      throw new Error('다음 루틴 세션 정보를 받지 못했습니다.');
    }

    if (actionResult.action === 'NEXT_SET' && actionResult.restSec > 0) {
      startRest(actionResult.restSec, 'NEXT_SET');
    }

    if (actionResult.action === 'NEXT_STEP' && actionResult.restSec > 0) {
      startRest(actionResult.restSec, 'NEXT_EXERCISE');
    }

    if (actionResult.action === 'ROUTINE_COMPLETE') {
      await finishWorkout();
    }

    return {
      ...actionResult,
      routineState,
    };
  }

  return {
    checkRoutineProgress,
    recordRoutineSetCompletion,
    resolveRoutineAdvanceAction,
  };
}

if (typeof window !== 'undefined') {
  window.createRoutineSessionManager = createRoutineSessionManager;
}

if (typeof module !== 'undefined') {
  module.exports = {
    createRoutineSessionManager,
    resolveRoutineAdvanceAction,
  };
}
