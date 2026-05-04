const test = require('node:test');
const assert = require('node:assert/strict');

const { loadMetricGuide, getMetricGuideEntry } = require('../../backend/analysis/metric-guides');

test('loadMetricGuide loads supported exercise guides', () => {
  const guide = loadMetricGuide('squat');
  assert.equal(guide.exercise, 'squat');
  assert.equal(guide.version, 'v1');
  assert.ok(guide.metrics.knee_alignment);
});

test('loadMetricGuide normalizes pushup alias', () => {
  const guide = loadMetricGuide('pushup');
  assert.equal(guide.exercise, 'push_up');
});

test('loadMetricGuide supports all exercise aggregate reports', () => {
  const guide = loadMetricGuide('all');
  assert.equal(guide.exercise, 'all');
  assert.equal(guide.version, 'v1');
});

test('getMetricGuideEntry returns fallback entry for unknown metric', () => {
  const entry = getMetricGuideEntry(loadMetricGuide('squat'), 'unknown_metric');
  assert.equal(entry.display_name, 'unknown_metric');
  assert.equal(entry.safety_priority, 0.5);
  assert.deepEqual(entry.coaching_cues, []);
});

test('push_up guide includes curated emitted metric entries', () => {
  const guide = loadMetricGuide('push_up');

  for (const metricKey of ['elbow_depth', 'hip_angle']) {
    assert.ok(guide.metrics[metricKey]);
    const entry = getMetricGuideEntry(guide, metricKey);
    assert.notEqual(entry.display_name, metricKey);
    assert.notEqual(entry.meaning, metricKey);
    assert.notDeepEqual(entry.coaching_cues, []);
  }
});

test('plank guide includes curated emitted metric entries', () => {
  const guide = loadMetricGuide('plank');

  for (const metricKey of ['hip_angle', 'spine_angle']) {
    assert.ok(guide.metrics[metricKey]);
    const entry = getMetricGuideEntry(guide, metricKey);
    assert.notEqual(entry.display_name, metricKey);
    assert.notEqual(entry.meaning, metricKey);
    assert.notDeepEqual(entry.coaching_cues, []);
  }
});
