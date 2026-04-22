# Session Controller Refactor — Design Spec

**Date:** 2026-04-23
**Status:** Approved
**Scope:** `public/js/workout/session-controller.js` only

---

## Core Design Sentence

> `session-controller.js` should remain the top-level workout-session orchestrator, while DOM rendering, routine progression policy, and session-side quality-gate helper logic move into focused modules with explicit interfaces.

---

## 1. Problem Statement

`public/js/workout/session-controller.js` has grown into a mixed-responsibility file. It currently owns:

- Session initialization and lifecycle flow
- Camera connection and frame-loop orchestration
- DOM lookup and direct UI rendering
- Plank-specific runtime UI behavior
- Routine step and set progression policy
- Session-side quality-gate tracking helpers
- Session persistence and abort handling

This creates four concrete problems:

1. **Responsibility mixing** — orchestration, rendering, and policy logic live in the same closure.
2. **Change coupling** — a UI change, a routine-rule change, and a frame-pipeline change all require editing the same file.
3. **Test friction** — logic that could be tested independently is trapped next to DOM and runtime side effects.
4. **Readability loss** — the file is too large to reason about as one unit, even though many parts are not intrinsically related.

The goal of this refactor is to reduce the controller to orchestration and move secondary responsibilities into dedicated modules without changing runtime behavior.

---

## 2. Selected Approach

Three options were considered:

1. **Minimal extraction**
   - Move only pure helpers and a few UI functions.
   - Lowest risk, but leaves most structural complexity in place.

2. **Responsibility-based decomposition**
   - Split the controller into orchestration, UI rendering, routine progression, and session-side quality-gate helpers.
   - Keeps runtime behavior intact while removing the main source of file growth.

3. **State-store redesign**
   - Introduce a dedicated state container and state-driven rendering model.
   - Architecturally cleaner, but broader than the current target and riskier for a first refactor.

This spec fixes **option 2**.

Reasoning:

- It addresses the real source of complexity, not only line count.
- It keeps the current runtime pipeline and public entry point intact.
- It avoids a larger architectural rewrite before the existing responsibilities are separated.

---

## 3. Target Architecture

After refactoring, the workout session client should be structured like this:

```
session-controller.js
    ├─ session-ui.js
    ├─ routine-session-manager.js
    └─ quality-gate-session.js
```

`session-controller.js` remains the top-level entry point and coordinates the pipeline. The extracted modules own specific responsibilities and do not reintroduce new global authority layers.

---

## 4. Module Boundaries

### 4.1 `session-controller.js`

`session-controller.js` remains responsible for:

- Initializing the session from `initSession(workoutData)`
- Creating and wiring `PoseEngine`, `ScoringEngine`, `RepCounter`, and `SessionBuffer`
- Connecting the camera source
- Starting and stopping the pose-detection loop
- Orchestrating the frame pipeline:
  - `poseEngine`
  - quality-gate helper
  - `scoringEngine`
  - `repCounter`
  - UI update
  - `sessionBuffer`
- Managing top-level lifecycle transitions:
  - start
  - pause/resume
  - finish
  - unload/abort handling

`session-controller.js` must stop owning detailed rendering policy, routine progression policy, and session-side quality-gate helper internals.

### 4.2 `session-ui.js`

`session-ui.js` owns direct DOM rendering and DOM-only behavior.

Candidate responsibilities to move:

- Routine progress DOM construction and refresh
- Primary counter display updates
- Plank target UI synchronization
- Plank runtime panel updates
- Score and breakdown rendering
- Alert/banner display
- Toast display
- Status/badge rendering

Representative functions currently in `session-controller.js`:

- `setupRoutineProgressUi()`
- `updatePrimaryCounterDisplay()`
- `updateRoutineStepDisplay()`
- `syncPlankTargetUi()`
- `updatePlankRuntimeDisplay()`
- `updateScoreDisplay()`
- `showAlert()`
- `showToast()`
- `updateStatus()`

Rules for `session-ui.js`:

- It may read DOM elements and mutate the DOM.
- It may receive `state`, `workoutData`, and already-computed display values.
- It must not call `fetch`.
- It must not decide session state transitions.
- It must not directly own `RepCounter` or `ScoringEngine` policy.

### 4.3 `routine-session-manager.js`

`routine-session-manager.js` owns routine progression policy and routine-specific server synchronization.

Candidate responsibilities to move:

- Current set reset logic
- Step reset logic
- Step switching
- Recording routine set completion to the server
- Determining next action:
  - next set
  - next exercise
  - routine complete

Representative functions currently in `session-controller.js`:

- `resetStepUiState()`
- `resetCurrentSetTracking()`
- `switchRoutineStep()`
- `recordRoutineSetCompletion()`
- `checkRoutineProgress()`
- `nextExercise()`

