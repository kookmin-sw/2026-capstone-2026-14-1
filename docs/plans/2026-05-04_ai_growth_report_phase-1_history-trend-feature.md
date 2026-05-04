# AI Growth Report Phase 1: HistoryTrendFeature

> Parent roadmap: `docs/plans/2026-05-03_ai_growth_report_implementation_plan.md`
> MVP policy: on-demand only. 리포트 결과는 DB에 저장하지 않는다.

## Phase 1: 결정론적 HistoryTrendFeature

**목표:** LLM, 캐시, UI 없이 기존 DB 데이터로 `HistoryTrendFeature` JSON을 생성한다.

### Task 1: 점수 유틸리티 추가

**파일:**
- 생성: `backend/analysis/history-trend/score-utils.js`
- 테스트: `test/analysis/history-trend/score-utils.test.js`

- [ ] **단계 1: 실패하는 테스트 작성**

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  toFiniteNumber,
  clampScore,
  average,
  confidenceLabel,
  normalizeExerciseKey,
} = require('../../../backend/analysis/history-trend/score-utils');

test('clampScore normalizes invalid and out-of-range scores', () => {
  assert.equal(clampScore(120), 100);
  assert.equal(clampScore(-5), 0);
  assert.equal(clampScore('71.7'), 72);
  assert.equal(clampScore(null), 0);
});

test('average ignores invalid values and rounds to one decimal', () => {
  assert.equal(average([50, '61.25', null, NaN]), 55.6);
  assert.equal(average([]), null);
});

test('confidenceLabel maps scores to labels', () => {
  assert.equal(confidenceLabel(0.8), 'high');
  assert.equal(confidenceLabel(0.5), 'medium');
  assert.equal(confidenceLabel(0.2), 'low');
});

test('normalizeExerciseKey supports pushup aliases', () => {
  assert.equal(normalizeExerciseKey('pushup'), 'push_up');
  assert.equal(normalizeExerciseKey('PUSH_UP'), 'push_up');
  assert.equal(normalizeExerciseKey('squat'), 'squat');
});
```

- [ ] **단계 2: 테스트 실행 — 실패 확인**

실행: `node --test test/analysis/history-trend/score-utils.test.js`

예상: `Cannot find module '../../../backend/analysis/history-trend/score-utils'` 오류로 실패.

- [ ] **단계 3: 최소 구현 작성**

```js
function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(toFiniteNumber(value, 0))));
}

function average(values = []) {
  const valid = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (valid.length === 0) return null;
  const sum = valid.reduce((acc, value) => acc + value, 0);
  return Number((sum / valid.length).toFixed(1));
}

function confidenceLabel(score) {
  const value = toFiniteNumber(score, 0);
  if (value >= 0.7) return 'high';
  if (value >= 0.4) return 'medium';
  return 'low';
}

function normalizeExerciseKey(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'pushup') return 'push_up';
  return key;
}

module.exports = {
  toFiniteNumber,
  clampScore,
  average,
  confidenceLabel,
  normalizeExerciseKey,
};
```

- [ ] **단계 4: 테스트 실행 — 성공 확인**

실행: `node --test test/analysis/history-trend/score-utils.test.js`

예상: 4개 테스트 모두 성공.

- [ ] **단계 5: 커밋**

```bash
git add backend/analysis/history-trend/score-utils.js test/analysis/history-trend/score-utils.test.js
git commit -m "test(analysis): add score utility coverage"
```

### Task 2: 메트릭 가이드 추가

**파일:**
- 생성: `backend/analysis/metric-guides/squat.v1.json`
- 생성: `backend/analysis/metric-guides/push_up.v1.json`
- 생성: `backend/analysis/metric-guides/plank.v1.json`
- 생성: `backend/analysis/metric-guides/index.js`
- 테스트: `test/analysis/metric-guides.test.js`

- [ ] **단계 1: 실패하는 테스트 작성**

```js
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

