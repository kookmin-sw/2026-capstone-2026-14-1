# Codebase Verified Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 코드와 대조해 확인된 FitPlus 버그와 보안 하드닝 항목만 우선 수정하고, 오탐 또는 별도 설계가 필요한 항목은 실행 대상에서 제외한다.

**Architecture:** P0는 현재 동작을 깨뜨리는 검증된 결함만 수정한다. P1은 사용자 입력/DB 데이터 렌더링, JWT 검증, 리소스 해제처럼 범위가 작고 회귀 테스트가 가능한 보안/안정성 개선을 수행한다. P2는 Express 5 전환에 따른 의존성 정리처럼 기능 변경 없는 기술 부채만 다룬다.

**Tech Stack:** Node.js, Express 5, CommonJS, EJS, vanilla JavaScript, Supabase, JWT, Node built-in test runner (`node --test`)

---

## 실행 규칙

- [ ] 코드 수정 전 `git status --short`로 기존 변경사항을 확인한다.
- [ ] 각 Task는 테스트를 먼저 고치거나 추가해서 실패를 확인한 뒤 구현한다.
- [ ] 커밋은 사용자가 명시적으로 요청한 경우에만 만든다.
- [ ] 완료 전 `npm test`를 실행한다.
- [ ] 이 plan 자체의 체크박스는 구현 완료 시점에만 갱신한다.

---

## 검증 결과 요약

| 기존 항목 | 판정 | 처리 |
|---|---|---|
| CSS 미디어 쿼리 문법 오류 | 확인됨 | P0 Task 1 |
| 루틴 데드락 (`ALREADY_PROCESSED`) | 오탐 | `finally`에서 `state.routineSetSyncPending = false` 실행됨 |
| learn mode `step.evaluate()` 예외 | 부분 확인됨 | P0 Task 3 |
| 스킵된 메트릭이 `totalWeight`에 포함됨 | 오탐 | `actualValue === null`이면 `continue`되어 `totalWeight` 증가 안 함 |
| `final_score` 클라이언트 조작 | 확인됨, 단 간단 재계산으로 완전 해결 불가 | 별도 설계 필요 항목으로 분리 |
| `session-ui.js` XSS 위험 | 확인됨 | P1 Task 4 |
| `history-page.js` XSS 위험 | 대부분 `escapeHtml()` 적용됨 | 별도 수정 없음; 구현 중 변경하지 않음 |
| EJS script JSON 이스케이프 부족 | 확인됨 | P1 Task 5 |
| JWT `algorithms` 미명시 | 확인됨 | P1 Task 6 |
| `session-voice.js` Object URL 해제 누락 | 확인됨 | P1 Task 7 |
| Rate limiting 없음 | 보안 하드닝 | P1 Task 8 |
| `express-async-handler` 불필요 | 확인됨 | P2 Task 9 |
| Supabase auth 호출 문제 | 오탐 | 현재 `supabase.auth.signUp/signIn` 사용 안 함 |
| `heel_contact` dead code | 오탐 | `PoseEngine`이 `heelContact`를 방출하고 `scoring-engine.js`가 먼저 사용함 |
| withhold 이벤트 필터 불일치 | 확인됨 | P0 Task 2 |

---

## File Map

수정 대상:

- `public/styles.css`: 깨진 중복 media query 제거
- `public/js/workout/session-buffer.js`: `QUALITY_GATE_WITHHOLD` 이벤트 집계
- `test/session-buffer.test.js`: 실제 품질 게이트 이벤트 타입으로 테스트 갱신
- `public/js/workout/session-controller.js`: learn step evaluation 예외 방어
- `test/workout/session-controller-seam.test.js`: learn step evaluation 방어 소스 검증
- `public/js/workout/session-ui.js`: 사용자/DB 텍스트를 안전하게 DOM 렌더링
- `test/workout/session-ui.test.js`: HTML injection 회귀 테스트 추가
- `views/workout/session.ejs`: script 안 JSON 안전 직렬화
- `middleware/auth.js`: JWT sign/verify 알고리즘 명시
- `test/auth-jwt.test.js`: JWT 알고리즘 회귀 테스트 추가
- `public/js/workout/session-voice.js`: TTS object URL 해제
- `test/workout/session-voice.test.js`: object URL revoke 회귀 테스트 추가
- `middleware/rate-limit.js`: 경량 rate limit 미들웨어 추가
- `routes/workout.js`: 운동 API에 rate limit 적용
- `test/rate-limit.test.js`: rate limit 미들웨어 단위 테스트 추가
- `controllers/login.js`, `controllers/signup.js`, `controllers/settings.js`, `controllers/admin.js`: Express 5 async handler 정리
- `package.json`, `package-lock.json`: `express-async-handler` 제거

수정하지 않는 항목:

- `controllers/login.js`의 Supabase auth 함수 분리: 현재 custom auth라 해당 없음
- `public/js/workout/scoring-engine.js`의 skipped metric total weight: 현재 코드상 해당 없음
- `public/js/workout/scoring-engine.js`의 `heel_contact` 제거: 현재 `heelContact` 경로가 실제 동작함
- `session-controller.js`의 `ALREADY_PROCESSED` pending reset: 현재 `finally`에서 reset됨

---

## P0 수정

### Task 1: CSS 깨진 중복 media query 제거

**Files:**

- Modify: `public/styles.css:1221-1229`

**현재 근거:** `public/styles.css:1221`에는 정상 `@media (max-width: 600px)`가 있고, `1225`에 `}-width: 600px) {`가 중복으로 붙어 있다.

- [x] **Step 1: 실패 확인**

Run:

```bash
node -e "const fs=require('node:fs'); const css=fs.readFileSync('public/styles.css','utf8'); if (css.includes('}-width: 600px) {')) { console.error('malformed media query remains'); process.exit(1); }"
```

Expected before fix: FAIL with `malformed media query remains`.

- [x] **Step 2: 중복 깨진 블록 제거**

`public/styles.css` 끝부분을 아래 형태로 만든다.

```css
@media (max-width: 600px) {
  .theme-options {
    grid-template-columns: 1fr;
  }
}
```

- [x] **Step 3: 문법 잔여 확인**

Run:

```bash
node -e "const fs=require('node:fs'); const css=fs.readFileSync('public/styles.css','utf8'); if (css.includes('}-width: 600px) {')) { console.error('malformed media query remains'); process.exit(1); }"
```

Expected after fix: PASS with exit code 0.

---

### Task 2: 품질 게이트 withhold 이벤트 집계 수정

**Files:**

- Modify: `test/session-buffer.test.js:113-142`
- Modify: `public/js/workout/session-buffer.js:514-546`

**현재 근거:** `session-controller.js`는 `QUALITY_GATE_WITHHOLD`를 기록하지만 `session-buffer.js`는 `event.type === 'withhold'`만 집계한다.

- [x] **Step 1: 테스트를 실제 이벤트 타입으로 변경**

`test/session-buffer.test.js`의 withhold 테스트에서 이벤트 타입을 아래처럼 바꾼다.

```js
buffer.recordEvent({
  type: 'QUALITY_GATE_WITHHOLD',
  timestamp: 1000,
  gate_result: 'withhold',
  withhold_reason: 'view_mismatch',
  estimated_view: 'FRONT',
  estimated_view_confidence: 0.42,
  stable_frame_count: 3,
});
```

- [x] **Step 2: 실패 확인**

Run:

```bash
node --test test/session-buffer.test.js
```

Expected before fix: FAIL because `exported.withhold_count` is `0`.

- [x] **Step 3: 필터를 실제 이벤트 타입으로 수정**

`public/js/workout/session-buffer.js`의 export 집계 코드를 아래처럼 바꾼다.

```js
const withholdEvents = (this.events || []).filter(
  (event) => event.type === 'QUALITY_GATE_WITHHOLD',
);
```

