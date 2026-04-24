# 운동 시작 전 온보딩/가이드 개선 Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** 운동 세션 시작 전 준비 화면에 운동별 가이드, 준비 체크리스트, 3초 카운트다운을 추가하여 사용자가 올바른 환경과 자세를 갖추고 시작할 수 있도록 한다.

**Architecture:** `session.ejs`에 EJS 조건문으로 운동별 가이드/체크리스트 정적 UI를 추가하고, `session-controller.js`의 `startWorkout()` 흐름에 `runStartCountdown()` async helper를 삽입하여 타이머/포즈 감지를 카운트다운 이후로 지연시킨다. 스타일은 `public/workout.css`에 기존 패널/card 스타일과 일관되게 추가한다.

**Tech Stack:** EJS templates, vanilla JS (session-controller.js), CSS (workout.css)

---

### Task 1: EJS 템플릿에 운동별 가이드 박스 + 준비 체크리스트 추가

**TDD scenario:** Trivial UI markup change — 구현 후 수동 브라우저 확인

**Files:**
- Modify: `views/workout/session.ejs:129-130` (카메라 안내 뒤, 채점 자세 선택 앞)

**Step 1: `camera-privacy-notice` 뒤에 운동별 가이드 박스 마크업 추가**

`session.ejs`의 `camera-privacy-notice` div 닫힘 뒤, `viewSelect` div 앞에 아래 마크업을 삽입한다.

```html
<!-- 운동별 시작 가이드 -->
<div class="exercise-guide-panel" id="exerciseGuidePanel" aria-label="운동 시작 가이드">
  <strong class="exercise-guide-title">운동 시작 가이드</strong>

  <% if (exerciseCode === 'squat') { %>
  <div class="exercise-guide-cards">
    <div class="exercise-guide-card exercise-guide-card--good">
      <span class="exercise-guide-card-label">좋은 자세</span>
      <ul>
        <li>발은 어깨너비 정도로 벌린다.</li>
        <li>무릎은 발끝 방향과 비슷하게 향하게 한다.</li>
        <li>엉덩이를 뒤로 빼며 앉는다.</li>
        <li>가능한 범위에서 허벅지가 바닥과 가까워지도록 내려간다.</li>
      </ul>
    </div>
    <div class="exercise-guide-card exercise-guide-card--bad">
      <span class="exercise-guide-card-label">주의할 자세</span>
      <ul>
        <li>무릎이 안쪽으로 모이지 않게 한다.</li>
        <li>상체가 과도하게 앞으로 숙여지지 않게 한다.</li>
        <li>뒤꿈치가 들리지 않게 한다.</li>
        <li>너무 얕게 앉으면 반복 인식이 부정확할 수 있다.</li>
      </ul>
    </div>
  </div>
  <% } else if (exerciseCode === 'push-up' || exerciseCode === 'pushup') { %>
  <div class="exercise-guide-cards">
    <div class="exercise-guide-card exercise-guide-card--good">
      <span class="exercise-guide-card-label">좋은 자세</span>
      <ul>
        <li>손은 어깨보다 약간 넓게 둔다.</li>
        <li>머리부터 발끝까지 몸통을 일직선으로 유지한다.</li>
        <li>팔꿈치를 굽혀 가슴이 바닥에 가까워질 때까지 내려간다.</li>
        <li>올라올 때 몸 전체가 함께 움직이게 한다.</li>
      </ul>
    </div>
    <div class="exercise-guide-card exercise-guide-card--bad">
      <span class="exercise-guide-card-label">주의할 자세</span>
      <ul>
        <li>허리가 처지거나 엉덩이가 과하게 들리지 않게 한다.</li>
        <li>목만 앞으로 빼지 않는다.</li>
        <li>팔을 너무 좁거나 넓게 짚지 않는다.</li>
        <li>내려가는 깊이가 너무 얕으면 반복 인식이 부정확할 수 있다.</li>
      </ul>
    </div>
  </div>
  <% } else if (exerciseCode === 'plank') { %>
  <div class="exercise-guide-cards">
    <div class="exercise-guide-card exercise-guide-card--good">
      <span class="exercise-guide-card-label">좋은 자세</span>
      <ul>
        <li>팔꿈치는 어깨 아래에 위치시킨다.</li>
        <li>머리, 등, 엉덩이, 발뒤꿈치가 일직선이 되게 한다.</li>
        <li>복부에 힘을 주고 자세를 유지한다.</li>
        <li>목표 시간 동안 호흡을 유지한다.</li>
      </ul>
    </div>
    <div class="exercise-guide-card exercise-guide-card--bad">
      <span class="exercise-guide-card-label">주의할 자세</span>
      <ul>
        <li>허리가 아래로 처지지 않게 한다.</li>
        <li>엉덩이가 과하게 위로 들리지 않게 한다.</li>
        <li>어깨가 팔꿈치보다 너무 앞이나 뒤로 밀리지 않게 한다.</li>
        <li>화면에서 몸 일부가 잘리면 자세 판정이 부정확할 수 있다.</li>
      </ul>
    </div>
  </div>
  <% } else { %>
  <div class="exercise-guide-cards">
    <div class="exercise-guide-card exercise-guide-card--good">
      <span class="exercise-guide-card-label">좋은 자세</span>
      <ul>
        <li>전신이 화면에 잘 들어오게 위치를 조정하세요.</li>
        <li>선택한 채점 자세에 맞게 몸을 카메라 방향으로 맞추세요.</li>
        <li>천천히 정확한 자세로 움직이세요.</li>
      </ul>
    </div>
    <div class="exercise-guide-card exercise-guide-card--bad">
      <span class="exercise-guide-card-label">주의할 자세</span>
      <ul>
        <li>화면 밖으로 몸이 벗어나지 않게 하세요.</li>
        <li>너무 빠르게 움직이면 인식이 불안정할 수 있습니다.</li>
        <li>주변에 부딪힐 물건이 없는지 확인하세요.</li>
      </ul>
    </div>
  </div>
  <% } %>
</div>

<!-- 준비 체크리스트 -->
<div class="preparation-checklist" id="preparationChecklist" aria-label="운동 시작 전 확인 사항">
  <strong class="preparation-checklist-title">운동 시작 전 확인</strong>
  <ul class="preparation-checklist-items">
    <li>
      <label>
        <input type="checkbox" disabled />
        전신이 화면에 들어왔나요?
      </label>
    </li>
    <li>
      <label>
        <input type="checkbox" disabled />
        주변에 부딪힐 물건이 없나요?
      </label>
    </li>
    <li>
      <label>
        <input type="checkbox" disabled />
        조명이 충분하고 몸이 잘 보이나요?
      </label>
    </li>
    <li>
      <label>
        <input type="checkbox" disabled />
        선택한 채점 자세에 맞게 서 있나요?
      </label>
    </li>
  </ul>
</div>
```