test('getMetricGuideEntry returns fallback entry for unknown metric', () => {
  const entry = getMetricGuideEntry(loadMetricGuide('squat'), 'unknown_metric');
  assert.equal(entry.display_name, 'unknown_metric');
  assert.equal(entry.safety_priority, 0.5);
  assert.deepEqual(entry.coaching_cues, []);
});
```

- [ ] **단계 2: 테스트 실행 — 실패 확인**

실행: `node --test test/analysis/metric-guides.test.js`

예상: 모듈 없음 오류로 실패.

- [ ] **단계 3: 메트릭 가이드 파일 추가**

`backend/analysis/metric-guides/squat.v1.json` 생성:

```json
{
  "exercise": "squat",
  "version": "v1",
  "metrics": {
    "knee_alignment": {
      "display_name": "무릎 정렬",
      "meaning": "무릎과 발끝 방향의 일치 정도",
      "low_score_interpretation": "무릎이 안쪽 또는 바깥쪽으로 흔들릴 수 있음",
      "coaching_cues": ["무릎과 발끝 방향을 맞추세요", "내려갈 때 무릎이 안으로 모이지 않게 하세요"],
      "safety_priority": 0.9,
      "actionability": 0.9,
      "view_compatibility": { "FRONT": 1.0, "SIDE": 0.4 }
    },
    "depth": {
      "display_name": "스쿼트 깊이",
      "meaning": "충분히 내려가는 동작의 안정성",
      "low_score_interpretation": "하강 깊이가 부족할 수 있음",
      "coaching_cues": ["엉덩이를 뒤로 빼며 천천히 내려가세요", "반복 수보다 하강 동작의 일관성을 우선하세요"],
      "safety_priority": 0.6,
      "actionability": 0.8,
      "view_compatibility": { "FRONT": 0.6, "SIDE": 1.0 }
    },
    "spine_angle": {
      "display_name": "상체 각도",
      "meaning": "상체 기울기의 안정성",
      "low_score_interpretation": "상체 각도가 흔들릴 수 있음",
      "coaching_cues": ["가슴을 세우고 상체 각도를 일정하게 유지하세요"],
      "safety_priority": 0.7,
      "actionability": 0.7,
      "view_compatibility": { "FRONT": 0.5, "SIDE": 1.0 }
    }
  }
}
```

`backend/analysis/metric-guides/push_up.v1.json` 생성:

```json
{
  "exercise": "push_up",
  "version": "v1",
  "metrics": {
    "elbow_angle": {
      "display_name": "팔꿈치 각도",
      "meaning": "팔꿈치가 충분히 굽혀지고 펴지는 정도",
      "low_score_interpretation": "팔꿈치 굽힘 깊이가 부족할 수 있음",
      "coaching_cues": ["팔꿈치를 천천히 굽혀 몸을 낮추세요", "팔을 끝까지 밀어 올리세요"],
      "safety_priority": 0.7,
      "actionability": 0.8,
      "view_compatibility": { "FRONT": 0.4, "SIDE": 1.0 }
    },
    "body_line": {
      "display_name": "몸통 정렬",
      "meaning": "머리부터 발까지 일직선을 유지하는 정도",
      "low_score_interpretation": "허리나 엉덩이 위치가 흔들릴 수 있음",
      "coaching_cues": ["머리부터 발끝까지 일직선을 유지하세요", "엉덩이가 처지지 않게 복부에 힘을 주세요"],
      "safety_priority": 0.9,
      "actionability": 0.8,
      "view_compatibility": { "FRONT": 0.5, "SIDE": 1.0 }
    }
  }
}
```

`backend/analysis/metric-guides/plank.v1.json` 생성:

```json
{
  "exercise": "plank",
  "version": "v1",
  "metrics": {
    "body_line": {
      "display_name": "몸통 정렬",
      "meaning": "어깨부터 발목까지 일직선을 유지하는 정도",
      "low_score_interpretation": "허리나 엉덩이 위치가 흔들릴 수 있음",
      "coaching_cues": ["복부에 힘을 주고 몸통을 일직선으로 유지하세요", "엉덩이가 위아래로 흔들리지 않게 하세요"],
      "safety_priority": 0.9,
      "actionability": 0.8,
      "view_compatibility": { "FRONT": 0.5, "SIDE": 1.0 }
    },
    "hip_stability": {
      "display_name": "골반 안정성",
      "meaning": "플랭크 중 골반 높이를 안정적으로 유지하는 정도",
      "low_score_interpretation": "골반이 내려가거나 올라갈 수 있음",
      "coaching_cues": ["골반 높이를 어깨와 같은 선에 맞추세요"],
      "safety_priority": 0.8,
      "actionability": 0.7,
      "view_compatibility": { "FRONT": 0.4, "SIDE": 1.0 }
    }
  }
}
```

- [ ] **단계 4: 메트릭 가이드 로더 추가**

```js
const { normalizeExerciseKey } = require('../history-trend/score-utils');

