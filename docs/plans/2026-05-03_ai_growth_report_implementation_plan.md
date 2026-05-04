# AI 성장 리포트 구현 계획

> **자동화 에이전트용:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**목표:** FitPlus AI 성장 리포트 구축 — 서버 측 히스토리 트렌드 분석, 결정론적 폴백 코칭, 선택적 LLM 리포트 생성, `session_event` 캐싱, 히스토리/운동 페이지 UI 카드.

**아키텍처:** LLM을 의사결정 경로에서 배제. 서버가 기존 운동 기록에서 결정론적 `HistoryTrendFeature` JSON을 먼저 생성한 뒤, 폴백/LLM 레이어가 이를 사용자 대상 한국어 코칭 문구로 변환한다. 신규 DB 테이블은 추가하지 않으며, 캐시된 리포트는 `session_event.type = 'AI_HISTORY_REPORT'`로 저장한다.

**기술 스택:** Node.js/Express, Supabase, EJS, OpenRouter, Node 내장 테스트 러너 (`node --test`).

---

## 참조 스펙

- 주요 스펙: `docs/specs/2026-05-03_fitplus_ai_growth_report_spec.md`
- 대체된 문서: `docs/specs/2026-04-12_llm_feature_summarizer_spec.md`

## 파일 구조

`controllers/history.js`를 더 확장하지 않고 `backend/analysis/` 아래에 독립 모듈을 생성한다.

```text
backend/
  analysis/
    history-trend/
      score-utils.js
      history-context-builder.js
      metric-trend-builder.js
      improvement-detector.js
      weakness-detector.js
      regression-detector.js
      data-quality-builder.js
      next-focus-builder.js
      history-trend-analyzer.js
    metric-guides/
      squat.v1.json
      push_up.v1.json
      plank.v1.json
      index.js
    coaching-skills/
      growth-report.v1/
        prompt.system.txt
        prompt.user.txt
        output-schema.json
    llm-coach/
      output-validator.js
      prompt-builder.js
      llm-client.js
      fallback-growth-report-generator.js
    repository/
      workout-history.repository.js
      ai-history-report.repository.js
    service/
      ai-growth-report.service.js
    controller/
      ai-growth-report.controller.js
```

기존 통합 지점 수정:

```text
routes/main.js                      - 인증 API 라우트 추가
views/history/index.ejs             - AI 성장 리포트 카드 컨테이너 렌더링
views/workout/session.ejs           - 오늘의 미션 카드 컨테이너 렌더링
views/workout/result.ejs            - 운동 후 코칭 요약 컨테이너 렌더링
```

테스트 파일:

```text
test/analysis/history-trend/*.test.js
test/analysis/llm-coach/*.test.js
test/analysis/repository/*.test.js
test/analysis/service/*.test.js
test/analysis/controller/*.test.js
```

---

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

## Phase 2: Repository와 캐시 레이어

**목표:** 운동 기록을 읽고 리포트 출력을 `session_event`에 선택적으로 캐시한다.

### Task 7: 운동 기록 Repository 추가

**파일:**
- 생성: `backend/analysis/repository/workout-history.repository.js`
- 테스트: `test/analysis/repository/workout-history.repository.test.js`

- [ ] **단계 1: 가짜 Supabase 클라이언트로 실패하는 테스트 작성**

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const { createWorkoutHistoryRepository } = require('../../../backend/analysis/repository/workout-history.repository');

test('getRecentHistory queries user sessions, metrics, and events', async () => {
  const calls = [];
  const fakeSupabase = {
    from(table) {
      calls.push(table);
      return makeQuery(table);
    },
  };
  function makeQuery(table) {
    const chain = {
      select() { return chain; },
      eq() { return chain; },
      in() { return chain; },
      order() { return chain; },
      limit() { return Promise.resolve({ data: table === 'workout_session' ? [{ session_id: 's1', exercise: { code: 'squat', name: '스쿼트' } }] : [], error: null }); },
    };
    return chain;
  }

  const repo = createWorkoutHistoryRepository({ supabase: fakeSupabase });
  const result = await repo.getRecentHistory({ userId: 'u1', exercise: 'squat', limit: 5 });

  assert.equal(result.sessions.length, 1);
  assert.ok(calls.includes('workout_session'));
  assert.ok(calls.includes('session_snapshot_metric'));
  assert.ok(calls.includes('session_event'));
});
```

- [ ] **단계 2: 테스트 실행 — 실패 확인**

실행: `node --test test/analysis/repository/workout-history.repository.test.js`

예상: 모듈 없음 오류로 실패.

- [ ] **단계 3: Repository 구현**

```js
const { supabase: defaultSupabase } = require('../../../config/db');

function createWorkoutHistoryRepository({ supabase = defaultSupabase } = {}) {
  async function getRecentHistory({ userId, exercise = 'all', limit = 5 } = {}) {
    let sessionQuery = supabase
      .from('workout_session')
      .select('session_id,user_id,exercise_id,selected_view,started_at,ended_at,duration_sec,total_reps,final_score,status,summary_feedback,exercise:exercise_id(code,name)')
      .eq('user_id', userId)
      .order('ended_at', { ascending: false })
      .limit(limit * 2);

    const { data: sessions, error: sessionError } = await sessionQuery;
    if (sessionError) throw sessionError;

    const filteredSessions = (sessions || [])
      .filter((session) => exercise === 'all' || session?.exercise?.code === exercise)
      .slice(0, limit * 2)
      .reverse();
    const sessionIds = filteredSessions.map((session) => session.session_id).filter(Boolean);

    if (sessionIds.length === 0) {
      return { sessions: [], metrics: [], events: [] };
    }

    const [{ data: metrics, error: metricError }, { data: events, error: eventError }] = await Promise.all([
      supabase.from('session_snapshot_metric').select('*').in('session_id', sessionIds),
      supabase.from('session_event').select('*').in('session_id', sessionIds),
    ]);
    if (metricError) throw metricError;
    if (eventError) throw eventError;

    return {
      sessions: filteredSessions.map((session) => ({
        ...session,
        exercise_key: session?.exercise?.code,
        exercise_name: session?.exercise?.name,
      })),
      metrics: metrics || [],
      events: events || [],
    };
  }

  return { getRecentHistory };
}

