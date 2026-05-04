# AI Growth Report Phase 4: Service And API

> Parent roadmap: `docs/plans/2026-05-03_ai_growth_report_implementation_plan.md`
> MVP policy: on-demand only. 리포트 결과는 DB에 저장하지 않는다.

## Phase 4: 서비스와 API

**목표:** `GET /api/users/me/coach-report`와 `POST /api/users/me/coach-report/rebuild` 엔드포인트를 노출한다.

### Task 12: AI 성장 리포트 서비스 추가

**파일:**
- 생성: `backend/analysis/service/ai-growth-report.service.js`
- 테스트: `test/analysis/service/ai-growth-report.service.test.js`

- [ ] **단계 1: 실패하는 테스트 작성**

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const { createAiGrowthReportService } = require('../../../backend/analysis/service/ai-growth-report.service');

test('getCoachReport returns fallback for insufficient history', async () => {
  const service = createAiGrowthReportService({
    historyRepo: { getRecentHistory: async () => ({ sessions: [], metrics: [], events: [] }) },
  });

  const response = await service.getCoachReport({ userId: 'u1', period: 'recent_5', exercise: 'squat' });
  assert.equal(response.status, 'completed');
  assert.equal(response.source, 'generated');
  assert.equal(response.isFallback, true);
  assert.equal(response.fallbackReason, 'INSUFFICIENT_HISTORY');
});
```

- [ ] **단계 2: 테스트 실행 — 실패 확인**

실행: `node --test test/analysis/service/ai-growth-report.service.test.js`

예상: 모듈 없음 오류로 실패.

- [ ] **단계 3: 서비스 구현**

```js
const { createWorkoutHistoryRepository } = require('../repository/workout-history.repository');
const { analyzeHistoryTrend } = require('../history-trend/history-trend-analyzer');
const { loadMetricGuide } = require('../metric-guides');
const { generateFallbackGrowthReport } = require('../llm-coach/fallback-growth-report-generator');
const { buildGrowthReportPrompt } = require('../llm-coach/prompt-builder');
const { createLlmClient } = require('../llm-coach/llm-client');
const { validateGrowthReportOutput } = require('../llm-coach/output-validator');

function createAiGrowthReportService({
  historyRepo = createWorkoutHistoryRepository(),
  llmClient = createLlmClient(),
} = {}) {
  async function getCoachReport({ userId, period = 'recent_5', exercise = 'squat', forceRebuild = false } = {}) {
    const history = await historyRepo.getRecentHistory({ userId, exercise, limit: period === 'recent_10' ? 10 : 5 });
    if ((history.sessions || []).length < 2) {
      const result = generateFallbackGrowthReport({ feature: { data_quality: { confidence_label: 'low', note: '최근 운 동 기록이 2회 미만입니다.' }, overall: { trend: 'stable' }, next_focus_candidates: [] }, reason: 'INSUFFICIENT_HISTORY' });
      const payload = buildPayload({ status: 'completed', result, isFallback: true, fallbackReason: 'INSUFFICIENT_HISTORY' });
      return buildResponse({ source: 'generated', payload });
    }

    const firstSession = history.sessions[history.sessions.length - 1] || {};
    const feature = analyzeHistoryTrend({
      userId,
      period,
      exerciseKey: exercise,
      exerciseName: firstSession.exercise_name || exercise,
      sessions: history.sessions,
      metrics: history.metrics,
      events: history.events,
    });
    const metricGuide = loadMetricGuide(exercise);
    const lowConfidence = feature.data_quality.overall_confidence < 0.35;
    let result;
    let isFallback = false;
    let fallbackReason = null;
    let llmModel = null;

    if (lowConfidence) {
      result = generateFallbackGrowthReport({ feature, reason: 'LOW_CONFIDENCE' });
      isFallback = true;
      fallbackReason = 'LOW_CONFIDENCE';
    } else {
      try {
        const prompt = buildGrowthReportPrompt({ feature, metricGuide });
        const llm = await llmClient.generateJson(prompt);
        const validation = validateGrowthReportOutput(llm.output);
        if (!validation.valid) throw new Error(`SCHEMA_INVALID: ${validation.errors.join(', ')}`);
        result = llm.output;
        llmModel = llm.model;
      } catch (error) {
        result = generateFallbackGrowthReport({ feature, reason: 'PROVIDER_ERROR' });
        isFallback = true;
        fallbackReason = error.message?.startsWith('SCHEMA_INVALID') ? 'SCHEMA_INVALID' : 'PROVIDER_ERROR';
      }
    }

    const payload = buildPayload({ status: 'completed', feature, result, isFallback, fallbackReason, llmModel });
    return buildResponse({ source: 'generated', payload });
  }

  function buildPayload({ status, feature = null, result, isFallback, fallbackReason, llmModel = null }) {
    return {
      report_version: 'growth_report_v1',
      history_feature_version: 'htf_v1',
      status,
      history_context: feature,
      llm_output_json: result,
      is_fallback: isFallback,
      fallback_reason: fallbackReason,
      llm_model: llmModel,
      created_at: new Date().toISOString(),
    };
  }

  return { getCoachReport };
}

