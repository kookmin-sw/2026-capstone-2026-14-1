# AI Growth Report Phase 5: Frontend UI

> Parent roadmap: `docs/plans/2026-05-03_ai_growth_report_implementation_plan.md`
> MVP policy: on-demand only. 리포트 결과는 DB에 저장하지 않는다.

## Phase 5: 프론트엔드 UI

**목표:** 히스토리 페이지에 AI 성장 리포트, 운동 세션 페이지에 오늘의 미션, 결과 페이지에 짧은 코칭을 렌더링한다.

### Task 14: 히스토리 페이지 성장 리포트 카드 추가

**파일:**
- 수정: `views/history/index.ejs`
- 생성: `public/js/history/ai-growth-report.js`
- 테스트: `test/analysis/frontend/ai-growth-report-client.test.js`

- [ ] **단계 1: 클라이언트 테스트 작성**

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const { buildGrowthReportHtml } = require('../../../public/js/history/ai-growth-report');

test('buildGrowthReportHtml renders summary and next mission', () => {
  const html = buildGrowthReportHtml({
    result: {
      summary: '최근 기록이 좋아지고 있습니다.',
      improvements: [{ title: '깊이 개선', evidence: '48점에서 66점' }],
      weak_points: [{ title: '무릎 정렬 보완', evidence: '5회 중 4회 낮음' }],
      next_mission: { title: '무릎 정렬 집중', action: '무릎과 발끝 방향을 맞추세요.' },
      data_quality_note: { label: 'medium', message: '일부 카메라 이슈가 있었습니다.' },
    },
  });
  assert.match(html, /AI 성장 리포트/);
  assert.match(html, /무릎 정렬 집중/);
});
```

- [ ] **단계 2: 테스트 실행 — 실패 확인**

실행: `node --test test/analysis/frontend/ai-growth-report-client.test.js`

예상: 모듈 없음 오류로 실패.

- [ ] **단계 3: 클라이언트 렌더러 추가**

```js
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildGrowthReportHtml(report) {
  const result = report?.result || {};
  const improvements = Array.isArray(result.improvements) ? result.improvements : [];
  const weakPoints = Array.isArray(result.weak_points) ? result.weak_points : [];
  return `
    <section class="ai-growth-report-card">
      <h2>AI 성장 리포트</h2>
      <p class="ai-growth-summary">${escapeHtml(result.summary || '최근 운동 기록을 분석 중입니다.')}</p>
      <div class="ai-growth-grid">
        <div><h3>좋아진 점</h3>${renderItems(improvements)}</div>
        <div><h3>부족한 점</h3>${renderItems(weakPoints)}</div>
      </div>
      <div class="ai-growth-mission">
        <h3>오늘의 운동 미션</h3>
        <strong>${escapeHtml(result.next_mission?.title || '안정적인 자세 유지하기')}</strong>
        <p>${escapeHtml(result.next_mission?.action || '반복 수보다 자세를 천천히 유지해 보세요.')}</p>
      </div>
      <p class="ai-growth-quality">분석 신뢰도: ${escapeHtml(result.data_quality_note?.label || 'low')} — ${escapeHtml(result.data_quality_note?.message || '')}</p>
    </section>`;
}

function renderItems(items) {
  if (items.length === 0) return '<p>표시할 항목이 아직 충분하지 않습니다.</p>';
  return `<ul>${items.map((item) => `<li><strong>${escapeHtml(item.title)}</strong><br><span>${escapeHtml(item.evidence)}</span></li>`).join('')}</ul>`;
}

async function loadGrowthReport({ containerId = 'ai-growth-report-root', exercise = 'squat' } = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '<p>AI 성장 리포트를 불러오는 중입니다...</p>';
  try {
    const response = await fetch(`/api/users/me/coach-report?period=recent_5&exercise=${encodeURIComponent(exercise)}`);
    if (!response.ok) throw new Error('request failed');
    const report = await response.json();
    container.innerHTML = buildGrowthReportHtml(report);
  } catch (error) {
    container.innerHTML = '<p>AI 성장 리포트를 불러오지 못했습니다.</p>';
  }
}

if (typeof window !== 'undefined') {
  window.FitPlusAiGrowthReport = { buildGrowthReportHtml, loadGrowthReport };
}