const guides = {
  squat: require('./squat.v1.json'),
  push_up: require('./push_up.v1.json'),
  plank: require('./plank.v1.json'),
};

function loadMetricGuide(exerciseKey) {
  const normalized = normalizeExerciseKey(exerciseKey);
  const guide = guides[normalized];
  if (!guide) {
    throw new Error(`Unsupported exercise for metric guide: ${exerciseKey}`);
  }
  return guide;
}

function getMetricGuideEntry(guide, metricKey) {
  const key = String(metricKey || '').trim();
  return guide?.metrics?.[key] || {
    display_name: key,
    meaning: key,
    low_score_interpretation: `${key} 점수가 낮게 측정됨`,
    coaching_cues: [],
    safety_priority: 0.5,
    actionability: 0.5,
    view_compatibility: { FRONT: 0.7, SIDE: 0.7 },
  };
}

module.exports = { loadMetricGuide, getMetricGuideEntry };
```

- [ ] **단계 5: 테스트 실행**

실행: `node --test test/analysis/metric-guides.test.js`

예상: 3개 테스트 성공.

- [ ] **단계 6: 커밋**

```bash
git add backend/analysis/metric-guides test/analysis/metric-guides.test.js
git commit -m "feat(analysis): add metric guides for growth reports"
```

### Task 3: 메트릭 트렌드 빌더

**파일:**
- 생성: `backend/analysis/history-trend/metric-trend-builder.js`
- 테스트: `test/analysis/history-trend/metric-trend-builder.test.js`

- [ ] **단계 1: 실패하는 테스트 작성**

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const { buildMetricTrends } = require('../../../backend/analysis/history-trend/metric-trend-builder');

test('buildMetricTrends compares previous and recent windows per metric', () => {
  const sessions = [
    { session_id: 's1', ended_at: '2026-01-01T00:00:00Z' },
    { session_id: 's2', ended_at: '2026-01-02T00:00:00Z' },
    { session_id: 's3', ended_at: '2026-01-03T00:00:00Z' },
    { session_id: 's4', ended_at: '2026-01-04T00:00:00Z' },
  ];
  const metrics = [
    { session_id: 's1', metric_key: 'depth', metric_name: '스쿼트 깊이', avg_score: 40, sample_count: 10 },
    { session_id: 's2', metric_key: 'depth', metric_name: '스쿼트 깊이', avg_score: 50, sample_count: 10 },
    { session_id: 's3', metric_key: 'depth', metric_name: '스쿼트 깊이', avg_score: 65, sample_count: 10 },
    { session_id: 's4', metric_key: 'depth', metric_name: '스쿼트 깊이', avg_score: 75, sample_count: 10 },
  ];

  const trends = buildMetricTrends({ sessions, metrics, recentCount: 2 });

  assert.equal(trends.length, 1);
  assert.equal(trends[0].metric_key, 'depth');
  assert.equal(trends[0].previous_avg, 45);
  assert.equal(trends[0].recent_avg, 70);
  assert.equal(trends[0].delta, 25);
  assert.equal(trends[0].occurrence_count_below_60, 0);
});
```

- [ ] **단계 2: 테스트 실행 — 실패 확인**

실행: `node --test test/analysis/history-trend/metric-trend-builder.test.js`

예상: 모듈 없음 오류로 실패.

- [ ] **단계 3: 메트릭 트렌드 빌더 구현**

