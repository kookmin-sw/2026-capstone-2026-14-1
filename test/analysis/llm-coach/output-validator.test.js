const test = require('node:test');
const assert = require('node:assert/strict');

const { validateGrowthReportOutput } = require('../../../backend/analysis/llm-coach/output-validator');

test('validateGrowthReportOutput accepts valid output', () => {
  const output = {
    summary: '최근 기록이 좋아지고 있습니다.',
    improvements: [],
    weak_points: [],
    next_mission: { title: '무릎 정렬', action: '무릎과 발끝 방향을 맞추세요.', reason: '반복 약점입니다.', metric_key: 'knee_alignment' },
    data_quality_note: { label: 'medium', message: '일부 카메라 이슈가 있었습니다.' },
    coach_comment: '다음 운동에서는 한 가지에 집중해 보세요.',
  };
  assert.equal(validateGrowthReportOutput(output).valid, true);
  assert.deepEqual(validateGrowthReportOutput(output).errors, []);
});

test('validateGrowthReportOutput rejects missing next_mission', () => {
  const result = validateGrowthReportOutput({ summary: 'x' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('next_mission is required'));
});

test('validateGrowthReportOutput rejects improvements exceeding maxItems', () => {
  const output = {
    summary: 's',
    improvements: [{}, {}, {}],
    weak_points: [],
    next_mission: { title: 't', action: 'a', reason: 'r', metric_key: 'm' },
    data_quality_note: { label: 'high', message: 'm' },
    coach_comment: 'c',
  };
  const result = validateGrowthReportOutput(output);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('improvements must contain at most 2 items'));
});

test('validateGrowthReportOutput rejects invalid data_quality_note label', () => {
  const output = {
    summary: 's',
    improvements: [],
    weak_points: [],
    next_mission: { title: 't', action: 'a', reason: 'r', metric_key: 'm' },
    data_quality_note: { label: 'invalid', message: 'm' },
    coach_comment: 'c',
  };
  const result = validateGrowthReportOutput(output);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('data_quality_note.label must be high, medium, or low'));
});

test('validateGrowthReportOutput rejects missing next_mission.metric_key', () => {
  const output = {
    summary: 's',
    improvements: [],
    weak_points: [],
    next_mission: { title: 't', action: 'a', reason: 'r' },
    data_quality_note: { label: 'high', message: 'm' },
    coach_comment: 'c',
  };
  const result = validateGrowthReportOutput(output);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('next_mission.metric_key is required'));
});
