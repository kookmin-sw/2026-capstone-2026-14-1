# AI Growth Report Phase 3: Fallback And LLM Coaching

> Parent roadmap: `docs/plans/2026-05-03_ai_growth_report_implementation_plan.md`
> MVP policy: on-demand only. 리포트 결과는 DB에 저장하지 않는다.

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