Rules for `routine-session-manager.js`:

- It may interpret server responses for routine progression.
- It may return explicit action results to the controller.
- It must not own direct DOM rendering.
- It must not become a second top-level controller.

### 4.4 `quality-gate-session.js`

`quality-gate-session.js` owns session-side quality-gate helper behavior only.

Candidate responsibilities to move:

- Withhold reason to user-facing message mapping
- Stable-frame tracker creation and updates
- Gate input construction from pose quality data
- Scoring suppression and resume checks

Representative functions currently in `session-controller.js`:

- `mapWithholdReasonToMessage()`
- `shouldResumeScoring()`
- `isFrameStable()`
- `createQualityGateTracker()`
- `updateQualityGateTracker()`
- `buildGateInputsFromPoseData()`
- `shouldSuppressScoring()`

Rules for `quality-gate-session.js`:

- It may track session-side gate suppression state.
- It may provide UX-facing messages.
- It must not own final gate authority.
- Final gate authority remains in `scoring-engine.js`.

---

## 5. Data Flow And Interfaces

The refactor does not introduce a new global store. The existing `state` object and engine instances inside `initSession()` remain the source of truth.

Extracted modules interact through explicit context objects and callbacks.

### 5.1 `session-ui.js`

Input:

- `state`
- `workoutData`
- DOM refs
- display-ready values

Output:

- none

Contract:

- Render only.
- No state-transition authority.
- No network authority.

### 5.2 `routine-session-manager.js`

Input:

- `state`
- `workoutData`
- `sessionBuffer`
- `repCounter`
- helper callbacks from controller
- optional UI callback hooks

Output:

- explicit result object such as:
  - `action`
  - `restSec`
  - `nextSessionId`
  - `nextStepIndex`

Contract:

- Resolve routine progression policy internally.
- Return decisions to the controller instead of mutating unrelated UI directly.

### 5.3 `quality-gate-session.js`

Input:

- `poseData`
- tracker state
- threshold
- selected view and allowed views context

Output:

- gate helper result object such as:
  - `suppress`
  - `reason`
  - `stabilityMetrics`
  - `gateInputs`

Contract:

- Session-side tracking only.
- No final `pass` / `withhold` ownership.

### 5.4 `session-controller.js`

Input:

- user events
- frame callbacks
- initial `workoutData`

Output:

- module invocations in correct order

Controller contract:

- It knows **when** each module is called.
- It no longer owns every detail of **how** those modules do their work.

---

## 6. Migration Plan

The refactor should be done incrementally, in this exact order:

1. **Extract `quality-gate-session.js`**
   - Lowest-risk step
   - Existing helper tests already align well with this boundary

2. **Extract `session-ui.js`**
   - Move rendering code while preserving behavior
   - Keep controller-owned state intact

3. **Extract `routine-session-manager.js`**
   - Move routine-specific policy and server response interpretation
   - Ensure controller receives explicit next-step actions

4. **Trim `session-controller.js` to orchestration**
   - Remove now-redundant internal helpers
   - Reorder remaining code around initialization, frame pipeline, and lifecycle

This migration order is fixed because it minimizes risk and preserves working behavior at each stage.

---

## 7. Verification Requirements

This refactor is behavior-preserving. Verification must focus on regression safety.

Required guarantees:

- `initSession()` remains the public entry point.
- Existing global exposure needed by the page continues to work.
- Session start, pause/resume, finish, and abort behavior remain unchanged.
- Quality-gate suppression and resume behavior remain unchanged.
- Routine set completion, rest transitions, next-step changes, and routine completion remain unchanged.
- Existing session save/export flow remains unchanged.

Verification expectations:

- Reuse current Node tests for quality-gate helpers where possible.
- Add focused tests for any extracted pure helper module.
- Run syntax checks for every new module.
- Perform at least one browser-level manual regression for:
  - free workout
  - routine workout
  - time-based workout such as plank

---

## 8. Non-Goals

This design explicitly does not include:

- Rewriting the workout runtime architecture
- Introducing React or a new frontend framework
- Replacing the current `state` object with a new store abstraction
- Redesigning the visual UI
- Changing score semantics, gate semantics, or rep-counting rules
- Refactoring the entire `public/js/workout/` directory in this step

---

## 9. Success Criteria

The refactor is successful when all of the following are true:

1. `session-controller.js` is materially smaller and centered on orchestration.
2. DOM rendering policy is isolated in `session-ui.js`.
3. Routine progression policy is isolated in `routine-session-manager.js`.
4. Session-side quality-gate helper logic is isolated in `quality-gate-session.js`.
5. Runtime behavior and page entry points remain compatible with the current implementation.
6. The resulting module boundaries are clear enough that future UI, routine, and gate-helper changes no longer require deep edits to `session-controller.js`.
