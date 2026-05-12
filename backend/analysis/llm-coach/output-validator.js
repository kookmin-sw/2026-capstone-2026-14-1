function validateGrowthReportOutput(output) {
  normalizeGrowthReportOutput(output);

  const errors = [];
  if (!output || typeof output !== 'object') errors.push('output must be an object');
  if (!output?.summary || typeof output.summary !== 'string') errors.push('summary is required');
  if (!Array.isArray(output?.improvements)) errors.push('improvements must be an array');
  if (!Array.isArray(output?.weak_points)) errors.push('weak_points must be an array');
  if (!output?.next_mission || typeof output.next_mission !== 'object') errors.push('next_mission is required');
  if (!output?.data_quality_note || typeof output.data_quality_note !== 'object') errors.push('data_quality_note is required');
  if (!output?.coach_comment || typeof output.coach_comment !== 'string') errors.push('coach_comment is required');

  if (output?.improvements?.length > 2) errors.push('improvements must contain at most 2 items');
  if (output?.weak_points?.length > 2) errors.push('weak_points must contain at most 2 items');
  if (output?.next_mission && !output.next_mission.metric_key) errors.push('next_mission.metric_key is required');
  if (output?.data_quality_note && !['high', 'medium', 'low'].includes(output.data_quality_note.label)) {
    output.data_quality_note.label = 'medium';
  }

  return { valid: errors.length === 0, errors };
}

function normalizeGrowthReportOutput(output) {
  if (!output || typeof output !== 'object') return;

  const mission = output.next_mission;
  if (mission && typeof mission === 'object') {
    if (!mission.action && typeof mission.description === 'string') {
      mission.action = mission.description;
    }
    if (!mission.reason && typeof mission.description === 'string') {
      mission.reason = mission.description;
    }
    if (!mission.metric_key) {
      mission.metric_key = 'general_maintenance';
    }
  }

  const dataQuality = output.data_quality_note;
  if (dataQuality && typeof dataQuality === 'object') {
    if (!dataQuality.label && typeof dataQuality.confidence_label === 'string') {
      dataQuality.label = dataQuality.confidence_label;
    }
    if (!dataQuality.message && typeof dataQuality.note === 'string') {
      dataQuality.message = dataQuality.note;
    }
  }
}

module.exports = { validateGrowthReportOutput };
