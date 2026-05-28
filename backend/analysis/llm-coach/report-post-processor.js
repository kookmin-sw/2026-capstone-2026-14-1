function postProcessGrowthReportOutput({ output, feature } = {}) {
  if (!output || typeof output !== 'object') return output;

  const processed = {
    ...output,
    improvements: Array.isArray(output.improvements) ? [...output.improvements] : [],
    weak_points: Array.isArray(output.weak_points) ? [...output.weak_points] : [],
    next_mission: output.next_mission && typeof output.next_mission === 'object'
      ? { ...output.next_mission }
      : output.next_mission,
    data_quality_note: output.data_quality_note && typeof output.data_quality_note === 'object'
      ? { ...output.data_quality_note }
      : output.data_quality_note,
  };

  applyAuthoritativeDataQuality(processed, feature);
  applyDoingWellGuard(processed, feature);
  applyAuthoritativeWeakPoints(processed, feature);
  applyDetailedReportItems(processed, feature);
  applyMissionMetricGuard(processed, feature);
  applyNarrativeDetailGuard(processed, feature);

  return processed;
}

function applyAuthoritativeDataQuality(report, feature) {
  const dataQuality = feature?.data_quality;
  if (!dataQuality || typeof dataQuality !== 'object') return;

  report.data_quality_note = {
    label: normalizeQualityLabel(dataQuality.confidence_label),
    message: typeof dataQuality.note === 'string' && dataQuality.note.trim()
      ? dataQuality.note
      : defaultQualityMessage(dataQuality.confidence_label),
  };
}

function applyDoingWellGuard(report, feature) {
  if (feature?.is_doing_well !== true) return;

  report.weak_points = [];

  const mission = report.next_mission && typeof report.next_mission === 'object'
    ? report.next_mission
    : {};
  const metricKey = String(mission.metric_key || '');
  if (!metricKey || !isAllowedMissionMetric(metricKey, feature)) {
    report.next_mission = {
      title: mission.title || '현재 자세 유지',
      action: mission.action || '다음 운동에서도 같은 자세 흐름을 유지하세요.',
      reason: mission.reason || '최근 기록이 안정적이므로 새로운 약점보다 일관성 유지가 우선입니다.',
      metric_key: 'general_maintenance',
    };
  }
}

function applyAuthoritativeWeakPoints(report, feature) {
  if (feature?.is_doing_well === true) return;

  const featureWeakPoints = Array.isArray(feature?.weak_points)
    ? feature.weak_points.filter((item) => String(item?.metric_key || '').trim())
    : [];
  if (featureWeakPoints.length === 0) return;

  const currentWeakPoints = Array.isArray(report.weak_points) ? report.weak_points : [];
  const authoritativeKeys = new Set(featureWeakPoints.map((item) => String(item.metric_key).trim()));
  const seededWeakPoints = featureWeakPoints.map((source) => {
    const existing = findMetricSource(source.metric_key, currentWeakPoints);
    return {
      ...(existing || {}),
      title: existing?.title || source.metric_name || '보완할 자세 요소',
      metric_key: source.metric_key,
    };
  });
  const extraWeakPoints = currentWeakPoints.filter((item) => {
    const key = String(item?.metric_key || '').trim();
    return key && !authoritativeKeys.has(key);
  });

  report.weak_points = [...seededWeakPoints, ...extraWeakPoints];
}

function applyMissionMetricGuard(report, feature) {
  const mission = report.next_mission;
  if (!mission || typeof mission !== 'object') return;

  const metricKey = String(mission.metric_key || '');
  const correctiveFocus = firstCorrectiveFocus(feature);
  if (correctiveFocus && (
    !metricKey ||
    metricKey === 'general_maintenance' ||
    !isAllowedMissionMetric(metricKey, feature) ||
    !isCorrectiveMissionMetric(metricKey, feature)
  )) {
    applyCorrectiveMission(mission, correctiveFocus);
    return;
  }

  if (!metricKey || !isAllowedMissionMetric(metricKey, feature)) {
    mission.metric_key = 'general_maintenance';
  }
}

function applyDetailedReportItems(report, feature) {
  report.improvements = enrichImprovements(report.improvements, feature).slice(0, 2);
  report.weak_points = enrichWeakPoints(report.weak_points, feature).slice(0, 2);
}

function applyNarrativeDetailGuard(report, feature) {
  if (isShortText(report.summary, 90)) {
    report.summary = buildDetailedSummary(feature);
  }

  if (report.next_mission && typeof report.next_mission === 'object' && isShortText(report.next_mission.action, 60)) {
    report.next_mission.action = buildDetailedMissionAction(report.next_mission, feature);
  }

  if (isShortText(report.coach_comment, 80)) {
    report.coach_comment = buildDetailedCoachComment(report, feature);
  }
}

