const { createWorkoutHistoryRepository } = require('../repository/workout-history.repository');
const { analyzeHistoryTrend } = require('../history-trend/history-trend-analyzer');
const { loadMetricGuide } = require('../metric-guides');
const { generateFallbackGrowthReport } = require('../llm-coach/fallback-growth-report-generator');
const { buildGrowthReportPrompt } = require('../llm-coach/prompt-builder');
const { createLlmClient } = require('../llm-coach/llm-client');
const { validateGrowthReportOutput } = require('../llm-coach/output-validator');
const { postProcessGrowthReportOutput } = require('../llm-coach/report-post-processor');

const REPORT_VERSION = 'growth_report.v1';
const HISTORY_FEATURE_VERSION = 'htf_v1';

function createAiGrowthReportService({
  historyRepo = createWorkoutHistoryRepository(),
  llmClient = createLlmClient(),
  now = () => new Date(),
} = {}) {
  async function getCoachReport({ userId, period = 'recent_5', exercise = 'squat' } = {}) {
    const historyWindow = resolveHistoryWindow(period, now());
    const history = await historyRepo.getRecentHistory({
      userId,
      exercise,
      limit: historyWindow.limit,
      endedAfter: historyWindow.endedAfter,
    });

    const sessionCount = (history.sessions || []).length;
    const minRequired = 2;
    if (sessionCount < minRequired) {
      const result = generateFallbackGrowthReport({
        feature: {
          data_quality: {
            confidence_label: 'low',
            note: `요청한 ${historyWindow.label} 기록 중 ${sessionCount}개만 조회되었습니다.`,
          },
          overall: { trend: 'stable' },
          next_focus_candidates: [],
        },
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

    let result;
    let isFallback = false;
    let fallbackReason = null;

    try {
      const metricGuide = loadMetricGuide(exercise);
      const prompt = buildGrowthReportPrompt({ feature, metricGuide });
      const llm = await llmClient.generateJson(prompt);
      const validation = validateGrowthReportOutput(llm.output);
      if (!validation.valid) throw new Error(`SCHEMA_INVALID: ${validation.errors.join(', ')}`);
      result = postProcessGrowthReportOutput({ output: llm.output, feature });
    } catch (error) {
      result = generateFallbackGrowthReport({ feature, reason: 'PROVIDER_ERROR' });
      isFallback = true;
      fallbackReason = error.message?.startsWith('SCHEMA_INVALID') ? 'SCHEMA_INVALID' : 'PROVIDER_ERROR';
    }

    return buildResponse({ source: 'generated', result, isFallback, fallbackReason, period, exercise, historyFeatureVersion: feature.feature_version });
  }

  return { getCoachReport };
}

function resolveHistoryWindow(period, currentDate = new Date()) {
  const recentMap = {
    recent_3: { limit: 3, label: '최근 3회' },
    recent_5: { limit: 5, label: '최근 5회' },
    recent_10: { limit: 10, label: '최근 10회' },
  };
  if (recentMap[period]) return { ...recentMap[period], endedAfter: null };

  const dateMap = {
    last_7_days: { days: 7, label: '최근 7일' },
    last_30_days: { days: 30, label: '최근 30일' },
  };
  const datePeriod = dateMap[period];
  if (datePeriod) {
    return {
      limit: 50,
      label: datePeriod.label,
      endedAfter: daysBefore(currentDate, datePeriod.days).toISOString(),
    };
  }

  return { ...recentMap.recent_5, endedAfter: null };
}

function daysBefore(date, days) {
  const value = new Date(date);
  value.setUTCDate(value.getUTCDate() - days);
  return value;
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

module.exports = { createAiGrowthReportService, resolveHistoryWindow };