module.exports = { createWorkoutHistoryRepository };
```

- [ ] **단계 4: 테스트 실행**

실행: `node --test test/analysis/repository/workout-history.repository.test.js`

예상: 성공.

- [ ] **단계 5: 커밋**

```bash
git add backend/analysis/repository/workout-history.repository.js test/analysis/repository/workout-history.repository.test.js
git commit -m "feat(analysis): add workout history repository"
```

### Task 8: AI 히스토리 리포트 캐시 Repository 추가

**파일:**
- 생성: `backend/analysis/repository/ai-history-report.repository.js`
- 테스트: `test/analysis/repository/ai-history-report.repository.test.js`

- [ ] **단계 1: 실패하는 테스트 작성**

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const { createAiHistoryReportRepository } = require('../../../backend/analysis/repository/ai-history-report.repository');

test('saveReport inserts AI_HISTORY_REPORT session_event payload', async () => {
  let inserted = null;
  const fakeSupabase = {
    from(table) {
      assert.equal(table, 'session_event');
      return {
        insert(row) {
          inserted = row;
          return Promise.resolve({ data: row, error: null });
        },
      };
    },
  };

  const repo = createAiHistoryReportRepository({ supabase: fakeSupabase });
  await repo.saveReport({ userId: 'u1', period: 'recent_5', exercise: 'squat', payload: { status: 'completed' } });

  assert.equal(inserted.type, 'AI_HISTORY_REPORT');
  assert.equal(inserted.user_id, 'u1');
  assert.equal(inserted.payload.period, 'recent_5');
  assert.equal(inserted.payload.exercise_key, 'squat');
});
```

- [ ] **단계 2: 테스트 실행 — 실패 확인**

실행: `node --test test/analysis/repository/ai-history-report.repository.test.js`

예상: 모듈 없음 오류로 실패.

- [ ] **단계 3: 캐시 Repository 구현**

```js
const { supabase: defaultSupabase } = require('../../../config/db');

const REPORT_TYPE = 'AI_HISTORY_REPORT';

function createAiHistoryReportRepository({ supabase = defaultSupabase, now = () => new Date() } = {}) {
  async function getLatestReport({ userId, period, exercise } = {}) {
    const { data, error } = await supabase
      .from('session_event')
      .select('*')
      .eq('user_id', userId)
      .eq('type', REPORT_TYPE)
      .order('occurred_at', { ascending: false })
      .limit(10);
    if (error) throw error;
    return (data || []).find((event) => event?.payload?.period === period && event?.payload?.exercise_key === exercise) || null;
  }

  async function saveReport({ userId, period, exercise, payload } = {}) {
    const occurredAt = now().toISOString();
    const row = {
      session_id: null,
      user_id: userId,
      type: REPORT_TYPE,
      occurred_at: occurredAt,
      payload: {
        report_version: 'growth_report_v1',
        history_feature_version: 'htf_v1',
        period,
        exercise_key: exercise,
        created_at: occurredAt,
        ...payload,
      },
    };
    const { data, error } = await supabase.from('session_event').insert(row);
    if (error) throw error;
    return data;
  }

  return { getLatestReport, saveReport };
}

module.exports = { createAiHistoryReportRepository, REPORT_TYPE };
```

- [ ] **단계 4: 테스트 실행**

실행: `node --test test/analysis/repository/ai-history-report.repository.test.js`

예상: 성공.

- [ ] **단계 5: 커밋**

```bash
git add backend/analysis/repository/ai-history-report.repository.js test/analysis/repository/ai-history-report.repository.test.js
git commit -m "feat(analysis): cache AI history reports in session events"
```

---

## Phase 3: 폴백 및 LLM 코칭

**목표:** 결정론적 feature JSON을 출력 스키마로 변환 — 먼저 폴백, 그 다음 선택적 LLM.

### Task 9: 출력 스키마 검증기 추가

**파일:**
- 생성: `backend/analysis/coaching-skills/growth-report.v1/output-schema.json`
- 생성: `backend/analysis/llm-coach/output-validator.js`
- 테스트: `test/analysis/llm-coach/output-validator.test.js`

- [ ] **단계 1: 실패하는 테스트 작성**

```js
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
});

test('validateGrowthReportOutput rejects missing next_mission', () => {
  const result = validateGrowthReportOutput({ summary: 'x' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('next_mission is required'));
});
```

- [ ] **단계 2: 테스트 실행 — 실패 확인**

실행: `node --test test/analysis/llm-coach/output-validator.test.js`

예상: 모듈 없음 오류로 실패.

- [ ] **단계 3: 스키마와 검증기 추가**

`backend/analysis/coaching-skills/growth-report.v1/output-schema.json` 생성:

```json
{
  "type": "object",
  "required": ["summary", "improvements", "weak_points", "next_mission", "data_quality_note", "coach_comment"],
  "properties": {
    "summary": { "type": "string" },
    "improvements": { "type": "array", "maxItems": 2 },
    "weak_points": { "type": "array", "maxItems": 2 },
    "next_mission": { "type": "object" },
    "data_quality_note": { "type": "object" },
    "coach_comment": { "type": "string" }
  }
}
```

`backend/analysis/llm-coach/output-validator.js` 생성:

```js
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
```

- [ ] **단계 4: 테스트 실행**

실행: `node --test test/analysis/llm-coach/output-validator.test.js`

예상: 성공.

- [ ] **단계 5: 커밋**

```bash
git add backend/analysis/coaching-skills/growth-report.v1/output-schema.json backend/analysis/llm-coach/output-validator.js test/analysis/llm-coach/output-validator.test.js
git commit -m "feat(analysis): validate AI growth report output"
```

### Task 10: 폴백 성장 리포트 생성기 추가

**파일:**
- 생성: `backend/analysis/llm-coach/fallback-growth-report-generator.js`
- 테스트: `test/analysis/llm-coach/fallback-growth-report-generator.test.js`

- [ ] **단계 1: 실패하는 테스트 작성**

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const { generateFallbackGrowthReport } = require('../../../backend/analysis/llm-coach/fallback-growth-report-generator');

test('generateFallbackGrowthReport creates schema-valid report from feature', () => {
  const report = generateFallbackGrowthReport({
    feature: {
      improvements: [{ metric_key: 'depth', metric_name: '스쿼트 깊이', evidence: '48점에서 66점으로 상승' }],
      weak_points: [{ metric_key: 'knee_alignment', metric_name: '무릎 정렬', evidence: '최근 5회 중 4회 낮음' }],
      next_focus_candidates: [{ metric_key: 'knee_alignment', metric_name: '무릎 정렬', recommended_cues: ['무릎과 발끝 방향을 맞추세요'], reason: '반복 약점' }],
      data_quality: { confidence_label: 'medium', note: '일부 카메라 이슈가 있었습니다.' },
      overall: { trend: 'improving' },
    },
  });

  assert.match(report.summary, /좋아지고/);
  assert.equal(report.improvements.length, 1);
  assert.equal(report.weak_points.length, 1);
  assert.equal(report.next_mission.metric_key, 'knee_alignment');
});
```

- [ ] **단계 2: 테스트 실행 — 실패 확인**

실행: `node --test test/analysis/llm-coach/fallback-growth-report-generator.test.js`

예상: 모듈 없음 오류로 실패.

- [ ] **단계 3: 폴백 생성기 구현**

```js
function generateFallbackGrowthReport({ feature, reason = null } = {}) {
  const improvements = (feature?.improvements || []).slice(0, 2).map((item) => ({
    title: `${item.metric_name}이 좋아졌습니다`,
    evidence: item.evidence,
    meaning: `${item.metric_name} 기록이 이전보다 안정적으로 개선되었습니다.`,
  }));
  const weakPoints = (feature?.weak_points || []).slice(0, 2).map((item) => ({
    title: `${item.metric_name}은 아직 보완이 필요합니다`,
    evidence: item.evidence,
    meaning: `${item.metric_name}이 최근 기록에서 반복적으로 낮게 측정되었습니다.`,
  }));
  const focus = feature?.next_focus_candidates?.[0] || null;
  const missionMetric = focus?.metric_key || weakPoints[0]?.metric_key || 'general_focus';
  const missionTitle = focus ? `오늘은 ${focus.metric_name}에 집중하기` : '오늘은 안정적인 자세 유지하기';
  const missionAction = focus?.recommended_cues?.[0] || '반복 수보다 자세를 천천히 유지하는 데 집중하세요.';
  const trend = feature?.overall?.trend;

  return {
    summary: trend === 'improving'
      ? '최근 운동 기록은 전반적으로 좋아지고 있습니다.'
      : '최근 운동 기록을 기준으로 다음 집중 포인트를 정리했습니다.',
    improvements,
    weak_points: weakPoints,
    next_mission: {
      title: missionTitle,
      action: missionAction,
      reason: focus?.reason || '최근 기록에서 다음 운동 집중 포인트로 선정되었습니다.',
      metric_key: missionMetric,
    },
    data_quality_note: {
      label: feature?.data_quality?.confidence_label || 'low',
      message: feature?.data_quality?.note || '운동 기록이 충분하지 않아 참고용으로 확인해 주세요.',
    },
    coach_comment: reason
      ? 'AI 응답 대신 기록 기반 기본 리포트를 표시합니다. 다음 운동에서는 한 가지 미션에 집중해 보세요.'
      : '좋아진 점은 유지하고, 다음 운동에서는 미션 하나에 집중해 보세요.',
  };
}

