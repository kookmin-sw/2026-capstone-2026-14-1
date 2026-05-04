const test = require('node:test');
const assert = require('node:assert/strict');

const { getTtsModels, textToSpeech } = require('../controllers/tts');

function createResponseStub() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('textToSpeech requests mp3 audio and preserves upstream content type', async () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.OPENROUTER_API_KEY;
  const upstreamBody = Buffer.from([0xff, 0xf3, 0xc4, 0xc4]);
  let requestBody;

  process.env.OPENROUTER_API_KEY = 'test-key';
  global.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      headers: {
        get(name) {
          return name.toLowerCase() === 'content-type' ? 'audio/mpeg' : null;
        },
      },
      async arrayBuffer() {
        return upstreamBody.buffer.slice(
          upstreamBody.byteOffset,
          upstreamBody.byteOffset + upstreamBody.byteLength,
        );
      },
    };
  };

  const res = createResponseStub();

  try {
    await textToSpeech(
      {
        body: {
          message: '안녕하세요, 음성 테스트입니다.',
          model: 'openai/gpt-4o-mini-tts-2025-12-15',
          voice: 'nova',
        },
      },
      res,
    );
  } finally {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalApiKey;
    }
  }

  assert.equal(requestBody.response_format, 'mp3');
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'audio/mpeg');
  assert.deepEqual(res.body, upstreamBody);
});

test('getTtsModels exposes only GPT-4o Mini TTS voices', async () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.OPENROUTER_API_KEY;

  process.env.OPENROUTER_API_KEY = 'test-key';
  global.fetch = async () => ({
    async json() {
      return {
        data: [
          { id: 'google/gemini-3.1-flash-tts-preview', name: 'Google: Gemini 3.1 Flash TTS Preview' },
          { id: 'openai/gpt-4o-mini-tts-2025-12-15', name: 'OpenAI: GPT-4o Mini TTS' },
          { id: 'google/gemini-2.5-flash-preview-tts', name: 'Google: Gemini 2.5 Flash Preview TTS' },
          { id: 'openai/tts-1', name: 'OpenAI: TTS-1' },
        ],
      };
    },
  });

  const res = createResponseStub();

  try {
    await getTtsModels({}, res);
  } finally {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalApiKey;
    }
  }

  assert.deepEqual(res.body.models.map(model => model.id), [
    'openai/gpt-4o-mini-tts-2025-12-15',
  ]);
  assert.equal(res.body.defaultModel, 'openai/gpt-4o-mini-tts-2025-12-15');
  assert.equal(res.body.defaultVoice, 'nova');
  assert.equal(res.body.voicesByModel['google/gemini-3.1-flash-tts-preview'], undefined);
  assert.deepEqual(res.body.voicesByModel['openai/gpt-4o-mini-tts-2025-12-15'], [
    'alloy',
    'ash',
    'ballad',
    'coral',
    'echo',
    'fable',
    'nova',
    'onyx',
    'sage',
    'shimmer',
    'verse',
    'marin',
    'cedar',
  ]);
});

test('textToSpeech defaults to GPT-4o Mini TTS with OpenAI voice', async () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.OPENROUTER_API_KEY;
  let requestBody;

  process.env.OPENROUTER_API_KEY = 'test-key';
  global.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      headers: {
        get(name) {
          return name.toLowerCase() === 'content-type' ? 'audio/mpeg' : null;
        },
      },
      async arrayBuffer() {
        return new ArrayBuffer(0);
      },
    };
  };

  const res = createResponseStub();

  try {
    await textToSpeech({ body: { message: '기본 음성 테스트' } }, res);
  } finally {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalApiKey;
    }
  }

  assert.equal(requestBody.model, 'openai/gpt-4o-mini-tts-2025-12-15');
  assert.equal(requestBody.voice, 'nova');
});
