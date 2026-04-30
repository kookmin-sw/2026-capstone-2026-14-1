# Workout Score Grade Display Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** 운동 세션 화면에서는 numeric score를 숨기고 `좋음 / 보통 / 교정 필요 / 측정 불안정` 상태를 표시하되, 내부 점수 계산·저장·History 기능은 그대로 유지한다.

**Architecture:** 이 계획은 2026-04-22 live-score-vs-rep-score UX spec의 2026-04-30 수정본을 구현한다. 점수 산출 파이프라인(`ScoringEngine`, `RepCounter`, `SessionBuffer`)은 변경하지 않고, `session-ui.js`와 `session-controller.js`의 표시 계층에서 numeric score를 grade label로 변환한다. History가 사용하는 `scoreTimeline`, `repRecords`, metric accumulator 구조는 수정하지 않는다.

**Tech Stack:** Node.js `node:test`, CommonJS browser-compatible modules, EJS session template, vanilla DOM UI, existing workout JS modules.

---

## 0. 배경 및 수정 근거

이 계획은 다음 문서의 수정 구현 계획이다.

- 원문 스펙: `docs/specs/2026-04-22-live-score-vs-rep-score-ux-spec.md`
- 4월 30일 수정 스펙: `docs/specs/2026-04-30-workout-score-grade-display-spec.md`

4월 22일 문서는 세션 화면에서 숫자 점수를 제거하고 상태 등급으로 대체하는 방향을 제시했다. 4월 30일 수정에서는 범위를 더 명확히 한다.

- 운동 중 UI: 숫자 점수 제거
- 내부 numeric score: 유지
- SessionBuffer 저장: 유지
- History 점수/그래프/rep breakdown: 유지
- `scoreRep()` 삭제 또는 scoring algorithm 통합: 이번 구현 범위 제외

---

## Task 1: Grade mapping helper and UI rendering

**TDD scenario:** Modifying tested code — run existing UI tests first, then add focused tests.

**Files:**
- Modify: `public/js/workout/session-ui.js`
- Test: `test/workout/session-ui.test.js`

**Step 1: Run existing UI tests**

Run:

```bash
node --test test/workout/session-ui.test.js
```

Expected: PASS before changes.

**Step 2: Add failing tests for grade mapping display**

Add tests to `test/workout/session-ui.test.js`.

```js
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
```

**Step 3: Run tests and verify failure**

Run:

```bash
node --test test/workout/session-ui.test.js
```

Expected: FAIL because `displayAsGrade` is not implemented yet.

**Step 4: Implement minimal grade helper in `session-ui.js`**

Add near `updateScoreDisplay()`:

```js
function mapScoreToWorkoutGrade(score) {
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore) || numericScore <= 0) {
    return { label: '--', tone: 'empty', color: '#94a3b8' };
  }
  if (numericScore >= 80) {
    return { label: '좋음', tone: 'good', color: '#22c55e' };
  }
  if (numericScore >= 50) {
    return { label: '보통', tone: 'normal', color: '#eab308' };
  }
  return { label: '교정 필요', tone: 'needs-correction', color: '#ef4444' };
}
```

Update `updateScoreDisplay()` signature:

```js
function updateScoreDisplay({
  score,
  displayText = score > 0 ? String(score) : '--',
  displayAsGrade = false,
  breakdown = [],
  gated = false,
  message = null,
  emptyMessage = '포즈 감지 중...',
  color = '#94a3b8',
}) {
  const grade = displayAsGrade ? mapScoreToWorkoutGrade(score) : null;
  const resolvedDisplayText = grade ? grade.label : displayText;
  const resolvedColor = grade ? grade.color : color;

  if (refs.liveScoreEl) {
    refs.liveScoreEl.textContent = resolvedDisplayText;
    refs.liveScoreEl.style.background = 'none';
    refs.liveScoreEl.style.webkitBackgroundClip = 'unset';
    refs.liveScoreEl.style.webkitTextFillColor = 'unset';
    refs.liveScoreEl.style.color = resolvedColor;
  }
  // keep rest of current function
}
```