- [x] **Step 4: 단위 테스트 통과 확인**

Run:

```bash
node --test test/session-buffer.test.js
```

Expected after fix: PASS.

---

### Task 3: learn mode `step.evaluate()` 예외 방어

**Files:**

- Modify: `test/workout/session-controller-seam.test.js`
- Modify: `public/js/workout/session-controller.js:1741-1775`

**현재 근거:** `startPoseDetection()`의 `processFrame`에는 try-catch가 있지만, learn mode에서 호출되는 `step.evaluate()` 자체는 `handleLearnPoseDetected()` 안에서 직접 실행된다. exercise module의 evaluate가 던지는 예외는 해당 frame 처리를 중단시킬 수 있다.

- [x] **Step 1: 소스 회귀 테스트 추가**

`test/workout/session-controller-seam.test.js`에 아래 테스트를 추가한다. 이 파일은 이미 source extraction 방식 테스트를 사용한다.

```js
test('learn step evaluation is guarded so one exercise error does not kill frame handling', () => {
  const source = fs.readFileSync(controllerPath, 'utf8');
  const fnSignature = 'function handleLearnPoseDetected';
  const fnStart = source.indexOf(fnSignature);
  assert.notEqual(fnStart, -1, 'handleLearnPoseDetected should exist');

  let i = fnStart + fnSignature.length;
  let parenDepth = 0;
  for (; i < source.length; i += 1) {
    if (source[i] === '(') parenDepth += 1;
    if (source[i] === ')') parenDepth -= 1;
    if (parenDepth === 0 && source[i] === '{') break;
  }

  const bodyStart = i;
  let braceDepth = 0;
  let bodyEnd = bodyStart;
  for (let j = bodyStart; j < source.length; j += 1) {
    if (source[j] === '{') braceDepth += 1;
    if (source[j] === '}') braceDepth -= 1;
    if (braceDepth === 0) { bodyEnd = j; break; }
  }

  const body = source.slice(bodyStart, bodyEnd + 1);
  assert.match(body, /try\s*{[\s\S]*step\.evaluate/);
  assert.match(body, /catch\s*\(error\)/);
  assert.match(body, /normalizeLearnStepEvaluationHelper\(stepEvaluationResult\)/);
});
```

- [x] **Step 2: 실패 확인**

Run:

```bash
node --test test/workout/session-controller-seam.test.js
```

Expected before fix: FAIL because `handleLearnPoseDetected()` has no try-catch around `step.evaluate()`.

- [x] **Step 3: `step.evaluate()` 결과를 안전하게 계산**

`handleLearnPoseDetected()`의 evaluation 생성부를 아래 구조로 바꾼다.

```js
let stepEvaluationResult = null;
if (typeof step.evaluate === "function") {
  try {
    stepEvaluationResult = step.evaluate({
      angles: poseData.angles,
      poseData,
      rawScoreResult,
      scoringResult: liveScoreResult,
      scoringEngine,
      exerciseModule,
      selectedView: state.selectedView,
      state,
      now,
      deltaMs,
    });
  } catch (error) {
    console.error("[Session] learn step evaluation failed:", error);
  }
}

const evaluation = normalizeLearnStepEvaluationHelper(stepEvaluationResult);
```

- [x] **Step 4: 단위 테스트 통과 확인**

Run:

```bash
node --test test/workout/session-controller-seam.test.js
```

Expected after fix: PASS.

---

## P1 수정

### Task 4: `session-ui.js` 텍스트 렌더링 XSS 방지

**Files:**

- Modify: `public/js/workout/session-ui.js:326-354`
- Modify: `public/js/workout/session-ui.js:550-565`
- Modify: `test/workout/session-ui.test.js`

**현재 근거:** `refs.scoreBreakdownEl.innerHTML`, `refs.learnStepHintsEl.innerHTML`, `refs.learnStepChecksEl.innerHTML`에 `message`, `emptyMessage`, `item.title`, `item.key`, `hint`, `check.label`이 escape 없이 들어간다.