module.exports = { generateFallbackGrowthReport };
```

- [ ] **단계 4: 테스트 실행**

실행: `node --test test/analysis/llm-coach/fallback-growth-report-generator.test.js`

예상: 성공.

- [ ] **단계 5: 커밋**

```bash
git add backend/analysis/llm-coach/fallback-growth-report-generator.js test/analysis/llm-coach/fallback-growth-report-generator.test.js
git commit -m "feat(analysis): generate fallback growth reports"
```

### Task 11: 프롬프트 빌더와 LLM 클라이언트 추가

**파일:**
- 생성: `backend/analysis/coaching-skills/growth-report.v1/prompt.system.txt`
- 생성: `backend/analysis/coaching-skills/growth-report.v1/prompt.user.txt`
- 생성: `backend/analysis/llm-coach/prompt-builder.js`
- 생성: `backend/analysis/llm-coach/llm-client.js`
- 테스트: `test/analysis/llm-coach/prompt-and-client.test.js`

- [ ] **단계 1: 실패하는 테스트 작성**

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const { buildGrowthReportPrompt } = require('../../../backend/analysis/llm-coach/prompt-builder');
const { createLlmClient } = require('../../../backend/analysis/llm-coach/llm-client');

test('buildGrowthReportPrompt includes feature and schema', () => {
  const prompt = buildGrowthReportPrompt({ feature: { feature_version: 'htf_v1' }, metricGuide: { exercise: 'squat' } });
  assert.match(prompt.systemPrompt, /운동 히스토리 분석 코치/);
  assert.match(prompt.userPrompt, /htf_v1/);
  assert.match(prompt.userPrompt, /출력 schema/);
});

test('createLlmClient parses JSON response content', async () => {
  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: '{"summary":"ok","improvements":[],"weak_points":[],"next_mission":{"title":"t","action":"a","reason":"r","metric_key":"m"},"data_quality_note":{"label":"medium","message":"m"},"coach_comment":"c"}' } }], model: 'test-model' }),
  });
  const client = createLlmClient({ fetchImpl: fakeFetch, apiKey: 'key' });
  const result = await client.generateJson({ systemPrompt: 's', userPrompt: 'u' });
  assert.equal(result.output.summary, 'ok');
  assert.equal(result.model, 'test-model');
});
```

- [ ] **단계 2: 테스트 실행 — 실패 확인**

실행: `node --test test/analysis/llm-coach/prompt-and-client.test.js`

예상: 모듈 없음 오류로 실패.

- [ ] **단계 3: 프롬프트와 클라이언트 추가**

`prompt.system.txt`:

```text
너는 운동 히스토리 분석 코치다.
입력은 서버가 기존 운동 기록을 분석해 만든 구조화 JSON이다.
입력에 없는 사실을 추측하지 마라.
의학적 진단, 치료 조언, 부상 판단을 하지 마라.
자세 문제와 카메라/인식 문제를 구분해서 설명하라.
반드시 JSON schema만 출력하라.
한국어로 작성하라.
```

`prompt.user.txt`:

```text
다음 운동 히스토리 분석 입력을 바탕으로 AI 성장 리포트를 생성하라.

입력:
{{history_trend_feature_json}}

metric guide:
{{metric_guide_json}}

출력 schema:
{{output_schema_json}}
```

`prompt-builder.js`:

```js
const fs = require('fs');
const path = require('path');

const skillDir = path.join(__dirname, '..', 'coaching-skills', 'growth-report.v1');

function buildGrowthReportPrompt({ feature, metricGuide } = {}) {
  const systemPrompt = fs.readFileSync(path.join(skillDir, 'prompt.system.txt'), 'utf8').trim();
  const userTemplate = fs.readFileSync(path.join(skillDir, 'prompt.user.txt'), 'utf8').trim();
  const outputSchema = require(path.join(skillDir, 'output-schema.json'));
  const userPrompt = userTemplate
    .replace('{{history_trend_feature_json}}', JSON.stringify(feature, null, 2))
    .replace('{{metric_guide_json}}', JSON.stringify(metricGuide, null, 2))
    .replace('{{output_schema_json}}', JSON.stringify(outputSchema, null, 2));
  return { systemPrompt, userPrompt };
}

module.exports = { buildGrowthReportPrompt };
```

`llm-client.js`:

```js
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

function createLlmClient({ fetchImpl = fetch, apiKey = process.env.OPENROUTER_API_KEY, model = process.env.OPENROUTER_LLM_MODEL || 'openai/gpt-4o-mini' } = {}) {
  async function generateJson({ systemPrompt, userPrompt, timeoutMs = 12000 } = {}) {
    if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const response = await fetchImpl(`${OPENROUTER_BASE}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        signal: controller?.signal,
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      });
      if (!response.ok) throw new Error(`LLM request failed: ${response.status}`);
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error('LLM response content missing');
      return { output: JSON.parse(content), model: data.model || model };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
  return { generateJson };
}

module.exports = { createLlmClient };
```

- [ ] **단계 4: 테스트 실행**

실행: `node --test test/analysis/llm-coach/prompt-and-client.test.js`

예상: 성공.

- [ ] **단계 5: 커밋**

```bash
git add backend/analysis/coaching-skills/growth-report.v1/prompt.*.txt backend/analysis/llm-coach/prompt-builder.js backend/analysis/llm-coach/llm-client.js test/analysis/llm-coach/prompt-and-client.test.js
git commit -m "feat(analysis): add growth report LLM prompt client"
```

---

## Phase 4: 서비스와 API

**목표:** `GET /api/users/me/coach-report`와 `POST /api/users/me/coach-report/rebuild` 엔드포인트를 노출한다.

### Task 12: AI 성장 리포트 서비스 추가

**파일:**
- 생성: `backend/analysis/service/ai-growth-report.service.js`
- 테스트: `test/analysis/service/ai-growth-report.service.test.js`

- [ ] **단계 1: 실패하는 테스트 작성**

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const { createAiGrowthReportService } = require('../../../backend/analysis/service/ai-growth-report.service');

test('getCoachReport returns fallback for insufficient history', async () => {
  const service = createAiGrowthReportService({
    historyRepo: { getRecentHistory: async () => ({ sessions: [], metrics: [], events: [] }) },
    reportRepo: { getLatestReport: async () => null, saveReport: async () => null },
  });

  const response = await service.getCoachReport({ userId: 'u1', period: 'recent_5', exercise: 'squat' });
  assert.equal(response.status, 'completed');
  assert.equal(response.isFallback, true);
  assert.equal(response.fallbackReason, 'INSUFFICIENT_HISTORY');
});
```

