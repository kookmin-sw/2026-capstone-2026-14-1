const fs = require('fs');
const path = require('path');

const skillDir = path.join(__dirname, '..', 'coaching-skills', 'growth-report.v1');

function buildGrowthReportPrompt({ feature, metricGuide } = {}) {
  const systemPrompt = fs.readFileSync(path.join(skillDir, 'prompt.system.txt'), 'utf8').trim();
  const userTemplate = fs.readFileSync(path.join(skillDir, 'prompt.user.txt'), 'utf8').trim();
  const outputSchema = require(path.join(skillDir, 'output-schema.json'));
  const promptFeature = sanitizeFeatureForPrompt(feature);
  const userPrompt = userTemplate
    .replace('{{history_trend_feature_json}}', JSON.stringify(promptFeature, null, 2))
    .replace('{{metric_guide_json}}', JSON.stringify(metricGuide, null, 2))
    .replace('{{output_schema_json}}', JSON.stringify(outputSchema, null, 2));
  return { systemPrompt, userPrompt };
}

function sanitizeFeatureForPrompt(feature) {
  const sanitized = JSON.parse(JSON.stringify(feature || {}));
  if (sanitized.user_scope) delete sanitized.user_scope.user_id;
  return sanitized;
}

module.exports = { buildGrowthReportPrompt };