- [ ] **Step 1: element stub에 DOM 생성 helper 추가**

`test/workout/session-ui.test.js`의 stub이 `document.createElement()` 기반 구현을 테스트할 수 있게 아래 helper를 추가한다.

```js
function installDocumentStub() {
  const originalDocument = global.document;
  global.document = {
    createElement(tagName) {
      const element = createElementStub();
      element.tagName = tagName.toUpperCase();
      return element;
    },
  };
  return () => {
    if (originalDocument) {
      global.document = originalDocument;
    } else {
      delete global.document;
    }
  };
}
```

- [ ] **Step 2: injection 회귀 테스트 추가**

`test/workout/session-ui.test.js`에 아래 테스트를 추가한다.

```js
test('updateScoreDisplay renders untrusted breakdown text as text nodes', () => {
  const restoreDocument = installDocumentStub();
  try {
    const refs = { liveScoreEl: createElementStub(), scoreBreakdownEl: createElementStub() };
    const ui = createSessionUi(refs);

    ui.updateScoreDisplay({
      score: 50,
      breakdown: [
        { title: '<img src=x onerror=alert(1)>', score: 20 },
      ],
    });

    assert.equal(refs.scoreBreakdownEl.innerHTML, '');
    assert.equal(refs.scoreBreakdownEl.children[0].children[0].textContent, '<img src=x onerror=alert(1)>');
  } finally {
    restoreDocument();
  }
});
```

- [ ] **Step 3: 실패 확인**

Run:

```bash
node --test test/workout/session-ui.test.js
```

Expected before fix: FAIL because current implementation writes HTML strings into `innerHTML`.

- [ ] **Step 4: score breakdown을 DOM API로 렌더링**

`public/js/workout/session-ui.js`에 작은 helper를 추가하고 `innerHTML` score rendering을 대체한다.

```js
function createTextScoreItem(label, value, className = '') {
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc?.createElement) return null;
  const row = doc.createElement('div');
  row.className = `score-item${className ? ` ${className}` : ''}`;
  const labelEl = doc.createElement('span');
  labelEl.textContent = label;
  const valueEl = doc.createElement('span');
  valueEl.textContent = value;
  row.append(labelEl, valueEl);
  return row;
}
```

`refs.scoreBreakdownEl.innerHTML = ...` 대신 `replaceChildren()`를 사용한다.

```js
const row = createTextScoreItem(message, '');
refs.scoreBreakdownEl.replaceChildren(row);
```

breakdown 배열은 아래 구조로 렌더링한다.

```js
const rows = breakdown.slice(0, 3).map((item) => {
  const itemScore = item.score ?? item.normalizedScore ?? 0;
  const valueText = displayAsGrade
    ? mapScoreToWorkoutGrade(itemScore).label
    : String(Math.round(itemScore));
  return createTextScoreItem(item.title || item.key || '항목', valueText);
}).filter(Boolean);
refs.scoreBreakdownEl.replaceChildren(...rows);
```

- [ ] **Step 5: learn hints/checks를 DOM API로 렌더링**

`learnStepHintsEl`과 `learnStepChecksEl`도 text node 기반으로 바꾼다.

```js
const hintRows = (Array.isArray(hints) ? hints : [])
  .filter((item) => typeof item === 'string' && item.trim())
  .map((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    return li;
  });
refs.learnStepHintsEl.replaceChildren(...hintRows);
```

checks는 `div.score-item`을 생성하고 label/progress를 `textContent`로 넣는다.

- [ ] **Step 6: UI 테스트 통과 확인**

Run:

```bash
node --test test/workout/session-ui.test.js
```

Expected after fix: PASS.

---

### Task 5: workout session EJS JSON script escape 추가

**Files:**

- Modify: `views/workout/session.ejs:409-423`