- [ ] **단계 2: 테스트 실행 — 실패 확인**

실행: `node --test test/analysis/service/ai-growth-report.service.test.js`

예상: 모듈 없음 오류로 실패.

- [ ] **단계 3: 서비스 구현**

```js
const { createWorkoutHistoryRepository } = require('../repository/workout-history.repository');
const { createAiHistoryReportRepository } = require('../repository/ai-history-report.repository');
const { analyzeHistoryTrend } = require('../history-trend/history-trend-analyzer');
const { loadMetricGuide } = require('../metric-guides');
const { generateFallbackGrowthReport } = require('../llm-coach/fallback-growth-report-generator');
const { buildGrowthReportPrompt } = require('../llm-coach/prompt-builder');
const { createLlmClient } = require('../llm-coach/llm-client');
const { validateGrowthReportOutput } = require('../llm-coach/output-validator');

function createAiGrowthReportService({
  historyRepo = createWorkoutHistoryRepository(),
  reportRepo = createAiHistoryReportRepository(),
  llmClient = createLlmClient(),
} = {}) {
  async function getCoachReport({ userId, period = 'recent_5', exercise = 'squat', forceRebuild = false } = {}) {
    if (!forceRebuild) {
      const cached = await reportRepo.getLatestReport({ userId, period, exercise });
      if (cached?.payload?.llm_output_json) {
        return buildResponse({ source: 'cached', payload: cached.payload });
      }
    }

    const history = await historyRepo.getRecentHistory({ userId, exercise, limit: period === 'recent_10' ? 10 : 5 });
    if ((history.sessions || []).length < 2) {
      const result = generateFallbackGrowthReport({ feature: { data_quality: { confidence_label: 'low', note: '최근 운동 기록이 2회 미만입니다.' }, overall: { trend: 'stable' }, next_focus_candidates: [] }, reason: 'INSUFFICIENT_HISTORY' });
      const payload = await persist({ userId, period, exercise, status: 'completed', result, isFallback: true, fallbackReason: 'INSUFFICIENT_HISTORY' });
      return buildResponse({ source: 'generated', payload });
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
    const metricGuide = loadMetricGuide(exercise);
    const lowConfidence = feature.data_quality.overall_confidence < 0.35;
    let result;
    let isFallback = false;
    let fallbackReason = null;
    let llmModel = null;

    if (lowConfidence) {
      result = generateFallbackGrowthReport({ feature, reason: 'LOW_CONFIDENCE' });
      isFallback = true;
      fallbackReason = 'LOW_CONFIDENCE';
    } else {
      try {
        const prompt = buildGrowthReportPrompt({ feature, metricGuide });
        const llm = await llmClient.generateJson(prompt);
        const validation = validateGrowthReportOutput(llm.output);
        if (!validation.valid) throw new Error(`SCHEMA_INVALID: ${validation.errors.join(', ')}`);
        result = llm.output;
        llmModel = llm.model;
      } catch (error) {
        result = generateFallbackGrowthReport({ feature, reason: 'PROVIDER_ERROR' });
        isFallback = true;
        fallbackReason = error.message?.startsWith('SCHEMA_INVALID') ? 'SCHEMA_INVALID' : 'PROVIDER_ERROR';
      }
    }

    const payload = await persist({ userId, period, exercise, status: 'completed', feature, result, isFallback, fallbackReason, llmModel });
    return buildResponse({ source: 'generated', payload });
  }

  async function persist({ userId, period, exercise, status, feature = null, result, isFallback, fallbackReason, llmModel = null }) {
    const payload = {
      status,
      history_context: feature,
      llm_output_json: result,
      is_fallback: isFallback,
      fallback_reason: fallbackReason,
      llm_model: llmModel,
    };
    await reportRepo.saveReport({ userId, period, exercise, payload });
    return { report_version: 'growth_report_v1', history_feature_version: 'htf_v1', period, exercise_key: exercise, ...payload, created_at: new Date().toISOString() };
  }

  return { getCoachReport };
}

function buildResponse({ source, payload }) {
  return {
    status: payload.status || 'completed',
    source,
    reportVersion: payload.report_version || 'growth_report_v1',
    historyFeatureVersion: payload.history_feature_version || 'htf_v1',
    period: payload.period,
    exercise: payload.exercise_key,
    result: payload.llm_output_json,
    isFallback: payload.is_fallback === true,
    fallbackReason: payload.fallback_reason || null,
    createdAt: payload.created_at,
  };
}

module.exports = { createAiGrowthReportService };
```

- [ ] **단계 4: 테스트 실행**

실행: `node --test test/analysis/service/ai-growth-report.service.test.js`

예상: 성공.

- [ ] **단계 5: 커밋**

```bash
git add backend/analysis/service/ai-growth-report.service.js test/analysis/service/ai-growth-report.service.test.js
git commit -m "feat(analysis): orchestrate AI growth reports"
```

### Task 13: 컨트롤러와 라우트 추가

**파일:**
- 생성: `backend/analysis/controller/ai-growth-report.controller.js`
- 수정: `routes/main.js`
- 테스트: `test/analysis/controller/ai-growth-report.controller.test.js`

- [ ] **단계 1: 컨트롤러 테스트 작성**

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const { createAiGrowthReportController } = require('../../../backend/analysis/controller/ai-growth-report.controller');