function isShortText(value, minLength) {
  return typeof value !== 'string' || value.trim().length < minLength;
}

function buildDetailedSummary(feature) {
  const period = feature?.user_scope?.period_label || `최근 ${feature?.user_scope?.session_count || 5}회`;
  const exercise = feature?.user_scope?.exercise_name || '운동';
  const recentAvg = formatScore(feature?.overall?.recent_avg_score);
  const previousAvg = formatScore(feature?.overall?.previous_avg_score);
  const delta = formatSigned(feature?.overall?.score_delta);
  const completed = Number(feature?.overall?.completed_sessions || 0);
  const trend = trendLabel(feature?.overall?.trend);
  const focus = firstFocusMetric(feature);

  const scoreText = recentAvg !== null
    ? `${period} ${exercise} 평균은 ${recentAvg}점`
    : `${period} ${exercise} 기록`;
  const compareText = previousAvg !== null && delta !== null
    ? `이전 평균 ${previousAvg}점 대비 ${delta}점 변화했습니다`
    : `${trend} 흐름으로 확인됩니다`;
  const completionText = completed > 0 ? `${completed}회 완료 기록을 기준으로 분석했습니다` : '기록된 세션을 기준으로 분석했습니다';
  const focusText = focus
    ? `다음 운동에서는 ${focus.metric_name || focus.metric_key}을 가장 먼저 점검하는 것이 좋습니다.`
    : '다음 운동에서는 현재 자세 흐름을 유지하면서 한 가지 지표를 집중해서 점검하는 것이 좋습니다.';

  return `${scoreText}이며, ${compareText}. ${completionText}. ${focusText}`;
}

function buildDetailedMissionAction(mission, feature) {
  const focus = firstFocusMetric(feature);
  const cues = Array.isArray(focus?.recommended_cues) ? focus.recommended_cues.filter(Boolean) : [];
  const metricName = mission?.title || focus?.metric_name || '오늘의 집중 지표';

  if (cues.length > 0) {
    const first = cues[0];
    const second = cues[1] || `${metricName}가 반복 내내 유지되는지 확인하세요`;
    return `첫째, ${first}. 둘째, ${second}. 반복 수를 늘리기보다 각 rep가 끝난 뒤 이 지표가 유지됐는지 먼저 확인하세요.`;
  }

  return `첫째, 다음 세트 시작 전에 ${metricName} 기준을 한 번 확인하세요. 둘째, 내려가는 구간과 올라오는 구간에서 같은 기준이 유지되는지 천천히 점검하세요.`;
}

function buildDetailedCoachComment(report, feature) {
  const positive = report.improvements?.[0]?.title || buildStablePerformanceTitle(feature);
  const weak = report.weak_points?.[0]?.title || firstFocusMetric(feature)?.metric_name || '오늘의 집중 지표';
  const exercise = feature?.user_scope?.exercise_name || '운동';

  return `${exercise} 기록에서 ${positive} 흐름은 유지할 만한 강점입니다. 동시에 ${weak}은 다음 세트에서 점수보다 먼저 확인해야 할 지표입니다. 한 번에 여러 자세를 바꾸기보다 이 지표 하나를 정해 천천히 반복해보세요.`;
}

function firstCorrectiveFocus(feature) {
  if (feature?.is_doing_well === true) return null;
  return firstMetricFrom(feature?.next_focus_candidates) ||
    firstMetricFrom(feature?.weak_points) ||
    firstMetricFrom(feature?.regressions) ||
    null;
}

function firstMetricFrom(collection) {
  if (!Array.isArray(collection)) return null;
  return collection.find((item) => String(item?.metric_key || '').trim()) || null;
}

function applyCorrectiveMission(mission, focus) {
  const name = focus.metric_name || focus.metric_key || '집중 지표';
  const originalMetricKey = String(mission.metric_key || '');
  const wasMaintenance = String(mission.metric_key || '') === 'general_maintenance' ||
    /유지|maintenance/i.test(String(mission.title || ''));
  const wasOffFocus = originalMetricKey !== String(focus.metric_key || '');

  mission.metric_key = focus.metric_key;
  if (wasMaintenance || wasOffFocus || !mission.title || !String(mission.title).includes(name)) {
    mission.title = `${name} 집중`;
  }
  if (wasMaintenance || wasOffFocus || !mission.reason) {
    mission.reason = focus.reason || `${name}이 최근 기록에서 반복적으로 낮게 측정되어 다음 세트의 우선 점검 지표입니다.`;
  }
  if (wasMaintenance || wasOffFocus || !mission.action) {
    mission.action = buildCorrectiveMissionAction(focus);
  }
}