```js
const { average, clampScore } = require('./score-utils');

function buildMetricTrends({ sessions = [], metrics = [], recentCount = 5 } = {}) {
  const orderedSessions = [...sessions].sort((a, b) => String(a.ended_at || '').localeCompare(String(b.ended_at || '')));
  const recentSessions = orderedSessions.slice(-recentCount);
  const previousSessions = orderedSessions.slice(Math.max(0, orderedSessions.length - recentCount * 2), Math.max(0, orderedSessions.length - recentCount));
  const recentIds = new Set(recentSessions.map((session) => session.session_id));
  const previousIds = new Set(previousSessions.map((session) => session.session_id));
  const byMetric = new Map();

  for (const row of metrics) {
    const key = String(row.metric_key || '').trim();
    if (!key) continue;
    if (!byMetric.has(key)) {
      byMetric.set(key, {
        metric_key: key,
        metric_name: row.metric_name || key,
        recent_scores: [],
        previous_scores: [],
        recent_sample_count: 0,
        previous_sample_count: 0,
      });
    }
    const item = byMetric.get(key);
    const score = clampScore(row.avg_score);
    const sampleCount = Math.max(0, Math.round(Number(row.sample_count) || 0));
    if (recentIds.has(row.session_id)) {
      item.recent_scores.push(score);
      item.recent_sample_count += sampleCount;
    }
    if (previousIds.has(row.session_id)) {
      item.previous_scores.push(score);
      item.previous_sample_count += sampleCount;
    }
  }

  return [...byMetric.values()].map((item) => {
    const recentAvg = average(item.recent_scores);
    const previousAvg = average(item.previous_scores);
    const delta = recentAvg !== null && previousAvg !== null ? Number((recentAvg - previousAvg).toFixed(1)) : null;
    return {
      metric_key: item.metric_key,
      metric_name: item.metric_name,
      previous_avg: previousAvg,
      recent_avg: recentAvg,
      delta,
      recent_sample_count: item.recent_sample_count,
      previous_sample_count: item.previous_sample_count,
      occurrence_count_below_60: item.recent_scores.filter((score) => score < 60).length,
      recent_session_count: item.recent_scores.length,
      confidence: calculateMetricConfidence(item),
    };
  });
}

function calculateMetricConfidence(item) {
  const recentSamples = Math.min(item.recent_sample_count / 30, 1);
  const previousSamples = item.previous_scores.length > 0 ? Math.min(item.previous_sample_count / 30, 1) : 0.6;
  const recentCoverage = Math.min(item.recent_scores.length / 5, 1);
  return Number((0.45 * recentSamples + 0.25 * previousSamples + 0.30 * recentCoverage).toFixed(2));
}

module.exports = { buildMetricTrends };
```

- [ ] **단계 4: 테스트 실행**

실행: `node --test test/analysis/history-trend/metric-trend-builder.test.js`

예상: 성공.

- [ ] **단계 5: 커밋**

```bash
git add backend/analysis/history-trend/metric-trend-builder.js test/analysis/history-trend/metric-trend-builder.test.js
git commit -m "feat(analysis): build metric trends for growth reports"
```

### Task 4: 개선, 약점, 후퇴 감지기

**파일:**
- 생성: `backend/analysis/history-trend/improvement-detector.js`
- 생성: `backend/analysis/history-trend/weakness-detector.js`
- 생성: `backend/analysis/history-trend/regression-detector.js`
- 테스트: `test/analysis/history-trend/detectors.test.js`

- [ ] **단계 1: 실패하는 테스트 작성**

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const { detectImprovements } = require('../../../backend/analysis/history-trend/improvement-detector');
const { detectWeakPoints } = require('../../../backend/analysis/history-trend/weakness-detector');
const { detectRegressions } = require('../../../backend/analysis/history-trend/regression-detector');