test('getCoachReport sends service response for authenticated user', async () => {
  const controller = createAiGrowthReportController({
    service: { getCoachReport: async (input) => ({ status: 'completed', exercise: input.exercise }) },
  });
  const req = { query: { period: 'recent_5', exercise: 'squat' } };
  const res = {
    locals: { user: { user_id: 'u1' } },
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };

  await controller.getCoachReport(req, res);
  assert.equal(res.body.status, 'completed');
  assert.equal(res.body.exercise, 'squat');
});
```

- [ ] **단계 2: 테스트 실행 — 실패 확인**

실행: `node --test test/analysis/controller/ai-growth-report.controller.test.js`

예상: 모듈 없음 오류로 실패.

- [ ] **단계 3: 컨트롤러 구현**

```js
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
  return ['recent_5', 'recent_10', 'last_7_days', 'last_30_days'].includes(period) ? period : 'recent_5';
}

function normalizeExercise(exercise) {
  const value = String(exercise || 'squat').trim().toLowerCase();
  if (value === 'pushup') return 'push_up';
  return ['squat', 'push_up', 'plank', 'all'].includes(value) ? value : 'squat';
}

module.exports = { createAiGrowthReportController, normalizePeriod, normalizeExercise };
```

- [ ] **단계 4: `routes/main.js`에 라우트 연결**

기존 `/api/history` 라우트 근처에 추가:

```js
const { createAiGrowthReportController } = require('../backend/analysis/controller/ai-growth-report.controller');
const aiGrowthReportController = createAiGrowthReportController();

router.get('/api/users/me/coach-report', requireAuth, aiGrowthReportController.getCoachReport);
router.post('/api/users/me/coach-report/rebuild', requireAuth, aiGrowthReportController.rebuildCoachReport);
```

- [ ] **단계 5: 테스트 실행**

실행: `node --test test/analysis/controller/ai-growth-report.controller.test.js`

예상: 성공.

- [ ] **단계 6: 커밋**

```bash
git add backend/analysis/controller/ai-growth-report.controller.js routes/main.js test/analysis/controller/ai-growth-report.controller.test.js
git commit -m "feat(api): expose AI growth report endpoints"
```

---

## Phase 5: 프론트엔드 UI

**목표:** 히스토리 페이지에 AI 성장 리포트, 운동 세션 페이지에 오늘의 미션, 결과 페이지에 짧은 코칭을 렌더링한다.

### Task 14: 히스토리 페이지 성장 리포트 카드 추가

**파일:**
- 수정: `views/history/index.ejs`
- 생성: `public/js/history/ai-growth-report.js`
- 테스트: `test/analysis/frontend/ai-growth-report-client.test.js`

- [ ] **단계 1: 클라이언트 테스트 작성**

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const { buildGrowthReportHtml } = require('../../../public/js/history/ai-growth-report');

test('buildGrowthReportHtml renders summary and next mission', () => {
  const html = buildGrowthReportHtml({
    result: {
      summary: '최근 기록이 좋아지고 있습니다.',
      improvements: [{ title: '깊이 개선', evidence: '48점에서 66점' }],
      weak_points: [{ title: '무릎 정렬 보완', evidence: '5회 중 4회 낮음' }],
      next_mission: { title: '무릎 정렬 집중', action: '무릎과 발끝 방향을 맞추세요.' },
      data_quality_note: { label: 'medium', message: '일부 카메라 이슈가 있었습니다.' },
    },
  });
  assert.match(html, /AI 성장 리포트/);
  assert.match(html, /무릎 정렬 집중/);
});
```

- [ ] **단계 2: 테스트 실행 — 실패 확인**

실행: `node --test test/analysis/frontend/ai-growth-report-client.test.js`

예상: 모듈 없음 오류로 실패.

- [ ] **단계 3: 클라이언트 렌더러 추가**

```js
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildGrowthReportHtml(report) {
  const result = report?.result || {};
  const improvements = Array.isArray(result.improvements) ? result.improvements : [];
  const weakPoints = Array.isArray(result.weak_points) ? result.weak_points : [];
  return `
    <section class="ai-growth-report-card">
      <h2>AI 성장 리포트</h2>
      <p class="ai-growth-summary">${escapeHtml(result.summary || '최근 운동 기록을 분석 중입니다.')}</p>
      <div class="ai-growth-grid">
        <div><h3>좋아진 점</h3>${renderItems(improvements)}</div>
        <div><h3>부족한 점</h3>${renderItems(weakPoints)}</div>
      </div>
      <div class="ai-growth-mission">
        <h3>오늘의 운동 미션</h3>
        <strong>${escapeHtml(result.next_mission?.title || '안정적인 자세 유지하기')}</strong>
        <p>${escapeHtml(result.next_mission?.action || '반복 수보다 자세를 천천히 유지해 보세요.')}</p>
      </div>
      <p class="ai-growth-quality">분석 신뢰도: ${escapeHtml(result.data_quality_note?.label || 'low')} — ${escapeHtml(result.data_quality_note?.message || '')}</p>
    </section>`;
}

function renderItems(items) {
  if (items.length === 0) return '<p>표시할 항목이 아직 충분하지 않습니다.</p>';
  return `<ul>${items.map((item) => `<li><strong>${escapeHtml(item.title)}</strong><br><span>${escapeHtml(item.evidence)}</span></li>`).join('')}</ul>`;
}

async function loadGrowthReport({ containerId = 'ai-growth-report-root', exercise = 'squat' } = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '<p>AI 성장 리포트를 불러오는 중입니다...</p>';
  try {
    const response = await fetch(`/api/users/me/coach-report?period=recent_5&exercise=${encodeURIComponent(exercise)}`);
    if (!response.ok) throw new Error('request failed');
    const report = await response.json();
    container.innerHTML = buildGrowthReportHtml(report);
  } catch (error) {
    container.innerHTML = '<p>AI 성장 리포트를 불러오지 못했습니다.</p>';
  }
}

if (typeof window !== 'undefined') {
  window.FitPlusAiGrowthReport = { buildGrowthReportHtml, loadGrowthReport };
}

if (typeof module !== 'undefined') {
  module.exports = { buildGrowthReportHtml, loadGrowthReport };
}
```

