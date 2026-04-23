function createSessionUi({
  refs,
  createElement = typeof document !== 'undefined'
    ? document.createElement.bind(document)
    : null,
  formatClock,
}) {
  void formatClock;

  function updateStatus(className, text) {
    if (!refs.statusBadge) return;
    refs.statusBadge.className = `status ${className}`;
    refs.statusBadge.textContent = text;
  }

  function showAlert(title, message) {
    if (!refs.alertContainer || !refs.alertTitle || !refs.alertMessage) return;
    refs.alertTitle.textContent = title;
    refs.alertMessage.textContent = message;
    refs.alertContainer.hidden = false;
  }

  function hideAlert() {
    if (refs.alertContainer) {
      refs.alertContainer.hidden = true;
    }
  }

  function showToast(message) {
    if (typeof createElement !== 'function') return null;

    const toast = createElement('div');
    toast.className = 'toast workout-session-toast';
    toast.textContent = message;

    if (typeof document !== 'undefined' && document.body?.appendChild) {
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2000);
    }

    return toast;
  }

  function setupRoutineProgressUi({ steps = [] }) {
    if (!refs.routineProgressEl || !refs.routineStepEl || typeof createElement !== 'function') {
      return;
    }

    const card = refs.routineProgressEl.closest?.('.progress-card');
    const progressTrack = refs.routineProgressEl.parentElement;
    const labelEl = card?.querySelector?.('span.muted:not(#routineStep)');
    if (!card || !progressTrack || !labelEl || card.dataset.enhanced === 'true') {
      return;
    }

    card.dataset.enhanced = 'true';
    card.classList.add('routine-progress-card');
    progressTrack.classList.add('routine-progress-track');

    const header = createElement('div');
    header.className = 'routine-progress-header';

    const titleGroup = createElement('div');
    titleGroup.className = 'routine-progress-title-group';
    refs.routineCurrentExerciseEl = createElement('strong');
    refs.routineCurrentExerciseEl.className = 'routine-progress-current';
    titleGroup.append(labelEl, refs.routineCurrentExerciseEl);

    const stats = createElement('div');
    stats.className = 'routine-progress-stats';
    refs.routineProgressCountEl = createElement('strong');
    refs.routineProgressCountEl.className = 'routine-progress-count';
    refs.routineProgressPercentEl = createElement('span');
    refs.routineProgressPercentEl.className = 'routine-progress-percent';
    stats.append(refs.routineProgressCountEl, refs.routineProgressPercentEl);
    header.append(titleGroup, stats);

    const meta = createElement('div');
    meta.className = 'routine-progress-meta';
    refs.routineTargetSummaryEl = createElement('span');
    refs.routineTargetSummaryEl.className = 'routine-progress-target';
    meta.append(refs.routineStepEl, refs.routineTargetSummaryEl);

    refs.routineStepListEl = createElement('div');
    refs.routineStepListEl.className = 'routine-step-list';
    refs.routineStepListEl.setAttribute('aria-label', '루틴 단계');

    steps.forEach((step, index) => {
      const chip = createElement('div');
      chip.className = 'routine-step-chip';
      chip.setAttribute('data-routine-step-index', String(index));

      const chipIndex = createElement('span');
      chipIndex.className = 'routine-step-index';
      chipIndex.textContent = String(index + 1);

      const chipCopy = createElement('div');
      chipCopy.className = 'routine-step-copy';

      const chipTitle = createElement('strong');
      chipTitle.textContent = step.exerciseName;

      const chipMeta = createElement('span');
      chipMeta.textContent = step.targetSummary;

      chipCopy.append(chipTitle, chipMeta);
      chip.append(chipIndex, chipCopy);
      refs.routineStepListEl.append(chip);
    });

    card.replaceChildren(header, progressTrack, meta, refs.routineStepListEl);
  }

  function updatePrimaryCounterDisplay({
    isTimeBased,
    isRoutineTimeTarget,
    currentSegmentSec,
    currentSetWorkSec,
    currentRep,
  }) {
    if (refs.repCountLabelEl) {
      refs.repCountLabelEl.textContent =
        isTimeBased || isRoutineTimeTarget ? '시간(초)' : '횟수';
    }

    const value = isTimeBased
      ? Math.max(0, Math.round(currentSegmentSec))
      : isRoutineTimeTarget
        ? Math.max(0, Math.round(currentSetWorkSec))
        : Math.max(0, Math.round(currentRep));

    if (refs.repCountEl) {
      refs.repCountEl.textContent = String(value);
    }
  }

  function updateRoutineStepDisplay({
    stepIndex,
    totalSteps,
    progressPercent,
    currentExerciseName,
    targetSummary,
  }) {
    if (refs.routineStepEl) {
      refs.routineStepEl.textContent = `현재 ${stepIndex + 1} / ${totalSteps} 운동`;
    }
    if (refs.routineProgressEl) {
      refs.routineProgressEl.style.width = `${progressPercent}%`;
    }
    if (refs.routineProgressCountEl) {
      refs.routineProgressCountEl.textContent = `${stepIndex + 1} / ${totalSteps}`;
    }
    if (refs.routineProgressPercentEl) {
      refs.routineProgressPercentEl.textContent = `${progressPercent}%`;
    }
    if (refs.routineCurrentExerciseEl) {
      refs.routineCurrentExerciseEl.textContent = currentExerciseName;
    }
    if (refs.routineTargetSummaryEl) {
      refs.routineTargetSummaryEl.textContent = targetSummary;
    }
    if (refs.routineStepListEl) {
      refs.routineStepListEl
        .querySelectorAll('[data-routine-step-index]')
        .forEach((chip) => {
          const chipIndex = Number(chip.getAttribute('data-routine-step-index'));
          chip.classList.toggle('is-complete', chipIndex < stepIndex);
          chip.classList.toggle('is-active', chipIndex === stepIndex);
          chip.classList.toggle('is-upcoming', chipIndex > stepIndex);

          if (chipIndex === stepIndex) {
            chip.setAttribute('aria-current', 'step');
          } else {
            chip.removeAttribute('aria-current');
          }
        });
    }
  }

  function updateScoreDisplay({
    score,
    displayText = score > 0 ? String(score) : '--',
    breakdown = [],
    gated = false,
    message = null,
    emptyMessage = '포즈 감지 중...',
    color = '#94a3b8',
  }) {
    if (refs.liveScoreEl) {
      refs.liveScoreEl.textContent = displayText;
      refs.liveScoreEl.style.background = 'none';
      refs.liveScoreEl.style.webkitBackgroundClip = 'unset';
      refs.liveScoreEl.style.webkitTextFillColor = 'unset';
      refs.liveScoreEl.style.color = color;
    }

    if (!refs.scoreBreakdownEl) return;

    if (gated && message) {
      refs.scoreBreakdownEl.innerHTML = `<div class="score-item"><span class="muted">${message}</span></div>`;
      return;
    }

    if (!breakdown.length) {
      refs.scoreBreakdownEl.innerHTML = `<div class="score-item"><span class="muted">${emptyMessage}</span></div>`;
      return;
    }

    refs.scoreBreakdownEl.innerHTML = breakdown
      .slice(0, 3)
      .map((item) => `
        <div class="score-item">
          <span>${item.title || item.key}</span>
          <span>${Math.round(item.score ?? item.normalizedScore ?? 0)}</span>
        </div>
      `)
      .join('');
  }

  function syncPlankTargetUi({
    isPlank,
    isRoutinePlank,
    showFreeTargetUi,
    targetSec,
    canStart,
    phase,
  }) {
    if (refs.plankTargetSelectRoot) {
      refs.plankTargetSelectRoot.hidden = !showFreeTargetUi;
      refs.plankTargetSelectRoot
        .querySelectorAll('[data-plank-target-sec]')
        .forEach((button) => {
          const buttonSec = Number(button.getAttribute('data-plank-target-sec'));
          button.classList.toggle('active', buttonSec === targetSec);
          button.disabled = isRoutinePlank;
        });
    }

    if (refs.plankTargetInput) {
      if (targetSec > 0) refs.plankTargetInput.value = String(targetSec);
      refs.plankTargetInput.disabled = isRoutinePlank;
    }

    if (refs.plankTargetHint) {
      refs.plankTargetHint.textContent = isRoutinePlank
        ? `루틴 목표 시간 ${targetSec}초가 자동으로 적용됩니다.`
        : '플랭크는 목표 시간을 먼저 정한 뒤 시작합니다. 목표 시간은 세션 종료 시 점수 정규화 기준이 됩니다.';
    }

    if (refs.plankTargetReadoutEl) {
      refs.plankTargetReadoutEl.textContent = targetSec > 0 ? `${targetSec}초` : '--';
    }

    if (refs.scoreModeLabelEl) {
      refs.scoreModeLabelEl.textContent = isPlank ? '현재 자세 점수' : '이번 rep 점수';
    }
    if (refs.timerLabelEl) {
      refs.timerLabelEl.textContent = isPlank ? '플랭크 시간' : '운동 시간';
    }
    if (refs.startBtn && phase === 'PREPARING') {
      refs.startBtn.textContent = isPlank ? '플랭크 시작' : '운동 시작';
      refs.startBtn.disabled = !canStart;
    }
  }

  function updatePlankRuntimeDisplay({
    bestHoldSec,
    currentSegmentSec,
    goalReached,
    isPlank,
    phase,
    progressPercent,
    targetSec,
  }) {
    if (refs.plankRuntimePanelEl) {
      refs.plankRuntimePanelEl.hidden = !isPlank;
    }
    if (refs.plankTimerPanelEl) {
      refs.plankTimerPanelEl.hidden = !isPlank;
    }
    if (!isPlank) return;

    if (refs.plankCurrentHoldEl) {
      refs.plankCurrentHoldEl.textContent = formatClock(currentSegmentSec);
    }
    if (refs.plankBestHoldEl) {
      refs.plankBestHoldEl.textContent = formatClock(bestHoldSec);
    }
    if (refs.plankPhaseInfoEl) {
      refs.plankPhaseInfoEl.textContent = phase;
    }
    if (refs.plankStateLabelEl) {
      refs.plankStateLabelEl.textContent = phase;
    }
    if (refs.plankSegmentLabelEl) {
      refs.plankSegmentLabelEl.textContent = formatClock(currentSegmentSec);
    }
    if (refs.plankTargetReadoutEl) {
      refs.plankTargetReadoutEl.textContent = targetSec > 0 ? `${targetSec}초` : '--';
    }
    if (refs.plankGoalLabelEl) {
      refs.plankGoalLabelEl.textContent = goalReached
        ? '달성'
        : targetSec > 0
          ? `${Math.max(0, targetSec - bestHoldSec)}초 남음`
          : '대기 중';
    }
    if (refs.plankProgressEl) {
      refs.plankProgressEl.style.width = `${progressPercent}%`;
    }
  }

  return {
    hideAlert,
    showAlert,
    showToast,
    setupRoutineProgressUi,
    syncPlankTargetUi,
    updatePlankRuntimeDisplay,
    updatePrimaryCounterDisplay,
    updateRoutineStepDisplay,
    updateScoreDisplay,
    updateStatus,
  };
}

if (typeof window !== 'undefined') {
  window.createSessionUi = createSessionUi;
}

if (typeof module !== 'undefined') {
  module.exports = { createSessionUi };
}