function buildCorrectiveMissionAction(focus) {
  const name = focus.metric_name || focus.metric_key || '집중 지표';
  const cues = Array.isArray(focus.recommended_cues) ? focus.recommended_cues.filter(Boolean) : [];
  if (cues.length > 0) {
    const second = cues[1] || `${name}이 반복 내내 유지되는지 확인하세요`;
    return `첫째, ${cues[0]}. 둘째, ${second}.`;
  }
  return `첫째, 다음 세트 시작 전에 ${name} 기준을 확인하세요. 둘째, 내려가는 구간과 올라오는 구간에서 같은 기준이 유지되는지 점검하세요.`;
}

function firstFocusMetric(feature) {
  return feature?.next_focus_candidates?.[0] ||
    feature?.weak_points?.[0] ||
    feature?.regressions?.[0] ||
    feature?.improvements?.[0] ||
    null;
}

function trendLabel(trend) {
  if (trend === 'improving') return '개선되는';
  if (trend === 'declining') return '하락하는';
  return '안정적인';
}

function enrichImprovements(improvements, feature) {
  const result = Array.isArray(improvements) ? improvements.map((item) => ({ ...item })) : [];
  const featureImprovements = Array.isArray(feature?.improvements) ? feature.improvements : [];

  for (let index = 0; index < result.length; index += 1) {
    const item = result[index];
    const source = findMetricSource(item?.metric_key, featureImprovements) || featureImprovements[index];
    result[index] = {
      ...item,
      title: item.title || source?.metric_name || buildStablePerformanceTitle(feature),
      evidence: detailedPositiveEvidence(source, feature, item.evidence),
      meaning: item.meaning || detailedPositiveMeaning(source, feature),
    };
  }

  if (result.length === 0 && hasPositiveOverallSignal(feature)) {
    result.push({
      title: buildStablePerformanceTitle(feature),
      evidence: detailedPositiveEvidence(null, feature),
      meaning: detailedPositiveMeaning(null, feature),
      metric_key: 'overall_score',
    });
  }

  return result;
}

function enrichWeakPoints(weakPoints, feature) {
  const result = Array.isArray(weakPoints) ? weakPoints.map((item) => ({ ...item })) : [];
  const featureWeakPoints = Array.isArray(feature?.weak_points) ? feature.weak_points : [];

  return result.map((item, index) => {
    const source = findMetricSource(item?.metric_key, featureWeakPoints) || featureWeakPoints[index];
    return {
      ...item,
      title: item.title || source?.metric_name || '보완할 자세 요소',
      evidence: detailedWeakEvidence(source, item.evidence),
      meaning: item.meaning || detailedWeakMeaning(source),
      metric_key: source?.metric_key || item.metric_key,
    };
  });
}

function detailedPositiveEvidence(source, feature, fallback = null) {
  if (source) {
    const name = source.metric_name || '해당 지표';
    const previous = formatScore(source.previous_avg);
    const recent = formatScore(source.recent_avg);
    const delta = formatSigned(source.delta);
    if (previous !== null && recent !== null && delta !== null) {
      return `${name} 점수가 이전 평균 ${previous}점에서 최근 평균 ${recent}점으로 ${delta}점 개선되었습니다.`;
    }
    if (recent !== null) return `${name} 최근 평균이 ${recent}점으로 안정적인 수준입니다.`;
  }

  const period = feature?.user_scope?.period_label || `최근 ${feature?.user_scope?.session_count || 5}회`;
  const avg = formatScore(feature?.overall?.recent_avg_score);
  const completed = Number(feature?.overall?.completed_sessions || 0);
  const trend = feature?.overall?.trend === 'improving' ? '개선되는 흐름' : '안정적인 흐름';
  if (avg !== null && completed > 0) {
    return `${period} 동안 ${completed}회 완료했고 평균 ${avg}점으로 ${trend}을 유지했습니다.`;
  }
  return fallback || `${period} 기록에서 전체 수행 흐름이 안정적으로 확인되었습니다.`;
}

function detailedPositiveMeaning(source, feature) {
  if (source) {
    return `${source.metric_name || '해당 지표'}가 좋아졌다는 것은 반복 중 해당 자세 요소가 이전보다 덜 흔들리고 있다는 의미입니다.`;
  }
  const exercise = feature?.user_scope?.exercise_name || '운동';
  return `${exercise} 전체 동작에서 큰 자세 붕괴 없이 반복을 유지하고 있다는 의미입니다. 현재의 기본 폼을 유지하는 것이 우선입니다.`;
}