- [ ] **단계 4: `views/history/index.ejs`에 컨테이너와 스크립트 추가**

히스토리 콘텐츠 상단 근처에 삽입:

```html
<div id="ai-growth-report-root" class="ai-growth-report-root"></div>
<script src="/js/history/ai-growth-report.js"></script>
<script>
  window.FitPlusAiGrowthReport?.loadGrowthReport?.({ exercise: '<%= filters?.exercise || "squat" %>' });
</script>
```

- [ ] **단계 5: 테스트 실행**

실행: `node --test test/analysis/frontend/ai-growth-report-client.test.js`

예상: 성공.

- [ ] **단계 6: 커밋**

```bash
git add views/history/index.ejs public/js/history/ai-growth-report.js test/analysis/frontend/ai-growth-report-client.test.js
git commit -m "feat(history): show AI growth report card"
```

### Task 15: 운동 세션/결과 페이지에 오늘의 미션 추가

**파일:**
- 수정: `views/workout/session.ejs`
- 수정: `views/workout/result.ejs`
- 생성: `public/js/workout/ai-mission-card.js`
- 테스트: `test/analysis/frontend/ai-mission-card.test.js`

- [ ] **단계 1: 클라이언트 테스트 작성**

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const { buildMissionHtml } = require('../../../public/js/workout/ai-mission-card');

test('buildMissionHtml renders next mission', () => {
  const html = buildMissionHtml({ title: '무릎 정렬 집중', action: '무릎과 발끝 방향을 맞추세요.' });
  assert.match(html, /오늘의 AI 미션/);
  assert.match(html, /무릎 정렬 집중/);
});
```

- [ ] **단계 2: 테스트 실행 — 실패 확인**

실행: `node --test test/analysis/frontend/ai-mission-card.test.js`

예상: 모듈 없음 오류로 실패.

- [ ] **단계 3: 미션 카드 스크립트 추가**

```js
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildMissionHtml(mission = {}) {
  return `
    <section class="ai-mission-card">
      <h2>오늘의 AI 미션</h2>
      <strong>${escapeHtml(mission.title || '안정적인 자세 유지하기')}</strong>
      <p>${escapeHtml(mission.action || '반복 수보다 자세를 천천히 유지해 보세요.')}</p>
    </section>`;
}

async function loadMission({ containerId = 'ai-mission-root', exercise = 'squat' } = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  try {
    const response = await fetch(`/api/users/me/coach-report?period=recent_5&exercise=${encodeURIComponent(exercise)}`);
    if (!response.ok) return;
    const report = await response.json();
    container.innerHTML = buildMissionHtml(report?.result?.next_mission);
  } catch (error) {
    container.innerHTML = '';
  }
}

if (typeof window !== 'undefined') {
  window.FitPlusAiMissionCard = { buildMissionHtml, loadMission };
}

if (typeof module !== 'undefined') {
  module.exports = { buildMissionHtml, loadMission };
}
```

- [ ] **단계 4: EJS 페이지에 컨테이너 추가**

`views/workout/session.ejs` — 운동 시작/준비 영역 근처:

```html
<div id="ai-mission-root" class="ai-mission-root"></div>
<script src="/js/workout/ai-mission-card.js"></script>
<script>
  window.FitPlusAiMissionCard?.loadMission?.({ exercise: '<%= exercise?.code || "squat" %>' });
</script>
```

`views/workout/result.ejs` — 결과 요약 근처:

```html
<div id="ai-mission-root" class="ai-mission-root"></div>
<script src="/js/workout/ai-mission-card.js"></script>
<script>
  window.FitPlusAiMissionCard?.loadMission?.({ exercise: '<%= session?.exercise?.code || session?.exercise_code || "squat" %>' });
</script>
```

- [ ] **단계 5: 테스트 실행**

실행: `node --test test/analysis/frontend/ai-mission-card.test.js`

예상: 성공.

- [ ] **단계 6: 커밋**

```bash
git add views/workout/session.ejs views/workout/result.ejs public/js/workout/ai-mission-card.js test/analysis/frontend/ai-mission-card.test.js
git commit -m "feat(workout): show today's AI mission"
```

---

## Phase 6: 검증 및 문서화

**목표:** LLM 성공에 의존하지 않고 end-to-end 동작을 입증한다.

### Task 16: End-to-End 서비스 커버리지 추가

**파일:**
- 생성: `test/analysis/ai-growth-report.integration.test.js`

- [ ] **단계 1: 가짜 Repository와 실패하는 LLM으로 통합 테스트 작성**

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const { createAiGrowthReportService } = require('../../backend/analysis/service/ai-growth-report.service');

test('AI growth report service falls back when LLM provider fails', async () => {
  const saved = [];
  const service = createAiGrowthReportService({
    historyRepo: {
      getRecentHistory: async () => ({
        sessions: [
          { session_id: 's1', final_score: 55, status: 'done', ended_at: '2026-01-01T00:00:00Z', exercise_name: '스쿼트' },
          { session_id: 's2', final_score: 70, status: 'done', ended_at: '2026-01-02T00:00:00Z', exercise_name: '스쿼트' },
        ],
        metrics: [
          { session_id: 's1', metric_key: 'depth', metric_name: '스쿼트 깊이', avg_score: 48, sample_count: 20 },
          { session_id: 's2', metric_key: 'depth', metric_name: '스쿼트 깊이', avg_score: 66, sample_count: 20 },
        ],
        events: [],
      }),
    },
    reportRepo: {
      getLatestReport: async () => null,
      saveReport: async (row) => { saved.push(row); },
    },
    llmClient: { generateJson: async () => { throw new Error('provider down'); } },
  });

  const result = await service.getCoachReport({ userId: 'u1', period: 'recent_5', exercise: 'squat' });
  assert.equal(result.status, 'completed');
  assert.equal(result.isFallback, true);
  assert.equal(result.fallbackReason, 'PROVIDER_ERROR');
  assert.equal(saved.length, 1);
});
```

