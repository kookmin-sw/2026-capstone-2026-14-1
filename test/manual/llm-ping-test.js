require('dotenv').config();
const { createLlmClient } = require('../../backend/analysis/llm-coach/llm-client');

async function main() {
  console.log('API Key:', process.env.OPENROUTER_API_KEY ? '설정됨 (' + process.env.OPENROUTER_API_KEY.slice(0, 15) + '...)' : '없음');
  console.log('Model:', process.env.OPENROUTER_LLM_MODEL || '(기본: openai/gpt-4o-mini)');
  console.log('');

  const client = createLlmClient();
  try {
    const result = await client.generateJson({
      systemPrompt: '간단한 JSON만 출력하라.',
      userPrompt: '{"test": "hello"}와 같은 JSON을 그대로 출력하라.',
      timeoutMs: 15000,
    });
    console.log('LLM 호출 성공!');
    console.log('모델:', result.model);
    console.log('출력:', JSON.stringify(result.output, null, 2));
  } catch (error) {
    console.error('LLM 호출 실패:', error.message);
    console.error('에러 상세:');
    console.error('  이름:', error.name);
    console.error('  메시지:', error.message);
    console.error('  상태:', error.status);
    console.error('  전체:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
  }
}
main();