function detailedWeakEvidence(source, fallback = null) {
  if (!source) return fallback || '최근 기록에서 반복적으로 낮게 측정되었습니다.';
  if (source.severity === 'relative_low' && typeof source.evidence === 'string' && source.evidence.trim()) {
    return withSentencePunctuation(source.evidence.trim());
  }

  const name = source.metric_name || '해당 지표';
  const sessionCount = Number(source.session_count || source.recent_session_count || 0);
  const occurrence = Number(source.occurrence_count || source.occurrence_count_below_60 || 0);
  const recent = formatScore(source.recent_avg);
  const parts = [];
  if (sessionCount > 0 && occurrence > 0) {
    parts.push(`최근 ${sessionCount}회 중 ${occurrence}회에서 ${name}이 낮게 측정되었습니다`);
  }
  if (recent !== null) {
    parts.push(`최근 평균은 ${recent}점입니다`);
  }
  if (parts.length > 0) return `${parts.join(', ')}.`;
  return fallback || `${name}이 최근 기록에서 반복적으로 낮게 측정되었습니다.`;
}

function withSentencePunctuation(value) {
  return /[.!?。]$/.test(value) ? value : `${value}.`;
}

function detailedWeakMeaning(source) {
  const name = source?.metric_name || '해당 자세 요소';
  const key = String(source?.metric_key || '');
  if (key.includes('heel')) {
    return `${name}가 흔들리면 스쿼트 중 무게 중심이 앞으로 쏠려 하체 안정성과 반복 깊이가 같이 흔들릴 수 있습니다.`;
  }
  if (key.includes('knee')) {
    return `${name}이 흔들리면 무릎 방향과 하체 정렬이 무너져 반복 품질이 낮아질 수 있습니다.`;
  }
  if (key.includes('depth')) {
    return `${name}이 부족하면 충분한 가동 범위로 앉지 못해 스쿼트 반복의 완성도가 낮아질 수 있습니다.`;
  }
  if (key.includes('trunk') || key.includes('spine') || key.includes('body')) {
    return `${name}이 흔들리면 몸통 라인이 무너져 동작 전체의 안정성이 낮아질 수 있습니다.`;
  }
  return `${name}이 반복적으로 낮게 나오면 해당 자세 요소가 운동 품질을 제한하고 있다는 의미입니다.`;
}

function hasPositiveOverallSignal(feature) {
  const avg = Number(feature?.overall?.recent_avg_score);
  const completed = Number(feature?.overall?.completed_sessions || 0);
  return completed >= 2 && Number.isFinite(avg) && avg >= 75;
}

function buildStablePerformanceTitle(feature) {
  if (feature?.overall?.trend === 'improving') return '전체 점수 개선';
  return '높은 평균 점수 유지';
}

function findMetricSource(metricKey, collection) {
  const key = String(metricKey || '').trim();
  if (!key || !Array.isArray(collection)) return null;
  return collection.find((item) => String(item?.metric_key || '').trim() === key) || null;
}

function formatScore(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Number(number.toFixed(1)).toString();
}

function formatSigned(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return `${number > 0 ? '+' : ''}${Number(number.toFixed(1))}`;
}

function isAllowedMissionMetric(metricKey, feature) {
  if (metricKey === 'general_maintenance') return true;
  return collectAllowedMetricKeys(feature).has(metricKey);
}

function isCorrectiveMissionMetric(metricKey, feature) {
  return collectCorrectiveMetricKeys(feature).has(metricKey);
}

function collectAllowedMetricKeys(feature) {
  const keys = new Set();
  for (const collection of [
    feature?.next_focus_candidates,
    feature?.improvements,
    feature?.weak_points,
    feature?.regressions,
  ]) {
    if (!Array.isArray(collection)) continue;
    for (const item of collection) {
      const key = String(item?.metric_key || '').trim();
      if (key) keys.add(key);
    }
  }
  return keys;
}

function collectCorrectiveMetricKeys(feature) {
  const keys = new Set();
  for (const collection of [
    feature?.next_focus_candidates,
    feature?.weak_points,
    feature?.regressions,
  ]) {
    if (!Array.isArray(collection)) continue;
    for (const item of collection) {
      const key = String(item?.metric_key || '').trim();
      if (key) keys.add(key);
    }
  }
  return keys;
}

function normalizeQualityLabel(label) {
  return ['high', 'medium', 'low'].includes(label) ? label : 'medium';
}

function defaultQualityMessage(label) {
  if (label === 'low') return '운동 기록 품질이 낮아 참고용으로 확인해 주세요.';
  if (label === 'high') return '분석에 사용된 최근 기록은 충분한 품질로 확인되었습니다.';
  return '분석에 사용된 최근 기록은 보통 수준의 품질로 확인되었습니다.';
}

module.exports = { postProcessGrowthReportOutput };