- [ ] **단계 2: 통합 테스트 실행**

실행: `node --test test/analysis/ai-growth-report.integration.test.js`

예상: 성공.

- [ ] **단계 3: 전체 analysis 테스트 실행**

실행: `node --test test/analysis/`

예상: 모든 analysis 테스트 성공.

- [ ] **단계 4: 전체 workout/history 테스트 실행**

실행: `node --test test/workout/ test/history*.test.js test/*history*.test.js`

예상: 성공. 파일이 없는 경우 `git ls-files 'test/*history*.test.js' 'test/workout/*.test.js'`로 실제 경로만 재실행.

- [ ] **단계 5: 커밋**

```bash
git add test/analysis/ai-growth-report.integration.test.js
git commit -m "test(analysis): cover AI growth report fallback flow"
```

### Task 17: 스펙 상태 업데이트와 수동 QA 노트

**파일:**
- 수정: `docs/specs/2026-05-03_fitplus_ai_growth_report_spec.md`
- 생성: `docs/plans/2026-05-03_ai_growth_report_manual_qa.md`

- [ ] **단계 1: 스펙에 구현 상태 추가**

`docs/specs/2026-05-03_fitplus_ai_growth_report_spec.md` 상단에 추가:

```markdown
> 구현 상태: Phase 1 MVP 구현 완료 (HistoryTrendFeature, 폴백 리포트, LLM 선택 경로, session_event 캐시, 히스토리/운동 UI 카드).
```

- [ ] **단계 2: 수동 QA 체크리스트 추가**

`docs/plans/2026-05-03_ai_growth_report_manual_qa.md` 생성:

```markdown
# AI 성장 리포트 수동 QA

- [ ] 일반 사용자로 로그인한다.
- [ ] 메트릭이 저장된 스쿼트 세션을 최소 2회 완료한다.
- [ ] `/history`를 열고 AI 성장 리포트 카드가 나타나는지 확인한다.
- [ ] 카드에 요약, 개선점, 약점, 미션, 신뢰도 노트가 표시되는지 확인한다.
- [ ] 스쿼트 세션을 시작하고 운동 전 오늘의 AI 미션이 나타나는지 확인한다.
- [ ] 운동을 마치고 결과 페이지에서 미션/코칭 카드가 나타나는지 확인한다.
- [ ] `OPENROUTER_API_KEY`를 임시로 제거하고 폴백 리포트가 여전히 표시되는지 확인한다.
- [ ] `OPENROUTER_API_KEY`를 복구하고 LLM 성공 시 `isFallback: false`가 응답에 포함되는지 확인한다.
- [ ] `POST /api/users/me/coach-report/rebuild`를 호출하고 새 `AI_HISTORY_REPORT` 이벤트가 저장되는지 확인한다.
```

- [ ] **단계 3: 문서 커밋**

```bash
git add docs/specs/2026-05-03_fitplus_ai_growth_report_spec.md docs/plans/2026-05-03_ai_growth_report_manual_qa.md
git commit -m "docs(analysis): add AI growth report QA notes"
```

---

## 최종 검증

- [ ] analysis 테스트 스위트 실행:

```bash
node --test test/analysis/
```

예상: 성공.

- [ ] 기존 workout 스위트 실행:

```bash
node --test test/workout/
```

예상: 성공.

- [ ] git 상태 확인:

```bash
git status
```

예상: 최종 커밋 후 작업 트리가 깨끗함.

---

## 자체 검토

스펙 커버리지:

- 기존 DB 히스토리 소스: Phase 2 Repository에서 커버.
- `HistoryTrendFeature`: Phase 1 분석기 Tasks에서 커버.
- 개선/약점/후퇴: Task 4에서 커버.
- 데이터 품질 및 카메라 이슈 분리: Task 5에서 커버.
- 결정론적 폴백: Task 10에서 커버.
- LLM 스키마 기반 출력: Task 9, 11에서 커버.
- `session_event` 캐시: Task 8과 서비스 통합에서 커버.
- API 엔드포인트: Task 13에서 커버.
- 히스토리 UI와 오늘의 미션 UI: Task 14, 15에서 커버.
- 신규 DB 테이블 없음: 모든 영속성은 `session_event` 사용.

알려진 구현 결정 사항:

- `exercise=all`은 초기 UI에서 지원 운동으로 정규화. API는 허용하지만 MVP UI는 혼합 메트릭 미션을 피하기 위해 특정 운동을 요청해야 함.
- 캐시 무효화는 단순 최신 매치 조회. Rebuild 엔드포인트가 MVP의 명시적 무효화 경로.
- LLM은 선택 사항. 폴백 경로는 필수이며 provider 호출 활성화 전 반드시 통과해야 함.
