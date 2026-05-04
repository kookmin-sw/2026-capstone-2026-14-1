const { createWorkoutHistoryRepository } = require('../repository/workout-history.repository');
const { analyzeHistoryTrend } = require('../history-trend/history-trend-analyzer');
const { loadMetricGuide } = require('../metric-guides');
const { generateFallbackGrowthReport } = require('../llm-coach/fallback-growth-report-generator');
const { buildGrowthReportPrompt } = require('../llm-coach/prompt-builder');
const { createLlmClient } = require('../llm-coach/llm-client');
const { validateGrowthReportOutput } = require('../llm-coach/output-validator');

const REPORT_VERSION = 'growth_report.v1';
const HISTORY_FEATURE_VERSION = 'htf_v1';

function createAiGrowthReportService({
  historyRepo = createWorkoutHistoryRepository(),
  llmClient = createLlmClient(),
} = {}) {
  async function getCoachReport({ userId, period = 'recent_5', exercise = 'squat' } = {}) {
    const history = await historyRepo.getRecentHistory({ userId, exercise, limit: period === 'recent_10' ? 10 : 5 });

    if ((history.sessions || []).length < 2) {
      const result = generateFallbackGrowthReport({
        feature: { data_quality: { confidence_label: 'low', note: '최근 운동 기록이 2회 미만입니다.' }, overall: { trend: 'stable' }, next_focus_candidates: [] },
        reason: 'INSUFFICIENT_HISTORY',
      });
      return buildResponse({ source: 'generated', result, isFallback: true, fallbackReason: 'INSUFFICIENT_HISTORY', period, exercise });
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

    const lowConfidence = feature.data_quality.overall_confidence < 0.35;
    let result;
    let isFallback = false;
    let fallbackReason = null;

    if (lowConfidence) {
      result = generateFallbackGrowthReport({ feature, reason: 'LOW_CONFIDENCE' });
      isFallback = true;
      fallbackReason = 'LOW_CONFIDENCE';
    } else {
      try {
        const metricGuide = loadMetricGuide(exercise);
        const prompt = buildGrowthReportPrompt({ feature, metricGuide });
        const llm = await llmClient.generateJson(prompt);
        const validation = validateGrowthReportOutput(llm.output);
        if (!validation.valid) throw new Error(`SCHEMA_INVALID: ${validation.errors.join(', ')}`);
        result = llm.output;
      } catch (error) {
        result = generateFallbackGrowthReport({ feature, reason: 'PROVIDER_ERROR' });
        isFallback = true;
        fallbackReason = error.message?.startsWith('SCHEMA_INVALID') ? 'SCHEMA_INVALID' : 'PROVIDER_ERROR';
      }
    }

    return buildResponse({ source: 'generated', result, isFallback, fallbackReason, period, exercise, historyFeatureVersion: feature.feature_version });
  }

  return { getCoachReport };
}

function buildResponse({ source, result, isFallback, fallbackReason, period, exercise, historyFeatureVersion }) {
  return {
    status: 'completed',
    source,
    reportVersion: REPORT_VERSION,
    historyFeatureVersion: historyFeatureVersion || HISTORY_FEATURE_VERSION,
    period,
    exercise,
    result,
    isFallback,
    fallbackReason: fallbackReason || null,
    createdAt: new Date().toISOString(),
  };
}

module.exports = { createAiGrowthReportService };
