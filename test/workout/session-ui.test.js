const test = require('node:test');
const assert = require('node:assert/strict');

const { createSessionUi } = require('../../public/js/workout/session-ui.js');

function createElementStub() {
  const element = {
    textContent: '',
    hidden: false,
    className: '',
    style: {},
    value: '',
    disabled: false,
    innerHTML: '',
    dataset: {},
    children: [],
    classList: {
      values: new Set(),
      add(...names) {
        names.forEach((name) => this.values.add(name));
      },
      toggle(name, force) {
        if (force === false) {
          this.values.delete(name);
          return false;
        }
        if (force === true || !this.values.has(name)) {
          this.values.add(name);
          return true;
        }
        this.values.delete(name);
        return false;
      },
      contains(name) {
        return this.values.has(name);
      },
    },
    append(...nodes) {
      this.children.push(...nodes);
    },
    replaceChildren(...nodes) {
      this.children = nodes;
    },
    querySelectorAll(selector) {
      const results = [];
      const visit = (node) => {
        if (!node || !Array.isArray(node.children)) return;
        node.children.forEach((child) => {
          if (
            selector === '[data-routine-step-index]' &&
            child['data-routine-step-index'] != null
          ) {
            results.push(child);
          }
          if (
            selector === '[data-plank-target-sec]' &&
            child['data-plank-target-sec'] != null
          ) {
            results.push(child);
          }
          visit(child);
        });
      };
      visit(this);
      return results;
    },
    setAttribute(name, value) {
      this[name] = value;
    },
    getAttribute(name) {
      return this[name];
    },
    removeAttribute(name) {
      delete this[name];
    },
  };
  return element;
}

test('createSessionUi updates status badge text and class', () => {
  const refs = {
    statusBadge: createElementStub(),
    liveScoreEl: createElementStub(),
    scoreBreakdownEl: createElementStub(),
    alertContainer: createElementStub(),
    alertTitle: createElementStub(),
    alertMessage: createElementStub(),
    repCountEl: createElementStub(),
    repCountLabelEl: createElementStub(),
    plankTargetHint: createElementStub(),
    plankTargetReadoutEl: createElementStub(),
    timerLabelEl: createElementStub(),
    scoreModeLabelEl: createElementStub(),
    startBtn: createElementStub(),
  };

  const ui = createSessionUi({
    refs,
    createElement: () => createElementStub(),
    formatClock: (value) => `00:${String(value).padStart(2, '0')}`,
  });

  ui.updateStatus('running', '운동 중');

  assert.equal(refs.statusBadge.className, 'status running');
  assert.equal(refs.statusBadge.textContent, '운동 중');
});

test('syncPlankTargetUi reflects target time in hint and readout', () => {
  const refs = {
    statusBadge: createElementStub(),
    liveScoreEl: createElementStub(),
    scoreBreakdownEl: createElementStub(),
    alertContainer: createElementStub(),
    alertTitle: createElementStub(),
    alertMessage: createElementStub(),
    repCountEl: createElementStub(),
    repCountLabelEl: createElementStub(),
    plankTargetHint: createElementStub(),
    plankTargetReadoutEl: createElementStub(),
    timerLabelEl: createElementStub(),
    scoreModeLabelEl: createElementStub(),
    startBtn: createElementStub(),
    plankTargetSelectRoot: createElementStub(),
    plankTargetInput: createElementStub(),
  };

  refs.plankTargetSelectRoot.querySelectorAll = () => [];

  const ui = createSessionUi({
    refs,
    createElement: () => createElementStub(),
    formatClock: (value) => `00:${String(value).padStart(2, '0')}`,
  });

  ui.syncPlankTargetUi({
    isPlank: true,
    isRoutinePlank: false,
    showFreeTargetUi: true,
    targetSec: 30,
    canStart: true,
    phase: 'PREPARING',
  });

  assert.equal(refs.plankTargetReadoutEl.textContent, '30초');
  assert.equal(refs.scoreModeLabelEl.textContent, '현재 자세 상태');
  assert.equal(refs.timerLabelEl.textContent, '플랭크 시간');
});