**현재 근거:** `<%- JSON.stringify(currentExercise) %>` 형태는 JSON 안에 `</script>`가 들어오면 script 태그를 조기 종료할 수 있다.

- [ ] **Step 1: 현재 취약 패턴 확인**

Run:

```bash
node -e "const fs=require('node:fs'); const view=fs.readFileSync('views/workout/session.ejs','utf8'); if (!view.includes('<%- JSON.stringify(currentExercise) %>')) process.exit(1);"
```

Expected before fix: PASS with exit code 0, confirming the unsafe pattern exists.

- [ ] **Step 2: EJS에서 안전 JSON helper 추가**

`views/workout/session.ejs`의 script 직전에 helper를 추가한다.

```ejs
<%
  const safeJson = (value) => JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
%>
```

- [ ] **Step 3: JSON interpolation을 helper로 교체**

아래 값을 모두 `safeJson()`으로 렌더링한다.

```ejs
exercise: <%- safeJson(currentExercise) %>,
scoringProfile: <%- scoringProfile ? safeJson(scoringProfile) : 'null' %>,
routine: <%- safeJson(routine) %>,
routineInstance: <%- safeJson(routineInstance) %>,
```

- [ ] **Step 4: unsafe 패턴 제거 확인**

Run:

```bash
node -e "const fs=require('node:fs'); const view=fs.readFileSync('views/workout/session.ejs','utf8'); if (view.includes('<%- JSON.stringify(currentExercise) %>')) { console.error('unsafe JSON stringify remains'); process.exit(1); }"
```

Expected after fix: PASS with exit code 0.

---

### Task 6: JWT sign/verify 알고리즘 명시

**Files:**

- Modify: `middleware/auth.js:5-18`
- Modify: `middleware/auth.js:26,66,82,106`
- Create: `test/auth-jwt.test.js`

**현재 근거:** `jsonwebtoken` v9를 사용하지만, 검증 시 허용 알고리즘을 명시하지 않는 것보다 `HS256`만 허용하는 편이 명확하고 안전하다.

- [ ] **Step 1: JWT 회귀 테스트 추가**

`test/auth-jwt.test.js`를 생성한다.

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const authPath = require.resolve('../middleware/auth');

function loadAuth() {
  process.env.JWT_SECRET = 'test-secret';
  delete require.cache[authPath];
  return require('../middleware/auth');
}

test('generateToken signs HS256 tokens', () => {
  const { generateToken } = loadAuth();
  const token = generateToken({ user_id: 1, login_id: 'user1', nickname: 'User' });
  const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));
  assert.equal(header.alg, 'HS256');
});