**중요:** EJS 템플릿 상단 `<%` 블록에서 `exerciseCode`를 선언해야 한다.

기존 상단에:

```js
const isPlankExercise = String(currentExercise?.code || '').trim().toLowerCase() === 'plank';
```

이미 있으므로, 아래를 추가한다:

```js
const exerciseCode = String(currentExercise?.code || '').trim().toLowerCase();
```

**Step 2: 브라우저에서 확인**

스쿼트 세션 페이지 접속 → 가이드 박스 표시 확인, 푸쉬업/plank 페이지도 각각 확인.

**Step 3: Commit**

```bash
git add views/workout/session.ejs
git commit -m "feat(session): add exercise guide and preparation checklist to setup panel"
```

---

### Task 2: 가이드 박스 + 체크리스트 CSS 스타일 추가

**TDD scenario:** Trivial UI styling — 구현 후 브라우저 확인

**Files:**
- Modify: `public/workout.css` (`.camera-privacy-notice` 블록 뒤에 추가)

**Step 1: 아래 CSS를 `public/workout.css`에 추가**

`.camera-privacy-notice p` 블록 뒤에 추가한다:

```css
/* 운동별 시작 가이드 패널 */
.exercise-guide-panel {
  display: grid;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid var(--workout-border);
  background: var(--workout-panel-bg);
}

.exercise-guide-title {
  font-size: 13px;
}

.exercise-guide-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

@media (max-width: 640px) {
  .exercise-guide-cards {
    grid-template-columns: 1fr;
  }
}

.exercise-guide-card {
  display: grid;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 12px;
}

.exercise-guide-card--good {
  background: rgba(16, 185, 129, 0.08);
  border: 1px solid rgba(16, 185, 129, 0.2);
}

.exercise-guide-card--bad {
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.2);
}

.exercise-guide-card-label {
  font-weight: 600;
  font-size: 12px;
}

.exercise-guide-card ul {
  margin: 0;
  padding-left: 16px;
  display: grid;
  gap: 3px;
}

.exercise-guide-card li {
  line-height: 1.4;
}

/* 준비 체크리스트 */
.preparation-checklist {
  display: grid;
  gap: 8px;
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid var(--workout-border);
  background: var(--workout-panel-bg);
}

.preparation-checklist-title {
  font-size: 13px;
}

.preparation-checklist-items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 4px;
}

.preparation-checklist-items label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  cursor: pointer;
}

.preparation-checklist-items input[type="checkbox"] {
  width: 15px;
  height: 15px;
  accent-color: #2563eb;
}
```