test('updateLearnCounterDisplay switches labels for learn mode', () => {
  const refs = {
    repCountEl: createElementStub(),
    repCountLabelEl: createElementStub(),
    scoreModeLabelEl: createElementStub(),
    setCountEl: createElementStub(),
    setCountLabelEl: createElementStub(),
    startBtn: createElementStub(),
    timerLabelEl: createElementStub(),
  };

  const ui = createSessionUi({
    refs,
    createElement: () => createElementStub(),
    formatClock: (value) => `00:${String(value).padStart(2, '0')}`,
  });

  ui.updateLearnCounterDisplay({
    currentStep: 2,
    totalSteps: 4,
  });

  assert.equal(refs.repCountLabelEl.textContent, '현재 step');
  assert.equal(refs.repCountEl.textContent, '2');
  assert.equal(refs.setCountLabelEl.textContent, '전체 step');
  assert.equal(refs.setCountEl.textContent, '4');
  assert.equal(refs.scoreModeLabelEl.textContent, '현재 step 진행률');
  assert.equal(refs.timerLabelEl.textContent, '학습 시간');
  assert.equal(refs.startBtn.textContent, '학습 시작');
});

test('updateLearnCard renders learn step details and checklist', () => {
  const refs = {
    learnCardEl: createElementStub(),
    learnStepCounterEl: createElementStub(),
    learnStepTitleEl: createElementStub(),
    learnStepBadgeEl: createElementStub(),
    learnStepInstructionEl: createElementStub(),
    learnHoldProgressBarEl: createElementStub(),
    learnHoldProgressTextEl: createElementStub(),
    learnStepHintsEl: createElementStub(),
    learnStepChecksEl: createElementStub(),
    learnStepStatusEl: createElementStub(),
  };

  const ui = createSessionUi({
    refs,
    createElement: () => createElementStub(),
    formatClock: (value) => `00:${String(value).padStart(2, '0')}`,
  });

  ui.updateLearnCard({
    visible: true,
    stepIndex: 1,
    totalSteps: 4,
    title: '최저점 만들기',
    badge: '하강',
    instruction: '천천히 깊이를 만들어주세요.',
    hints: ['무릎과 발끝 방향을 맞춰주세요.'],
    checks: [
      { label: '깊이를 만들었어요', passed: true, progress: 1 },
      { label: '상체가 무너지지 않았어요', passed: false, progress: 0.4 },
    ],
    holdProgressPercent: 65,
    statusText: '좋아요. 조금만 더 유지해주세요.',
  });

  assert.equal(refs.learnCardEl.hidden, false);
  assert.equal(refs.learnStepCounterEl.textContent, 'Step 2 / 4');
  assert.equal(refs.learnStepTitleEl.textContent, '최저점 만들기');
  assert.equal(refs.learnStepBadgeEl.textContent, '하강');
  assert.equal(refs.learnStepInstructionEl.textContent, '천천히 깊이를 만들어주세요.');
  assert.equal(refs.learnHoldProgressBarEl.style.width, '65%');
  assert.equal(refs.learnHoldProgressTextEl.textContent, '65%');
  assert.match(refs.learnStepHintsEl.innerHTML, /무릎과 발끝 방향을 맞춰주세요/);
  assert.match(refs.learnStepChecksEl.innerHTML, /깊이를 만들었어요/);
  assert.match(refs.learnStepChecksEl.innerHTML, /40%/);
  assert.equal(refs.learnStepStatusEl.textContent, '좋아요. 조금만 더 유지해주세요.');
});