test('requireAuth rejects tokens signed with non-HS256 algorithms', () => {
  const { requireAuth } = loadAuth();
  const token = jwt.sign({ user_id: 1, login_id: 'user1' }, 'test-secret', { algorithm: 'HS384' });
  const req = { cookies: { token }, originalUrl: '/settings' };
  let cleared = false;
  const res = {
    clearCookie(name) { if (name === 'token') cleared = true; },
    redirect(path) { this.redirectedTo = path; return path; },
  };
  let nextCalled = false;

  requireAuth(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(cleared, true);
  assert.match(res.redirectedTo, /^\/login\?error=/);
});
```

- [ ] **Step 2: 실패 확인**

Run:

```bash
node --test test/auth-jwt.test.js
```

Expected before fix: FAIL because `requireAuth` accepts the HS384 token when no algorithms option is supplied.

- [ ] **Step 3: `middleware/auth.js`에 알고리즘 상수 적용**

```js
const JWT_ALGORITHM = 'HS256';
const JWT_VERIFY_OPTIONS = { algorithms: [JWT_ALGORITHM] };
```

`generateToken()`은 아래 옵션을 사용한다.

```js
{ expiresIn: JWT_EXPIRES_IN, algorithm: JWT_ALGORITHM }
```

모든 `jwt.verify(token, JWT_SECRET)` 호출은 아래 형태로 바꾼다.

```js
jwt.verify(token, JWT_SECRET, JWT_VERIFY_OPTIONS)
```

- [ ] **Step 4: JWT 테스트 통과 확인**

Run:

```bash
node --test test/auth-jwt.test.js
```

Expected after fix: PASS.

---

### Task 7: TTS Object URL 해제

**Files:**

- Modify: `public/js/workout/session-voice.js:158-187`
- Modify: `test/workout/session-voice.test.js`

**현재 근거:** `URL.createObjectURL(blob)`으로 만든 URL을 `URL.revokeObjectURL(url)`로 해제하지 않는다.

- [ ] **Step 1: object URL revoke 테스트 추가**

`test/workout/session-voice.test.js`에 API speech provider 테스트를 추가한다.

```js
test('api speech provider revokes the previous object URL when a new clip is loaded', async () => {
  const createdUrls = [];
  const revokedUrls = [];
  const originalURL = global.URL;
  const originalFetch = global.fetch;
  const originalAudio = global.Audio;

  global.URL = {
    createObjectURL() {
      const url = `blob:test-${createdUrls.length + 1}`;
      createdUrls.push(url);
      return url;
    },
    revokeObjectURL(url) {
      revokedUrls.push(url);
    },
  };
  global.fetch = async () => ({ ok: true, blob: async () => new Blob(['audio']) });
  global.Audio = function AudioStub() {
    this.pause = () => {};
    this.play = async () => {};
    this.currentTime = 0;
    this.src = '';
  };

  try {
    const { createApiSpeechProvider } = require('../../public/js/workout/session-voice.js');
    const provider = createApiSpeechProvider({ endpoint: '/api/tts' });
    provider.speak('first');
    await new Promise((resolve) => setImmediate(resolve));
    provider.speak('second');
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(createdUrls, ['blob:test-1', 'blob:test-2']);
    assert.deepEqual(revokedUrls, ['blob:test-1']);
  } finally {
    global.URL = originalURL;
    global.fetch = originalFetch;
    global.Audio = originalAudio;
  }
});
```

- [ ] **Step 2: 실패 확인**

Run:

```bash
node --test test/workout/session-voice.test.js
```

Expected before fix: FAIL because no URL is revoked.

- [ ] **Step 3: 이전 URL을 추적하고 해제**

`createApiSpeechProvider()` 내부에 URL 상태와 helper를 추가한다.

```js
let currentObjectUrl = null;

function revokeCurrentObjectUrl() {
  if (currentObjectUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
    URL.revokeObjectURL(currentObjectUrl);
  }
  currentObjectUrl = null;
}
```

새 blob URL을 만들기 전 기존 URL을 해제한다.

```js
revokeCurrentObjectUrl();
const url = URL.createObjectURL(blob);
currentObjectUrl = url;
```

`cancel()`에서도 `revokeCurrentObjectUrl()`을 호출한다.

- [ ] **Step 4: voice 테스트 통과 확인**

Run:

```bash
node --test test/workout/session-voice.test.js
```

Expected after fix: PASS.

---

### Task 8: 운동 API rate limit 추가

**Files:**

- Create: `middleware/rate-limit.js`
- Modify: `routes/workout.js:68-72`
- Create: `test/rate-limit.test.js`

**현재 근거:** 인증된 사용자가 운동 세션 생성/종료/세트 기록 API를 짧은 시간에 무제한 호출할 수 있다. 이 항목은 버그라기보다 운영 안정성 하드닝이다.

- [ ] **Step 1: rate limit 단위 테스트 작성**

`test/rate-limit.test.js`를 생성한다.

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRateLimit } = require('../middleware/rate-limit');

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    set() { return this; },
  };
}

test('createRateLimit returns 429 after the configured limit', () => {
  let now = 1000;
  const middleware = createRateLimit({ windowMs: 60000, max: 2, keyPrefix: 'test', now: () => now });
  const req = { user: { user_id: 7 }, ip: '127.0.0.1' };

  let nextCount = 0;
  middleware(req, createResponse(), () => { nextCount += 1; });
  middleware(req, createResponse(), () => { nextCount += 1; });
  const blocked = createResponse();
  middleware(req, blocked, () => { nextCount += 1; });

  assert.equal(nextCount, 2);
  assert.equal(blocked.statusCode, 429);
  assert.deepEqual(blocked.body, { success: false, error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' });

  now += 60001;
  const afterReset = createResponse();
  middleware(req, afterReset, () => { nextCount += 1; });
  assert.equal(nextCount, 3);
  assert.equal(afterReset.statusCode, 200);
});
```

- [ ] **Step 2: 실패 확인**

Run:

```bash
node --test test/rate-limit.test.js
```

Expected before implementation: FAIL because `middleware/rate-limit.js` does not exist.

- [ ] **Step 3: 미들웨어 구현**

`middleware/rate-limit.js`를 생성한다.

```js
function createRateLimit({
  windowMs = 60000,
  max = 30,
  keyPrefix = 'global',
  now = Date.now,
} = {}) {
  const buckets = new Map();

  return function rateLimit(req, res, next) {
    const currentTime = now();
    const actor = req.user?.user_id || req.ip || req.socket?.remoteAddress || 'anonymous';
    const key = `${keyPrefix}:${actor}`;
    const existing = buckets.get(key);
    const bucket = existing && existing.resetAt > currentTime
      ? existing
      : { count: 0, resetAt: currentTime + windowMs };

    if (bucket.count >= max) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - currentTime) / 1000));
      if (typeof res.set === 'function') {
        res.set('Retry-After', String(retryAfterSec));
      }
      return res.status(429).json({
        success: false,
        error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
      });
    }

    bucket.count += 1;
    buckets.set(key, bucket);
    return next();
  };
}

module.exports = { createRateLimit };
```

- [ ] **Step 4: 운동 API에 적용**

`routes/workout.js`에 import와 미들웨어를 추가한다.

```js
const { createRateLimit } = require('../middleware/rate-limit');

const workoutWriteRateLimit = createRateLimit({
  windowMs: Number(process.env.WORKOUT_RATE_LIMIT_WINDOW_MS) || 60000,
  max: Number(process.env.WORKOUT_RATE_LIMIT_MAX) || 30,
  keyPrefix: 'workout-write',
});
```

아래 라우트에 `workoutWriteRateLimit`을 `requireAuth` 뒤에 넣는다.

```js
router.post('/api/workout/session', requireAuth, workoutWriteRateLimit, startWorkoutSession);
router.put('/api/workout/session/:sessionId/end', requireAuth, workoutWriteRateLimit, endWorkoutSession);
router.post('/api/workout/session/:sessionId/set', requireAuth, workoutWriteRateLimit, recordWorkoutSet);
```

- [ ] **Step 5: rate limit 테스트 통과 확인**

Run:

```bash
node --test test/rate-limit.test.js
```

Expected after fix: PASS.

---

## P2 정리

### Task 9: Express 5에서 불필요한 `express-async-handler` 제거

**Files:**

- Modify: `controllers/login.js`
- Modify: `controllers/signup.js`
- Modify: `controllers/settings.js`
- Modify: `controllers/admin.js`
- Modify: `package.json`
- Modify: `package-lock.json`

**현재 근거:** Express 5는 async route handler의 reject/error를 기본 error middleware로 전달한다. 현재 `express-async-handler`는 Express 4 시절 패턴이다.

- [ ] **Step 1: 사용처 확인**

Run:

```bash
node -e "const fs=require('node:fs'); const files=['controllers/login.js','controllers/signup.js','controllers/settings.js','controllers/admin.js']; const hits=files.filter((file)=>fs.readFileSync(file,'utf8').includes('express-async-handler')); if (!hits.length) process.exit(1); console.log(hits.join('\n'));"
```

Expected before fix: PASS and prints the four controller files.

- [ ] **Step 2: controller wrapper 제거**

각 controller에서 아래 import를 제거한다.

```js
const asyncHandler = require('express-async-handler');
```

아래 형태의 wrapper를 제거한다.

```js
const getLoginPage = asyncHandler(async (req, res) => {
  // body
});
```

아래 형태로 변경한다.

```js
const getLoginPage = async (req, res) => {
  // body
};
```

동일하게 `controllers/login.js`, `controllers/signup.js`, `controllers/settings.js`, `controllers/admin.js`의 모든 `asyncHandler(async ... )` wrapper를 제거한다.

- [ ] **Step 3: 의존성 제거**

Run:

```bash
npm uninstall express-async-handler
```

Expected: `package.json`과 `package-lock.json`에서 `express-async-handler`가 제거된다.

- [ ] **Step 4: 잔여 사용처 확인**

Run:

```bash
node -e "const fs=require('node:fs'); const files=['controllers/login.js','controllers/signup.js','controllers/settings.js','controllers/admin.js','package.json']; const hits=files.filter((file)=>fs.readFileSync(file,'utf8').includes('express-async-handler') || fs.readFileSync(file,'utf8').includes('asyncHandler(')); if (hits.length) { console.error(hits.join('\n')); process.exit(1); }"
```

Expected after fix: PASS with exit code 0.

---

## 별도 설계 필요 항목

### `final_score` 클라이언트 조작

현재 `controllers/workout.js`는 `req.body.final_score`를 신뢰한다. 다만 지금 서버가 받는 `interim_snapshots`, `metric_results`, `events`도 모두 클라이언트 payload라서, 서버에서 이 값들로 다시 평균을 내도 악의적 클라이언트를 막는 보안 경계가 생기지 않는다.

이 항목은 아래 중 하나를 별도 spec으로 결정한 뒤 구현한다.

- 서버가 raw landmark/angle timeline과 scoring profile을 받아 `final_score`를 직접 계산한다.
- 브라우저에서 계산한 score payload를 서버 발급 세션 nonce로 서명하고, 서버는 변조 여부만 검증한다.
- anti-cheat를 목표로 하지 않고, 현재 점수를 “client-reported score”로 명확히 표기한다.

이 plan에서는 `final_score`를 P0 quick fix로 다루지 않는다.

---

## 수동 검증 체크리스트

- [ ] 모바일 600px 이하에서 settings theme options가 1열로 보인다.
- [ ] 자유 운동 시작, 진행, 종료가 동작한다.
- [ ] 루틴 운동에서 세트 완료 후 다음 세트 또는 다음 운동으로 넘어간다.
- [ ] learn mode에서 exercise step 평가 중 예외가 발생해도 세션이 종료되지 않는다.
- [ ] 품질 게이트 withhold가 발생한 세션 export에서 `withhold_count`가 증가한다.
- [ ] 악의적 문자열 `<img src=x onerror=alert(1)>`가 score breakdown/hints/checks에 텍스트로만 표시된다.
- [ ] workout session page의 JSON 데이터에 `</script>` 문자열이 포함되어도 script 태그가 조기 종료되지 않는다.
- [ ] HS256이 아닌 JWT는 인증 미들웨어에서 거부된다.
- [ ] 운동 write API를 제한 이상 호출하면 429가 반환된다.
- [ ] TTS를 여러 번 재생해도 이전 object URL이 revoke된다.

---

## 전체 검증

- [ ] 모든 개별 Task 테스트를 통과시킨다.
- [ ] 전체 테스트를 실행한다.

```bash
npm test
```

Expected: all tests pass.

- [ ] 변경 범위를 확인한다.

```bash
git status --short
git diff -- docs/plans/2026-05-03-codebase-bug-fixes.md
```

Expected: 의도한 파일만 변경되어 있다. 구현 단계에서는 각 Task의 대상 파일만 추가 변경되어야 한다.