Do not remove existing numeric mode because learn mode still uses `%` progress.

**Step 5: Run tests**

Run:

```bash
node --test test/workout/session-ui.test.js
```

Expected: PASS.

**Step 6: Commit**

```bash
git add public/js/workout/session-ui.js test/workout/session-ui.test.js
git commit -m "feat(workout): add workout score grade display helper"
```

---

## Task 2: Breakdown values use grade labels during workout mode

**TDD scenario:** New feature — full TDD cycle.

**Files:**
- Modify: `public/js/workout/session-ui.js`
- Test: `test/workout/session-ui.test.js`

**Step 1: Add failing test for breakdown grade labels**

Add:

```js
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
```

**Step 2: Run test and verify failure**

Run:

```bash
node --test test/workout/session-ui.test.js
```

Expected: FAIL because breakdown still renders numeric values.

**Step 3: Implement breakdown grade rendering**

In `updateScoreDisplay()`, replace the breakdown value rendering with conditional logic:

```js
refs.scoreBreakdownEl.innerHTML = breakdown
  .slice(0, 3)
  .map((item) => {
    const itemScore = item.score ?? item.normalizedScore ?? 0;
    const valueText = displayAsGrade
      ? mapScoreToWorkoutGrade(itemScore).label
      : String(Math.round(itemScore));

    return `
      <div class="score-item">
        <span>${item.title || item.key}</span>
        <span>${valueText}</span>
      </div>
    `;
  })
  .join('');
```

**Step 4: Run tests**

Run:

```bash
node --test test/workout/session-ui.test.js
```

Expected: PASS.

**Step 5: Commit**

```bash
git add public/js/workout/session-ui.js test/workout/session-ui.test.js
git commit -m "feat(workout): render workout breakdown as grade labels"
```

---

## Task 3: Session controller uses grade mode for workout scores only

**TDD scenario:** Modifying tested code — add static seam tests because full DOM/session runtime setup is expensive.

**Files:**
- Modify: `public/js/workout/session-controller.js`
- Test: `test/workout/session-controller-seam.test.js`

**Step 1: Add failing seam test**

Add to `test/workout/session-controller-seam.test.js`:

```js
test('session-controller workout score display requests grade mode', () => {
  const source = fs.readFileSync(controllerPath, 'utf8');

  assert.match(
    source,
    /ui\.updateScoreDisplay\(\{[\s\S]*displayAsGrade:\s*true[\s\S]*score:\s*displayScore/,
    'workout updateScoreDisplay should pass displayAsGrade: true with the numeric score still supplied',
  );
});

test('session-controller learn score display keeps percentage text instead of workout grades', () => {
  const source = fs.readFileSync(controllerPath, 'utf8');

  assert.match(source, /displayText:\s*`\$\{displayScore\}%`/);
  assert.doesNotMatch(
    source,
    /renderLearnScoreDisplay[\s\S]*displayAsGrade:\s*true/,
    'learn mode should keep progress percentage display',
  );
});
```

**Step 2: Run test and verify failure**

Run:

```bash
node --test test/workout/session-controller-seam.test.js
```

Expected: first new test FAILS because `displayAsGrade: true` is not passed.

**Step 3: Update workout score display calls**

In `public/js/workout/session-controller.js`, inside `function updateScoreDisplay(scoreResult)`, update both `ui.updateScoreDisplay()` calls to include grade mode.

For the breakdown branch:

```js
ui.updateScoreDisplay({
  breakdown,
  color,
  displayAsGrade: true,
  displayText,
  score: displayScore,
});
```

For the empty/gated branch:

```js
ui.updateScoreDisplay({
  color,
  displayAsGrade: !scoreResult.gated,
  emptyMessage:
    scoreResult.score === 0
      ? '포즈 감지 중...'
      : 'rep 시작하면 표시됩니다',
  gated: scoreResult.gated,
  message: scoreResult.message,
  displayText,
  score: displayScore,
});
```

