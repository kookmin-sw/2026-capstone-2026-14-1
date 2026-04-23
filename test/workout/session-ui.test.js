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
  assert.equal(refs.scoreModeLabelEl.textContent, '현재 자세 점수');
  assert.equal(refs.timerLabelEl.textContent, '플랭크 시간');
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