function buildResponse({ source, payload }) {
  return {
    status: payload.status || 'completed',
    source,
    reportVersion: payload.report_version || 'growth_report_v1',
    historyFeatureVersion: payload.history_feature_version || 'htf_v1',
    period: payload.period,
    exercise: payload.exercise_key,
    result: payload.llm_output_json,
    isFallback: payload.is_fallback === true,
    fallbackReason: payload.fallback_reason || null,
    createdAt: payload.created_at,
  };
}

module.exports = { createAiGrowthReportService };
```

- [ ] **단계 4: 테스트 실행**

실행: `node --test test/analysis/service/ai-growth-report.service.test.js`

예상: 성공.

- [ ] **단계 5: 커밋**

```bash
git add backend/analysis/service/ai-growth-report.service.js test/analysis/service/ai-growth-report.service.test.js
git commit -m "feat(analysis): orchestrate AI growth reports"
```

### Task 13: 컨트롤러와 라우트 추가

**파일:**
- 생성: `backend/analysis/controller/ai-growth-report.controller.js`
- 수정: `routes/main.js`
- 테스트: `test/analysis/controller/ai-growth-report.controller.test.js`

- [ ] **단계 1: 컨트롤러 테스트 작성**

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const { createAiGrowthReportController } = require('../../../backend/analysis/controller/ai-growth-report.controller');

test('getCoachReport sends service response for authenticated user', async () => {
  const controller = createAiGrowthReportController({
    service: { getCoachReport: async (input) => ({ status: 'completed', exercise: input.exercise }) },
  });
  const req = { query: { period: 'recent_5', exercise: 'squat' } };
  const res = {
    locals: { user: { user_id: 'u1' } },
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };

  await controller.getCoachReport(req, res);
  assert.equal(res.body.status, 'completed');
  assert.equal(res.body.exercise, 'squat');
});
```

- [ ] **단계 2: 테스트 실행 — 실패 확인**

실행: `node --test test/analysis/controller/ai-growth-report.controller.test.js`

예상: 모듈 없음 오류로 실패.

- [ ] **단계 3: 컨트롤러 구현**

```js
const { createAiGrowthReportService } = require('../service/ai-growth-report.service');

function createAiGrowthReportController({ service = createAiGrowthReportService() } = {}) {
  async function getCoachReport(req, res) {
    const userId = res.locals.user?.user_id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const result = await service.getCoachReport({
        userId,
        period: normalizePeriod(req.query.period),
        exercise: normalizeExercise(req.query.exercise),
      });
      return res.json(result);
    } catch (error) {
      console.error('AI growth report error:', error.message);
      return res.status(500).json({ error: 'AI growth report unavailable' });
    }
  }

  async function rebuildCoachReport(req, res) {
    const userId = res.locals.user?.user_id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const result = await service.getCoachReport({
        userId,
        period: normalizePeriod(req.body?.period),
        exercise: normalizeExercise(req.body?.exercise),
        forceRebuild: true,
      });
      return res.json(result);
    } catch (error) {
      console.error('AI growth report rebuild error:', error.message);
      return res.status(500).json({ error: 'AI growth report unavailable' });
    }
  }

  return { getCoachReport, rebuildCoachReport };
}

function normalizePeriod(period) {
  return ['recent_5', 'recent_10', 'last_7_days', 'last_30_days'].includes(period) ? period : 'recent_5';
}

function normalizeExercise(exercise) {
  const value = String(exercise || 'squat').trim().toLowerCase();
  if (value === 'pushup') return 'push_up';
  return ['squat', 'push_up', 'plank', 'all'].includes(value) ? value : 'squat';
}

module.exports = { createAiGrowthReportController, normalizePeriod, normalizeExercise };
```

- [ ] **단계 4: `routes/main.js`에 라우트 연결**

기존 `/api/history` 라우트 근처에 추가:

```js
const { createAiGrowthReportController } = require('../backend/analysis/controller/ai-growth-report.controller');
const aiGrowthReportController = createAiGrowthReportController();

router.get('/api/users/me/coach-report', requireAuth, aiGrowthReportController.getCoachReport);
router.post('/api/users/me/coach-report/rebuild', requireAuth, aiGrowthReportController.rebuildCoachReport);
```

- [ ] **단계 5: 테스트 실행**

실행: `node --test test/analysis/controller/ai-growth-report.controller.test.js`

예상: 성공.

- [ ] **단계 6: 커밋**

```bash
git add backend/analysis/controller/ai-growth-report.controller.js routes/main.js test/analysis/controller/ai-growth-report.controller.test.js
git commit -m "feat(api): expose AI growth report endpoints"
```

---