Keep `renderLearnScoreDisplay()` unchanged so learn mode still shows `%`.

**Step 4: Run seam tests**

Run:

```bash
node --test test/workout/session-controller-seam.test.js
```

Expected: PASS.

**Step 5: Run UI tests too**

Run:

```bash
node --test test/workout/session-ui.test.js test/workout/session-controller-seam.test.js
```

Expected: PASS.

**Step 6: Commit**

```bash
git add public/js/workout/session-controller.js test/workout/session-controller-seam.test.js
git commit -m "feat(workout): show workout scores as grades in session controller"
```

---

## Task 4: Quality gate withhold renders measurement state, not correction grade

**TDD scenario:** New feature — focused UI test.

**Files:**
- Modify: `public/js/workout/session-ui.js`
- Modify: `public/js/workout/session-controller.js`
- Test: `test/workout/session-ui.test.js`

**Step 1: Add failing UI test**

Add:

```js
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
```

**Step 2: Run test and verify failure if current code overrides gated display**

Run:

```bash
node --test test/workout/session-ui.test.js
```

Expected: FAIL if `displayAsGrade` maps score 0 to `--` and ignores gated display text.

**Step 3: Make gated display explicit**

In `session-ui.js`, resolve display text so an explicit `displayText` wins for gated states:

```js
const hasExplicitDisplayText = displayText != null;
const grade = displayAsGrade && !(gated && hasExplicitDisplayText)
  ? mapScoreToWorkoutGrade(score)
  : null;
const resolvedDisplayText = grade ? grade.label : displayText;
```

In `session-controller.js`, withhold branch in `handlePoseDetected()` should call:

```js
updateScoreDisplay({
  score: 0,
  breakdown: [],
  gated: true,
  displayText: '측정 불안정',
  message: mapGateWithholdReasonToMessage(suppression.reason),
});
```

Also update the local controller wrapper `function updateScoreDisplay(scoreResult)` so an explicit display text is preserved:

```js
const displayText = scoreResult.displayText || (
  !isTimeBased && !hasAnyRep && !isRepInProgress
    ? '--'
    : String(displayScore)
);
```

This keeps withhold separate from `교정 필요` and ensures the explicit `측정 불안정` label reaches `session-ui.js`.

**Step 4: Run tests**

Run:

```bash
node --test test/workout/session-ui.test.js test/workout/session-controller-seam.test.js
```

Expected: PASS.

**Step 5: Commit**

```bash
git add public/js/workout/session-ui.js public/js/workout/session-controller.js test/workout/session-ui.test.js
git commit -m "feat(workout): separate measurement instability from correction grade"
```

---

## Task 5: Update score card labels from score language to state language

**TDD scenario:** Trivial UI copy change — use focused static assertions.

**Files:**
- Modify: `views/workout/session.ejs`
- Modify: `public/js/workout/session-ui.js`
- Test: `test/workout/session-ui.test.js`

**Step 1: Add UI label test for plank/free workout labels**

In `test/workout/session-ui.test.js`, update the existing `syncPlankTargetUi reflects target time in hint and readout` expectation.

Current expected value:

```js
assert.equal(refs.scoreModeLabelEl.textContent, '현재 자세 점수');
```

Change to:

```js
assert.equal(refs.scoreModeLabelEl.textContent, '현재 자세 상태');
```

Add one more assertion for non-plank:

```js
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
```

**Step 2: Run test and verify failure**

Run:

```bash
node --test test/workout/session-ui.test.js
```

Expected: FAIL because labels still say `점수`.

**Step 3: Update labels in `session-ui.js`**

In `syncPlankTargetUi()`:

```js
refs.scoreModeLabelEl.textContent = isPlank ? '현재 자세 상태' : '이번 rep 상태';
```

Do not change `updateLearnCounterDisplay()`; learn mode remains `현재 step 진행률`.

**Step 4: Update initial EJS copy**