test('setupRoutineProgressUi composes the routine progress DOM and updates step chips', () => {
  const card = createElementStub();
  const progressTrack = createElementStub();
  const labelEl = createElementStub();
  labelEl.textContent = '루틴 진행';

  const refs = {
    routineProgressEl: createElementStub(),
    routineStepEl: createElementStub(),
  };

  refs.routineProgressEl.closest = () => card;
  refs.routineProgressEl.parentElement = progressTrack;
  card.querySelector = () => labelEl;

  const ui = createSessionUi({
    refs,
    createElement: () => createElementStub(),
    formatClock: (value) => `00:${String(value).padStart(2, '0')}`,
  });

  ui.setupRoutineProgressUi({
    steps: [
      { exerciseName: '스쿼트', targetSummary: '목표 10회 x 3세트' },
      { exerciseName: '플랭크', targetSummary: '목표 30초 x 2세트' },
    ],
  });

  ui.updateRoutineStepDisplay({
    currentExerciseName: '플랭크',
    progressPercent: 50,
    stepIndex: 1,
    targetSummary: '목표 30초 x 2세트',
    totalSteps: 2,
  });

  assert.equal(card.dataset.enhanced, 'true');
  assert.equal(refs.routineStepListEl.children.length, 2);
  assert.equal(refs.routineCurrentExerciseEl.textContent, '플랭크');
  assert.equal(refs.routineProgressEl.style.width, '50%');
  assert.equal(
    refs.routineStepListEl.children[1].getAttribute('aria-current'),
    'step',
  );
});

test('updatePlankRuntimeDisplay updates plank runtime panels', () => {
  const refs = {
    plankBestHoldEl: createElementStub(),
    plankCurrentHoldEl: createElementStub(),
    plankGoalLabelEl: createElementStub(),
    plankPhaseInfoEl: createElementStub(),
    plankProgressEl: createElementStub(),
    plankRuntimePanelEl: createElementStub(),
    plankSegmentLabelEl: createElementStub(),
    plankStateLabelEl: createElementStub(),
    plankTargetReadoutEl: createElementStub(),
    plankTimerPanelEl: createElementStub(),
  };

  const ui = createSessionUi({
    refs,
    createElement: () => createElementStub(),
    formatClock: (value) => `00:${String(value).padStart(2, '0')}`,
  });

  ui.updatePlankRuntimeDisplay({
    bestHoldSec: 18,
    currentSegmentSec: 12,
    goalReached: false,
    isPlank: true,
    phase: 'HOLDING',
    progressPercent: 60,
    targetSec: 30,
  });

  assert.equal(refs.plankRuntimePanelEl.hidden, false);
  assert.equal(refs.plankTimerPanelEl.hidden, false);
  assert.equal(refs.plankCurrentHoldEl.textContent, '00:12');
  assert.equal(refs.plankBestHoldEl.textContent, '00:18');
  assert.equal(refs.plankGoalLabelEl.textContent, '12초 남음');
  assert.equal(refs.plankProgressEl.style.width, '60%');
});

test('updateVoiceFeedbackToggle reflects enabled and unsupported states', () => {
  const refs = {
    voiceFeedbackToggle: createElementStub(),
    voiceFeedbackStatus: createElementStub(),
    voiceFeedbackHint: createElementStub(),
  };

  const ui = createSessionUi({
    refs,
    createElement: () => createElementStub(),
    formatClock: (value) => `00:${String(value).padStart(2, '0')}`,
  });

  ui.updateVoiceFeedbackToggle({
    enabled: true,
    supported: true,
  });

  assert.equal(refs.voiceFeedbackToggle.textContent, '켜짐');
  assert.equal(refs.voiceFeedbackToggle.disabled, false);
  assert.equal(refs.voiceFeedbackStatus.textContent, '음성 피드백 켜짐');
  assert.equal(refs.voiceFeedbackHint.textContent, '운동 중 주요 피드백을 음성으로 안내합니다.');

  ui.updateVoiceFeedbackToggle({
    enabled: false,
    supported: false,
  });

  assert.equal(refs.voiceFeedbackToggle.textContent, '미지원');
  assert.equal(refs.voiceFeedbackToggle.disabled, true);
  assert.equal(refs.voiceFeedbackStatus.textContent, '음성 피드백 미지원');
  assert.equal(refs.voiceFeedbackHint.textContent, '이 브라우저에서는 음성 피드백을 사용할 수 없습니다.');
});

test('updateScoreDisplay renders workout grade labels instead of numeric score', () => {
  const refs = {
    liveScoreEl: createElementStub(),
    scoreBreakdownEl: createElementStub(),
  };

  const ui = createSessionUi({
    refs,
    createElement: () => createElementStub(),
    formatClock: (value) => `00:${String(value).padStart(2, '0')}`,
  });

  ui.updateScoreDisplay({
    score: 86,
    displayAsGrade: true,
    breakdown: [],
  });

  assert.equal(refs.liveScoreEl.textContent, '좋음');
  assert.doesNotMatch(refs.liveScoreEl.textContent, /86/);
});