const trends = [
  { metric_key: 'depth', metric_name: '스쿼트 깊이', previous_avg: 48, recent_avg: 66, delta: 18, confidence: 0.72, recent_sample_count: 50, occurrence_count_below_60: 1, recent_session_count: 5 },
  { metric_key: 'knee_alignment', metric_name: '무릎 정렬', previous_avg: 58, recent_avg: 55, delta: -3, confidence: 0.68, recent_sample_count: 48, occurrence_count_below_60: 4, recent_session_count: 5 },
  { metric_key: 'spine_angle', metric_name: '상체 각도', previous_avg: 72, recent_avg: 61, delta: -11, confidence: 0.61, recent_sample_count: 40, occurrence_count_below_60: 2, recent_session_count: 5 },
];

test('detectImprovements selects metrics with meaningful positive delta', () => {
  const result = detectImprovements(trends);
  assert.equal(result.length, 1);
  assert.equal(result[0].metric_key, 'depth');
  assert.match(result[0].evidence, /48점에서 66점/);
});

test('detectWeakPoints selects recurring low metrics', () => {
  const result = detectWeakPoints(trends);
  assert.equal(result[0].metric_key, 'knee_alignment');
  assert.equal(result[0].occurrence_count, 4);
});

test('detectRegressions selects meaningful negative delta', () => {
  const result = detectRegressions(trends);
  assert.equal(result[0].metric_key, 'spine_angle');
  assert.match(result[0].evidence, /11점 하락/);
});
```

- [ ] **단계 2: 테스트 실행 — 실패 확인**

실행: `node --test test/analysis/history-trend/detectors.test.js`

예상: 모듈 없음 오류로 실패.

- [ ] **단계 3: 감지기 구현**

`backend/analysis/history-trend/improvement-detector.js`:

```js
function detectImprovements(trends = []) {
  return trends
    .filter((trend) => Number(trend.delta) >= 8 && Number(trend.confidence) >= 0.45 && Number(trend.recent_sample_count) > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 2)
    .map((trend) => ({
      metric_key: trend.metric_key,
      metric_name: trend.metric_name,
      previous_avg: trend.previous_avg,
      recent_avg: trend.recent_avg,
      delta: trend.delta,
      confidence: trend.confidence,
      evidence: `${trend.metric_name} 평균 점수가 ${Math.round(trend.previous_avg)}점에서 ${Math.round(trend.recent_avg)}점으로 상승`,
    }));
}

module.exports = { detectImprovements };
```

`backend/analysis/history-trend/weakness-detector.js`:

```js
function detectWeakPoints(trends = []) {
  return trends
    .filter((trend) => {
      const recentAvg = Number(trend.recent_avg);
      const occurrenceCount = Number(trend.occurrence_count_below_60 || 0);
      const sessionCount = Math.max(1, Number(trend.recent_session_count || 1));
      const occurrenceRatio = occurrenceCount / sessionCount;
      return Number(trend.confidence) >= 0.45 && (recentAvg < 65 || occurrenceRatio >= 0.5);
    })
    .sort((a, b) => {
      const occurrenceDiff = Number(b.occurrence_count_below_60 || 0) - Number(a.occurrence_count_below_60 || 0);
      if (occurrenceDiff !== 0) return occurrenceDiff;
      return Number(a.recent_avg || 0) - Number(b.recent_avg || 0);
    })
    .slice(0, 2)
    .map((trend) => ({
      metric_key: trend.metric_key,
      metric_name: trend.metric_name,
      recent_avg: trend.recent_avg,
      occurrence_count: trend.occurrence_count_below_60,
      session_count: trend.recent_session_count,
      confidence: trend.confidence,
      evidence: `최근 ${trend.recent_session_count}회 중 ${trend.occurrence_count_below_60}회에서 ${trend.metric_key}가 낮게 측정됨`,
    }));
}

module.exports = { detectWeakPoints };
```

`backend/analysis/history-trend/regression-detector.js`:

```js
function detectRegressions(trends = []) {
  return trends
    .filter((trend) => Number(trend.delta) <= -8 && Number(trend.confidence) >= 0.45)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 2)
    .map((trend) => ({
      metric_key: trend.metric_key,
      metric_name: trend.metric_name,
      previous_avg: trend.previous_avg,
      recent_avg: trend.recent_avg,
      delta: trend.delta,
      confidence: trend.confidence,
      evidence: `${trend.metric_name} 평균 점수가 ${Math.abs(Math.round(trend.delta))}점 하락`,
    }));
}