**Step 2: 다크 모드 확인**

기존 `.camera-privacy-notice`처럼 `--workout-*` CSS 변수를 사용하므로 다크 모드에서 자동 대응된다. 브라우저에서 다크 모드 토글 후 확인.

**Step 3: Commit**

```bash
git add public/workout.css
git commit -m "style(session): add exercise guide and checklist styles"
```

---

### Task 3: `runStartCountdown()` helper 추가 및 `startWorkout()`에 연결

**TDD scenario:** Modifying tested code — run existing tests first, then implement

**Files:**
- Modify: `public/js/workout/session-controller.js:876-968` (`startWorkout()` 함수)

**Step 1: 기존 테스트 실행**

```bash
npm test
```

기존 테스트가 통과하는지 확인한다.

**Step 2: `startWorkout()` 함수 내부에 `runStartCountdown()` helper 추가**

`startWorkout()` 함수 내부의 `try` 블록 안에, 세션 API 호출이 성공한 뒤 카운트다운을 실행한다.

현재 코드 흐름:

```js
// ... 세션 API 성공 후
state.phase = "WORKING";
syncPlankTargetUi();
// ...
ui.updateStatus("running", "운동 중");
// ...
startTimer();
startPoseDetection();
await requestWakeLock();
```

변경 후 흐름 (옵션 A: `WORKING` 전환을 카운트다운 이후로 이동):

```js
// ... 세션 API 성공 후
// state.phase = "WORKING" 제거 → 카운트다운 이후로 이동
syncPlankTargetUi();
updatePrimaryCounterDisplay();
updateRoutineStepDisplay();
updatePlankRuntimeDisplay(
  repCounter?.getTimeSummary ? repCounter.getTimeSummary() : null,
);

resetSessionBufferForSession(state.sessionId, {
  exerciseCode: workoutData.exercise.code,
  selectedView: state.selectedView,
  targetSec: getCurrentTargetSec() || null,
  source: "SESSION_START",
});
state.currentTargetSec = getCurrentTargetSec();

// setup panel 숨김
cameraOverlay.hidden = true;
startBtn.hidden = true;
const sourceSelectEl = document.getElementById("sourceSelect");
if (sourceSelectEl) sourceSelectEl.hidden = true;
if (viewSelectRoot) viewSelectRoot.hidden = true;
if (plankTargetSelectRoot) plankTargetSelectRoot.hidden = true;
const setupPanelContainer = document.getElementById("setupPanelContainer");
if (setupPanelContainer)
  setupPanelContainer.classList.add("hidden-during-workout");

// ── 3초 카운트다운 ──
await runStartCountdown();

// 카운트다운 완료 → WORKING 전환 및 운동 로직 시작
state.phase = "WORKING";
ui.updateStatus("running", "운동 중");
pauseBtn.disabled = false;
finishBtn.disabled = false;
finishBtn.textContent = "운동 종료";

startTimer();
startPoseDetection();
await requestWakeLock();
```

`runStartCountdown()` 함수를 `startWorkout()` 함수 내부(또는 같은 스코프의 다른 helper 옆)에 정의한다:

```js
/**
 * 3초 카운트다운 표시 후 카메라 overlay를 숨긴다.
 * state.phase를 "COUNTDOWN"으로 설정하여 타이머/채점이 시작되지 않도록 한다.
 */
async function runStartCountdown() {
  state.phase = "COUNTDOWN";

  const steps = [
    { num: "3", hint: "자세를 준비하세요" },
    { num: "2", hint: "전신이 화면에 들어오게 유지하세요" },
    { num: "1", hint: "곧 시작합니다" },
    { num: "시작!", hint: "운동 시작!" },
  ];

  cameraOverlay.hidden = false;
  cameraOverlay.innerHTML = `
    <div class="start-countdown-overlay" aria-live="polite">
      <span class="start-countdown-number" id="countdownNumber"></span>
      <p class="start-countdown-hint" id="countdownHint"></p>
    </div>
  `;

  const numEl = document.getElementById("countdownNumber");
  const hintEl = document.getElementById("countdownHint");

  for (const step of steps) {
    numEl.textContent = step.num;
    hintEl.textContent = step.hint;
    await new Promise((r) => setTimeout(r, 1000));
  }

  cameraOverlay.hidden = true;
  cameraOverlay.innerHTML = "";
}
```

**중요: `COUNTDOWN` phase 처리 확인**

`session-controller.js`에서 타이머는 `state.phase === "WORKING"`일 때만 증가하므로, `COUNTDOWN` 중에는 타이머가 시작되지 않는다. `startPoseDetection()`도 카운트다운 이후에 호출하므로 안전하다.

다만, `handlePoseDetected()`에서 `state.phase === "WORKING"` 체크가 있는지 확인해야 한다.

**Step 3: 기존 테스트 다시 실행**

```bash
npm test
```

기존 테스트가 깨지지 않는지 확인한다.

**Step 4: Commit**

```bash
git add public/js/workout/session-controller.js
git commit -m "feat(session): add 3-second countdown before workout starts"
```

---

### Task 4: 카운트다운 CSS 스타일 추가

**TDD scenario:** Trivial styling — 구현 후 브라우저 확인

**Files:**
- Modify: `public/workout.css` (`.camera-overlay` 관련 블록 근처에 추가)

**Step 1: 카운트다운 스타일 추가**

```css
/* 3초 카운트다운 overlay */
.start-countdown-overlay {
  display: grid;
  place-items: center;
  gap: 12px;
}

.start-countdown-number {
  font-size: 72px;
  font-weight: 800;
  line-height: 1;
  color: var(--workout-text);
}

.start-countdown-hint {
  font-size: 16px;
  color: var(--workout-muted);
  margin: 0;
  text-align: center;
}
```

**Step 2: 브라우저에서 확인**

운동 시작 버튼 클릭 → 3초 카운트다운 표시 → 타이머가 증가하지 않음 → 카운트다운 후 "운동 중" 전환 확인.

**Step 3: Commit**

```bash
git add public/workout.css
git commit -m "style(session): add countdown overlay styles"
```

---

### Task 5: 전체 통합 테스트 확인

**TDD scenario:** Existing tests — run all

**Files:**
- Test: `test/workout/session-controller-seam.test.js`
- Test: `test/workout/quality-gate-session.test.js`
- Test: `test/session-buffer.test.js`

**Step 1: 전체 테스트 실행**

```bash
npm test
```

**Step 2: 수동 검증 체크리스트**

- [ ] 스쿼트 세션: 가이드 박스에 스쿼트 좋은/주의 자세 표시
- [ ] 푸쉬업 세션: 가이드 박스에 푸쉬업 좋은/주의 자세 표시
- [ ] 플랭크 세션: 가이드 박스에 플랭크 좋은/주의 자세 표시
- [ ] 준비 체크리스트 4개 항목 표시
- [ ] 체크리스트 체크해도 시작에 영향 없음
- [ ] 입력 소스 선택 기존 동작
- [ ] 채점 자세 선택 기존 동작
- [ ] 플랭크 목표 시간 설정 기존 동작
- [ ] 운동 시작 클릭 → 3초 카운트다운 표시
- [ ] 카운트다운 중 타이머 00:00 유지
- [ ] 카운트다운 완료 후 "운동 중" 전환
- [ ] 카운트다운 완료 후 타이머 카운트 시작
- [ ] 다크 모드에서 정상 표시
- [ ] 모바일 화면에서 가이드 카드 세로 배치

**Step 3: Commit (통합 확인)**

```bash
git add -A
git commit -m "feat: complete workout onboarding guide with countdown"
```
