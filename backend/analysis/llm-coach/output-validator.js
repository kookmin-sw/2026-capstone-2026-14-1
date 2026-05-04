function validateGrowthReportOutput(output) {
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
    errors.push('data_quality_note.label must be high, medium, or low');
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validateGrowthReportOutput };
