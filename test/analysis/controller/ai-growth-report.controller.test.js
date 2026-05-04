const test = require('node:test');
const assert = require('node:assert/strict');

const { createAiGrowthReportController, normalizePeriod, normalizeExercise } = require('../../../backend/analysis/controller/ai-growth-report.controller');

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

test('getCoachReport returns 401 when user missing', async () => {
  const controller = createAiGrowthReportController({
    service: { getCoachReport: async () => ({}) },
  });
  const req = { query: {} };
  const res = {
    locals: {},
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };

  await controller.getCoachReport(req, res);
  assert.equal(res.statusCode, 401);
});

test('getCoachReport returns 500 when service throws', async () => {
  const controller = createAiGrowthReportController({
    service: { getCoachReport: async () => { throw new Error('DB down'); } },
  });
  const req = { query: {} };
  const res = {
    locals: { user: { user_id: 'u1' } },
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };

  await controller.getCoachReport(req, res);
  assert.equal(res.statusCode, 500);
  assert.match(res.body.error, /unavailable/);
});

test('rebuildCoachReport sends service response with forceRebuild', async () => {
  const controller = createAiGrowthReportController({
    service: { getCoachReport: async (input) => ({ status: 'completed', forceRebuild: input.forceRebuild }) },
  });
  const req = { body: { period: 'recent_10', exercise: 'push_up' } };
  const res = {
    locals: { user: { user_id: 'u1' } },
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };

  await controller.rebuildCoachReport(req, res);
  assert.equal(res.body.status, 'completed');
  assert.equal(res.body.forceRebuild, true);
});

test('normalizePeriod accepts valid periods', () => {
  assert.equal(normalizePeriod('recent_5'), 'recent_5');
  assert.equal(normalizePeriod('recent_10'), 'recent_10');
  assert.equal(normalizePeriod('last_7_days'), 'last_7_days');
  assert.equal(normalizePeriod('last_30_days'), 'last_30_days');
});

test('normalizePeriod defaults invalid periods to recent_5', () => {
  assert.equal(normalizePeriod('invalid'), 'recent_5');
  assert.equal(normalizePeriod(undefined), 'recent_5');
  assert.equal(normalizePeriod(null), 'recent_5');
});

test('normalizeExercise accepts valid exercises', () => {
  assert.equal(normalizeExercise('squat'), 'squat');
  assert.equal(normalizeExercise('push_up'), 'push_up');
  assert.equal(normalizeExercise('plank'), 'plank');
  assert.equal(normalizeExercise('all'), 'all');
});

test('normalizeExercise normalizes pushup alias', () => {
  assert.equal(normalizeExercise('pushup'), 'push_up');
});

test('normalizeExercise defaults invalid exercises to squat', () => {
  assert.equal(normalizeExercise('invalid'), 'squat');
  assert.equal(normalizeExercise(undefined), 'squat');
});
