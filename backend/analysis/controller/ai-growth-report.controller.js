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
  return ['recent_3', 'recent_5', 'recent_10', 'last_7_days', 'last_30_days'].includes(period) ? period : 'recent_5';
}

function normalizeExercise(exercise) {
  const value = String(exercise || 'squat').trim().toLowerCase();
  if (value === 'pushup') return 'push_up';
  return ['squat', 'push_up', 'plank', 'all'].includes(value) ? value : 'squat';
}

module.exports = { createAiGrowthReportController, normalizePeriod, normalizeExercise };