test('updateScoreDisplay maps workout grades to good normal and correction labels', () => {
  const refs = {
    liveScoreEl: createElementStub(),
    scoreBreakdownEl: createElementStub(),
  };

  const ui = createSessionUi({
    refs,
    createElement: () => createElementStub(),
    formatClock: (value) => `00:${String(value).padStart(2, '0')}`,
  });

  ui.updateScoreDisplay({ score: 80, displayAsGrade: true });
  assert.equal(refs.liveScoreEl.textContent, '좋음');

  ui.updateScoreDisplay({ score: 50, displayAsGrade: true });
  assert.equal(refs.liveScoreEl.textContent, '보통');

  ui.updateScoreDisplay({ score: 49, displayAsGrade: true });
  assert.equal(refs.liveScoreEl.textContent, '교정 필요');

  ui.updateScoreDisplay({ score: 0, displayAsGrade: true });
  assert.equal(refs.liveScoreEl.textContent, '--');
});

test('updateScoreDisplay renders breakdown grade labels when displayAsGrade is true', () => {
  const refs = {
    liveScoreEl: createElementStub(),
    scoreBreakdownEl: createElementStub(),
  };

  const ui = createSessionUi({
    refs,
    createElement: () => createElementStub(),
    formatClock: (value) => `00:${String(value).padStart(2, '0')}`,
  });

  ui.updateScoreDisplay({
    score: 74,
    displayAsGrade: true,
    breakdown: [
      { key: 'depth', title: '깊이', score: 91 },
      { key: 'knee', title: '무릎 정렬', score: 66 },
      { key: 'torso', title: '상체', score: 31 },
    ],
  });

  assert.match(refs.scoreBreakdownEl.innerHTML, /깊이/);
  assert.match(refs.scoreBreakdownEl.innerHTML, /좋음/);
  assert.match(refs.scoreBreakdownEl.innerHTML, /보통/);
  assert.match(refs.scoreBreakdownEl.innerHTML, /교정 필요/);
  assert.doesNotMatch(refs.scoreBreakdownEl.innerHTML, />91</);
  assert.doesNotMatch(refs.scoreBreakdownEl.innerHTML, />66</);
  assert.doesNotMatch(refs.scoreBreakdownEl.innerHTML, />31</);
});

test('updateScoreDisplay renders measurement unstable label for gated state', () => {
  const refs = {
    liveScoreEl: createElementStub(),
    scoreBreakdownEl: createElementStub(),
  };

  const ui = createSessionUi({
    refs,
    createElement: () => createElementStub(),
    formatClock: (value) => `00:${String(value).padStart(2, '0')}`,
  });

  ui.updateScoreDisplay({
    score: 0,
    displayAsGrade: true,
    gated: true,
    displayText: '측정 불안정',
    message: '몸 전체가 화면에 보이도록 조금 더 뒤로 가 주세요.',
  });

  assert.equal(refs.liveScoreEl.textContent, '측정 불안정');
  assert.match(refs.scoreBreakdownEl.innerHTML, /몸 전체가 화면에 보이도록/);
  assert.doesNotMatch(refs.liveScoreEl.textContent, /교정 필요/);
});

test('syncPlankTargetUi uses rep state label for non-plank workout', () => {
  const refs = {
    scoreModeLabelEl: createElementStub(),
    timerLabelEl: createElementStub(),
    startBtn: createElementStub(),
  };

  const ui = createSessionUi({
    refs,
    createElement: () => createElementStub(),
    formatClock: (value) => `00:${String(value).padStart(2, '0')}`,
  });

  ui.syncPlankTargetUi({
    isPlank: false,
    isRoutinePlank: false,
    showFreeTargetUi: false,
    targetSec: 0,
    canStart: true,
    phase: 'PREPARING',
  });

  assert.equal(refs.scoreModeLabelEl.textContent, '이번 rep 상태');
});