if (typeof module !== 'undefined') {
  module.exports = { buildGrowthReportHtml, loadGrowthReport };
}
```

- [ ] **단계 4: `views/history/index.ejs`에 컨테이너와 스크립트 추가**

히스토리 콘텐츠 상단 근처에 삽입:

```html
<div id="ai-growth-report-root" class="ai-growth-report-root"></div>
<script src="/js/history/ai-growth-report.js"></script>
<script>
  window.FitPlusAiGrowthReport?.loadGrowthReport?.({ exercise: '<%= filters?.exercise || "squat" %>' });
</script>
```

- [ ] **단계 5: 테스트 실행**

실행: `node --test test/analysis/frontend/ai-growth-report-client.test.js`

예상: 성공.

- [ ] **단계 6: 커밋**

```bash
git add views/history/index.ejs public/js/history/ai-growth-report.js test/analysis/frontend/ai-growth-report-client.test.js
git commit -m "feat(history): show AI growth report card"
```

### Task 15: 운동 세션/결과 페이지에 오늘의 미션 추가

**파일:**
- 수정: `views/workout/session.ejs`
- 수정: `views/workout/result.ejs`
- 생성: `public/js/workout/ai-mission-card.js`
- 테스트: `test/analysis/frontend/ai-mission-card.test.js`

- [ ] **단계 1: 클라이언트 테스트 작성**

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const { buildMissionHtml } = require('../../../public/js/workout/ai-mission-card');

test('buildMissionHtml renders next mission', () => {
  const html = buildMissionHtml({ title: '무릎 정렬 집중', action: '무릎과 발끝 방향을 맞추세요.' });
  assert.match(html, /오늘의 AI 미션/);
  assert.match(html, /무릎 정렬 집중/);
});
```

- [ ] **단계 2: 테스트 실행 — 실패 확인**

실행: `node --test test/analysis/frontend/ai-mission-card.test.js`

예상: 모듈 없음 오류로 실패.

- [ ] **단계 3: 미션 카드 스크립트 추가**

```js
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildMissionHtml(mission = {}) {
  return `
    <section class="ai-mission-card">
      <h2>오늘의 AI 미션</h2>
      <strong>${escapeHtml(mission.title || '안정적인 자세 유지하기')}</strong>
      <p>${escapeHtml(mission.action || '반복 수보다 자세를 천천히 유지해 보세요.')}</p>
    </section>`;
}

async function loadMission({ containerId = 'ai-mission-root', exercise = 'squat' } = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  try {
    const response = await fetch(`/api/users/me/coach-report?period=recent_5&exercise=${encodeURIComponent(exercise)}`);
    if (!response.ok) return;
    const report = await response.json();
    container.innerHTML = buildMissionHtml(report?.result?.next_mission);
  } catch (error) {
    container.innerHTML = '';
  }
}

if (typeof window !== 'undefined') {
  window.FitPlusAiMissionCard = { buildMissionHtml, loadMission };
}

if (typeof module !== 'undefined') {
  module.exports = { buildMissionHtml, loadMission };
}
```

- [ ] **단계 4: EJS 페이지에 컨테이너 추가**

`views/workout/session.ejs` — 운동 시작/준비 영역 근처:

```html
<div id="ai-mission-root" class="ai-mission-root"></div>
<script src="/js/workout/ai-mission-card.js"></script>
<script>
  window.FitPlusAiMissionCard?.loadMission?.({ exercise: '<%= exercise?.code || "squat" %>' });
</script>
```

`views/workout/result.ejs` — 결과 요약 근처:

```html
<div id="ai-mission-root" class="ai-mission-root"></div>
<script src="/js/workout/ai-mission-card.js"></script>
<script>
  window.FitPlusAiMissionCard?.loadMission?.({ exercise: '<%= session?.exercise?.code || session?.exercise_code || "squat" %>' });
</script>
```

- [ ] **단계 5: 테스트 실행**

실행: `node --test test/analysis/frontend/ai-mission-card.test.js`

예상: 성공.

- [ ] **단계 6: 커밋**

```bash
git add views/workout/session.ejs views/workout/result.ejs public/js/workout/ai-mission-card.js test/analysis/frontend/ai-mission-card.test.js
git commit -m "feat(workout): show today's AI mission"
```

---