module.exports = { detectRegressions };
```

- [ ] **단계 4: 테스트 실행**

실행: `node --test test/analysis/history-trend/detectors.test.js`

예상: 3개 테스트 성공.

- [ ] **단계 5: 커밋**

```bash
git add backend/analysis/history-trend/*detector.js test/analysis/history-trend/detectors.test.js
git commit -m "feat(analysis): detect growth report trends"
```

### Task 5: 데이터 품질과 다음 포커스 빌더

**파일:**
- 생성: `backend/analysis/history-trend/data-quality-builder.js`
- 생성: `backend/analysis/history-trend/next-focus-builder.js`
- 테스트: `test/analysis/history-trend/focus-and-quality.test.js`

- [ ] **단계 1: 실패하는 테스트 작성**

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const { buildDataQuality } = require('../../../backend/analysis/history-trend/data-quality-builder');
const { buildNextFocusCandidates } = require('../../../backend/analysis/history-trend/next-focus-builder');

test('buildDataQuality counts camera and low sample issues', () => {
  const result = buildDataQuality({
    events: [
      { type: 'NO_PERSON' },
      { type: 'CAMERA_STALE' },
      { type: 'LOW_SCORE_HINT' },
    ],
    trends: [{ recent_sample_count: 4 }, { recent_sample_count: 40 }],
  });

  assert.equal(result.camera_issue_count, 2);
  assert.equal(result.no_person_count, 1);
  assert.equal(result.low_sample_sessions, 1);
  assert.equal(result.confidence_label, 'medium');
});

test('buildNextFocusCandidates prioritizes weak metric with guide cues', () => {
  const candidates = buildNextFocusCandidates({
    weakPoints: [{ metric_key: 'knee_alignment', metric_name: '무릎 정렬', recent_avg: 55, confidence: 0.68, occurrence_count: 4 }],
    regressions: [],
    metricGuide: {
      metrics: {
        knee_alignment: {
          safety_priority: 0.9,
          actionability: 0.9,
          coaching_cues: ['무릎과 발끝 방향을 맞추세요'],
        },
      },
    },
  });

  assert.equal(candidates[0].metric_key, 'knee_alignment');
  assert.equal(candidates[0].priority, 1);
  assert.deepEqual(candidates[0].recommended_cues, ['무릎과 발끝 방향을 맞추세요']);
});
```

- [ ] **단계 2: 테스트 실행 — 실패 확인**

실행: `node --test test/analysis/history-trend/focus-and-quality.test.js`

예상: 모듈 없음 오류로 실패.

- [ ] **단계 3: 빌더 구현**

`backend/analysis/history-trend/data-quality-builder.js`:

```js
const { confidenceLabel } = require('./score-utils');

function buildDataQuality({ events = [], trends = [] } = {}) {
  const eventTypes = events.map((event) => String(event.type || '').toUpperCase());
  const cameraIssueCount = eventTypes.filter((type) => type.includes('NO_PERSON') || type.includes('CAMERA') || type.includes('STALE')).length;
  const noPersonCount = eventTypes.filter((type) => type.includes('NO_PERSON')).length;
  const lowSampleSessions = trends.filter((trend) => Number(trend.recent_sample_count || 0) < 5).length;
  const trendConfidence = trends.length > 0
    ? trends.reduce((sum, trend) => sum + Number(trend.confidence || 0), 0) / trends.length
    : 0.35;
  const penalty = Math.min(0.25, cameraIssueCount * 0.04 + lowSampleSessions * 0.05);
  const overallConfidence = Number(Math.max(0.2, Math.min(0.95, trendConfidence - penalty)).toFixed(2));

  let note = '분석에 필요한 데이터가 충분합니다.';
  if (overallConfidence < 0.4) {
    note = '운동 기록이나 카메라 인식 데이터가 부족해 참고용으로만 확인해 주세요.';
  } else if (cameraIssueCount > 0) {
    note = '일부 세션에서 카메라 인식 문제가 있었으나 반복 패턴 판단은 가능합니다.';
  }

  return {
    camera_issue_count: cameraIssueCount,
    no_person_count: noPersonCount,
    low_sample_sessions: lowSampleSessions,
    overall_confidence: overallConfidence,
    confidence_label: confidenceLabel(overallConfidence),
    note,
  };
}

module.exports = { buildDataQuality };
```

`backend/analysis/history-trend/next-focus-builder.js`:

```js
function buildNextFocusCandidates({ weakPoints = [], regressions = [], metricGuide = {} } = {}) {
  const candidates = new Map();

  for (const weakPoint of weakPoints) {
    candidates.set(weakPoint.metric_key, {
      metric_key: weakPoint.metric_key,
      metric_name: weakPoint.metric_name,
      weakness_score: Math.max(0, (65 - Number(weakPoint.recent_avg || 65)) / 65),
      regression_score: 0,
      occurrence_count: Number(weakPoint.occurrence_count || 0),
      confidence: Number(weakPoint.confidence || 0),
    });
  }

  for (const regression of regressions) {
    const existing = candidates.get(regression.metric_key) || {
      metric_key: regression.metric_key,
      metric_name: regression.metric_name,
      weakness_score: 0,
      occurrence_count: 0,
      confidence: Number(regression.confidence || 0),
    };
    existing.regression_score = Math.min(1, Math.abs(Number(regression.delta || 0)) / 30);
    candidates.set(regression.metric_key, existing);
  }

  return [...candidates.values()]
    .map((candidate) => {
      const guide = metricGuide?.metrics?.[candidate.metric_key] || {};
      const safetyPriority = Number(guide.safety_priority ?? 0.5);
      const actionability = Number(guide.actionability ?? 0.5);
      const priorityScore =
        0.35 * candidate.weakness_score +
        0.25 * safetyPriority +
        0.20 * actionability +
        0.10 * candidate.regression_score +
        0.10 * candidate.confidence;
      return {
        metric_key: candidate.metric_key,
        metric_name: candidate.metric_name,
        priority_score: Number(priorityScore.toFixed(3)),
        reason: '반복 빈도, 안전 중요도, 교정 가능성을 함께 고려함',
        recommended_cues: Array.isArray(guide.coaching_cues) ? guide.coaching_cues.slice(0, 2) : [],
      };
    })
    .sort((a, b) => b.priority_score - a.priority_score)
    .map((candidate, index) => ({ ...candidate, priority: index + 1 }));
}

module.exports = { buildNextFocusCandidates };
```

- [ ] **단계 4: 테스트 실행**

실행: `node --test test/analysis/history-trend/focus-and-quality.test.js`

예상: 2개 테스트 성공.

- [ ] **단계 5: 커밋**

```bash
git add backend/analysis/history-trend/data-quality-builder.js backend/analysis/history-trend/next-focus-builder.js test/analysis/history-trend/focus-and-quality.test.js
git commit -m "feat(analysis): build growth report quality and focus"
```

### Task 6: HistoryTrendFeature 조합

**파일:**
- 생성: `backend/analysis/history-trend/history-trend-analyzer.js`
- 테스트: `test/analysis/history-trend/history-trend-analyzer.test.js`

- [ ] **단계 1: 실패하는 테스트 작성**

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const { analyzeHistoryTrend } = require('../../../backend/analysis/history-trend/history-trend-analyzer');

test('analyzeHistoryTrend builds feature JSON with overall, trends, and focus', () => {
  const feature = analyzeHistoryTrend({
    userId: 'u1',
    period: 'recent_5',
    exerciseKey: 'squat',
    exerciseName: '스쿼트',
    sessions: [
      { session_id: 's1', final_score: 55, status: 'done', ended_at: '2026-01-01T00:00:00Z' },
      { session_id: 's2', final_score: 67, status: 'done', ended_at: '2026-01-02T00:00:00Z' },
    ],
    metrics: [
      { session_id: 's1', metric_key: 'depth', metric_name: '스쿼트 깊이', avg_score: 48, sample_count: 10 },
      { session_id: 's2', metric_key: 'depth', metric_name: '스쿼트 깊이', avg_score: 66, sample_count: 10 },
    ],
    events: [],
  });

  assert.equal(feature.feature_version, 'htf_v1');
  assert.equal(feature.user_scope.user_id, 'u1');
  assert.equal(feature.overall.completed_sessions, 2);
  assert.ok(Array.isArray(feature.improvements));
  assert.ok(Array.isArray(feature.next_focus_candidates));
});
```

- [ ] **단계 2: 테스트 실행 — 실패 확인**

실행: `node --test test/analysis/history-trend/history-trend-analyzer.test.js`

예상: 모듈 없음 오류로 실패.

- [ ] **단계 3: 분석기 구현**

```js
const { average, normalizeExerciseKey } = require('./score-utils');
const { buildMetricTrends } = require('./metric-trend-builder');
const { detectImprovements } = require('./improvement-detector');
const { detectWeakPoints } = require('./weakness-detector');
const { detectRegressions } = require('./regression-detector');
const { buildDataQuality } = require('./data-quality-builder');
const { buildNextFocusCandidates } = require('./next-focus-builder');
const { loadMetricGuide } = require('../metric-guides');

function analyzeHistoryTrend({ userId, period = 'recent_5', exerciseKey, exerciseName, sessions = [], metrics = [], events = [] } = {}) {
  const normalizedExerciseKey = normalizeExerciseKey(exerciseKey);
  const metricGuide = loadMetricGuide(normalizedExerciseKey);
  const orderedSessions = [...sessions].sort((a, b) => String(a.ended_at || '').localeCompare(String(b.ended_at || '')));
  const recentCount = parsePeriodCount(period);
  const recentSessions = orderedSessions.slice(-recentCount);
  const previousSessions = orderedSessions.slice(Math.max(0, orderedSessions.length - recentCount * 2), Math.max(0, orderedSessions.length - recentCount));
  const recentAvgScore = average(recentSessions.map((session) => session.final_score));
  const previousAvgScore = average(previousSessions.map((session) => session.final_score));
  const scoreDelta = recentAvgScore !== null && previousAvgScore !== null ? Number((recentAvgScore - previousAvgScore).toFixed(1)) : null;
  const trends = buildMetricTrends({ sessions: orderedSessions, metrics, recentCount });
  const improvements = detectImprovements(trends);
  const weakPoints = detectWeakPoints(trends);
  const regressions = detectRegressions(trends);
  const dataQuality = buildDataQuality({ events, trends });

  return {
    feature_version: 'htf_v1',
    user_scope: {
      user_id: userId,
      period_type: 'recent_sessions',
      session_count: recentSessions.length,
      exercise_key: normalizedExerciseKey,
      exercise_name: exerciseName || normalizedExerciseKey,
    },
    overall: {
      recent_avg_score: recentAvgScore,
      previous_avg_score: previousAvgScore,
      score_delta: scoreDelta,
      trend: classifyTrend(scoreDelta),
      completed_sessions: orderedSessions.filter((session) => String(session.status || '').toLowerCase() === 'done').length,
      aborted_sessions: orderedSessions.filter((session) => String(session.status || '').toLowerCase() === 'aborted').length,
    },
    improvements,
    weak_points: weakPoints,
    regressions,
    data_quality: dataQuality,
    next_focus_candidates: buildNextFocusCandidates({ weakPoints, regressions, metricGuide }),
  };
}

function parsePeriodCount(period) {
  if (period === 'recent_10') return 10;
  return 5;
}

function classifyTrend(delta) {
  if (!Number.isFinite(Number(delta))) return 'stable';
  if (delta >= 5) return 'improving';
  if (delta <= -5) return 'declining';
  return 'stable';
}

module.exports = { analyzeHistoryTrend, parsePeriodCount, classifyTrend };
```

- [ ] **단계 4: 테스트 실행**

실행: `node --test test/analysis/history-trend/history-trend-analyzer.test.js`

예상: 성공.

- [ ] **단계 5: 커밋**

```bash
git add backend/analysis/history-trend/history-trend-analyzer.js test/analysis/history-trend/history-trend-analyzer.test.js
git commit -m "feat(analysis): compose history trend feature"
```

---