In `views/workout/session.ejs`, change the score card initial label:

```ejs
<span class="muted" id="scoreModeLabel"><%= isLearnMode ? '현재 step 진행률' : (isPlankExercise ? '현재 자세 상태' : '이번 rep 상태') %></span>
```

Keep `id="liveScore"` unchanged.

**Step 5: Run tests**

Run:

```bash
node --test test/workout/session-ui.test.js
```

Expected: PASS.

**Step 6: Commit**

```bash
git add views/workout/session.ejs public/js/workout/session-ui.js test/workout/session-ui.test.js
git commit -m "chore(workout): rename workout score labels to state labels"
```

---

## Task 6: Rep completion feedback is grade-centered and does not expose numeric score

**TDD scenario:** Modifying tested code — static seam test plus minimal string assertions.

**Files:**
- Modify: `public/js/workout/session-controller.js`
- Test: `test/workout/session-controller-seam.test.js`

**Step 1: Add failing seam test**

Add:

```js
test('rep completion feedback uses grade labels without numeric score interpolation', () => {
  const source = fs.readFileSync(controllerPath, 'utf8');

  assert.match(source, /function getWorkoutGradeLabel/);
  assert.match(source, /1회 완료 ·/);
  assert.doesNotMatch(
    source,
    /message:\s*`\$\{repRecord\.repNumber\}회 \$\{repRecord\.score\}/,
    'rep completion feedback must not interpolate numeric rep score',
  );
});
```

**Step 2: Run test and verify failure**

Run:

```bash
node --test test/workout/session-controller-seam.test.js
```

Expected: FAIL because helper does not exist yet.

**Step 3: Add controller grade label helper**

In `session-controller.js`, near `showRepFeedback()`:

```js
function getWorkoutGradeLabel(score) {
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore) || numericScore <= 0) return '--';
  if (numericScore >= 80) return '좋음';
  if (numericScore >= 50) return '보통';
  return '교정 필요';
}
```

**Step 4: Update `showRepFeedback()` message**

Replace message construction with grade-centered copy:

```js
function showRepFeedback(repRecord) {
  const gradeLabel = getWorkoutGradeLabel(repRecord.score);
  const msg = repRecord.feedback || `${gradeLabel}`;
  const message = repRecord.feedback
    ? `${repRecord.repNumber}회 완료 · ${gradeLabel} · ${msg}`
    : `${repRecord.repNumber}회 완료 · ${gradeLabel}`;

  const event = createFeedbackEvent({
    type: 'REP_COMPLETE_FEEDBACK',
    message,
    repRecord,
    severity: repRecord.score >= 80 ? 'success' : 'info',
    source: 'rep_complete',
  });

  deliverFeedbackEvent(event, {
    toast: true,
  });
}
```

Do not remove `repRecord.score`; it is still stored and used for severity.

**Step 5: Run seam tests**

Run:

```bash
node --test test/workout/session-controller-seam.test.js
```

Expected: PASS.

**Step 6: Commit**

```bash
git add public/js/workout/session-controller.js test/workout/session-controller-seam.test.js
git commit -m "feat(workout): use grade labels in rep completion feedback"
```

---

## Task 7: Verify SessionBuffer and History data remain numeric

**TDD scenario:** Regression test — assert existing persistence behavior remains unchanged.

**Files:**
- Test: `test/session-buffer.test.js`

**Step 1: Inspect existing SessionBuffer tests**

Run:

```bash
node --test test/session-buffer.test.js
```

Expected: PASS.

**Step 2: Add explicit regression test**

Add to `test/session-buffer.test.js`:

```js
test('score grade UI change does not alter numeric score timeline or rep records', () => {
  const buffer = new SessionBuffer('grade-ui-regression', {
    exerciseCode: 'squat',
    selectedView: 'SIDE',
  });

  buffer.lastScoreTime = Date.now() - 1000;
  buffer.addScore({
    score: 87,
    breakdown: [
      { key: 'depth', title: '깊이', score: 9, maxScore: 10, rawValue: 92 },
    ],
  });

  buffer.addRep({
    repNumber: 1,
    score: 73,
    breakdown: [
      { key: 'depth', title: '깊이', score: 73, maxScore: 100 },
    ],
  });

  const exported = buffer.export();

  assert.equal(buffer.scoreTimeline[0].score, 87);
  assert.equal(buffer.repRecords[0].score, 73);
  assert.equal(exported.interim_snapshots[0].score, 87);
  assert.equal(exported.final_score, 73);
});
```

The assertion target must be the existing `SessionBuffer` and `export()` shape. Do not add new export fields for this UI-only change.

**Step 3: Run test**

Run:

```bash
node --test test/session-buffer.test.js
```

Expected: PASS. If it fails because property names differ, update assertions to match current export shape only; do not change `SessionBuffer` unless a real regression is found.

**Step 4: Run full test suite**

Run:

```bash
npm test
```

Expected: all tests PASS.

**Step 5: Commit**

```bash
git add test/session-buffer.test.js
git commit -m "test(workout): preserve numeric history data for grade UI change"
```

---

## Task 8: Final verification and documentation link update

**TDD scenario:** Documentation and verification — no production code behavior change.

**Files:**
- Modify: `docs/specs/2026-04-22-live-score-vs-rep-score-ux-spec.md` only if the team wants a backlink
- Modify: `docs/plans/2026-04-22-live-score-vs-rep-score-ux-plan.md` only if the team wants a backlink
- Verify: `docs/specs/2026-04-30-workout-score-grade-display-spec.md`
- Verify: `docs/plans/2026-04-30-workout-score-grade-display-plan.md`

**Step 1: Run full tests**

Run:

```bash
npm test
```

Expected: PASS.

**Step 2: Manually verify no numeric score is intentionally rendered in workout session UI**

Search:

```bash
rg -n "이번 rep 점수|현재 자세 점수|displayAsGrade|liveScore|scoreBreakdown" public/js/workout views/workout test
```

Expected:

- No active user-facing label says `이번 rep 점수` or `현재 자세 점수`.
- Workout score display calls include `displayAsGrade: true`.
- Learn mode can still render `%` progress.

**Step 3: Verify numeric storage still exists**

Search:

```bash
rg -n "addScore|addRep|calculateAvgRepScore|interim_snapshots|metric_results|final_score" public/js/workout test
```

Expected:

- `SessionBuffer.addScore()` remains numeric.
- `SessionBuffer.addRep()` remains numeric.
- Existing History/export fields such as `interim_snapshots`, `metric_results`, and `final_score` were not renamed for this UI-only change.

**Step 4: Optional backlink in 4월 22일 documents**

If desired, add a short note near the top of the 4월 22일 spec/plan:

```md
> 2026-04-30 수정본: 운동 중 UI만 등급화하고 내부 점수/History 기능은 유지하는 방향으로 범위를 재정의했다. See `2026-04-30-workout-score-grade-display-spec.md`.
```

Only do this if the team wants older docs to point to the new docs. The 4월 30일 spec/plan already state that they are revisions of the 4월 22일 spec.

**Step 5: Final commit if docs backlink changed**

```bash
git add docs/specs/2026-04-22-live-score-vs-rep-score-ux-spec.md docs/plans/2026-04-22-live-score-vs-rep-score-ux-plan.md
git commit -m "docs(workout): link score grade display revision"
```

---

## Completion checklist

- [x] Workout session main score no longer displays numeric values.
- [x] Workout session main score displays `좋음 / 보통 / 교정 필요`.
- [x] Quality gate withhold displays measurement state, not correction grade.
- [x] Workout breakdown no longer exposes numeric score values during exercise.
- [x] Learn mode still displays step progress percentage.
- [x] SessionBuffer numeric timeline and rep records are unchanged.
- [x] History/export data shape is unchanged.
- [x] `npm test` passes. (135 tests, 0 failures — 2026-04-30 verified)
