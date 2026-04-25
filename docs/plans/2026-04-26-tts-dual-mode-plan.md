# TTS 이중화: 내장 TTS / AI API TTS 구현 계획 (결과물)

**목표:** 브라우저 내장 TTS + OpenRouter TTS를 선택 가능하게 이중화. 모델/보이스 선택은 `/settings` 페이지에서, 실제 피드백은 운동 세션에서.

**결정:** DB 수정 없이 localStorage로 충분. 간단하게 유지.

---

## 아키텍처 (실제 구현)

```
/settings 페이지:
  GET /api/tts/models  → OpenRouter ?output_modalities=speech 로 TTS 모델 목록 조회
  localStorage         → fitplus_tts_config { provider, model, voice } 저장

운동 세션:
  session-controller.js → localStorage readTtsConfig() → createTtsProvider()
    ├─ browser provider  → createBrowserSpeechProvider()
    └─ openrouter provider → createApiSpeechProvider({ endpoint:'/api/tts', model, voice })

POST /api/tts → OpenRouter /audio/speech → mp3 버퍼 반환
```

---

## 구현된 파일

**신규:**
- `controllers/tts.js` — OpenRouter TTS 모델 목록 + 스피치 프록시
- `routes/tts.js` — `GET /api/tts/models`, `POST /api/tts`
- `public/js/workout/session-voice.js` — `createBrowserSpeechProvider`, `createApiSpeechProvider`, `createSessionVoice`
- `test/tts-controller.test.js`
- `test/workout/session-voice.test.js`
- `test/workout/session-controller-voice.test.js`

**수정:**
- `app.js` — `/api/tts` 라우트 등록
- `views/settings/index.ejs` — TTS 설정 카드 (provider: browser/openrouter, 모델/보이스/테스트)
- `public/js/workout/session-controller.js` — `readTtsConfig()`, `createTtsProvider()`, 피드백 이벤트 라우팅
- `public/js/workout/session-buffer.js` — `addEvent(type, payload)` 하위 호환, `recordEvent(event)`
- `controllers/workout.js` — `normalizeEvents()` payload allowlist
- `views/workout/session.ejs` — 음성 토글 UI
- `public/js/workout/session-ui.js` — 토글 핸들러

---

## `controllers/tts.js`

```js
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

// GET /api/tts/models
const getTtsModels = async (req, res) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    const response = await fetch(`${OPENROUTER_BASE}/models?output_modalities=speech`, {
        headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await response.json();
    const ttsModels = (data.data || []).map(m => ({ id: m.id, name: m.name || m.id }));
    const voices = ['alloy', 'echo', 'fable', 'nova', 'onyx', 'shimmer'];
    return res.json({ models: ttsModels, voices });
};

// POST /api/tts
const textToSpeech = async (req, res) => {
    const { message, model, voice } = req.body;
    // OpenRouter /audio/speech 호출 → mp3 버퍼 반환
    const response = await fetch(`${OPENROUTER_BASE}/audio/speech`, { ... });
    const buffer = Buffer.from(await response.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(buffer);
};
```

OpenRouter가 현재 8개 TTS 모델 제공 (2026-04 기준):
- `openai/gpt-4o-mini-tts-2025-12-15`
- `mistralai/voxtral-mini-tts-2603`
- `google/gemini-3.1-flash-tts-preview`
- `zyphra/zonos-v0.1-transformer`, `zyphra/zonos-v0.1-hybrid`
- `sesame/csm-1b`, `canopylabs/orpheus-3b-0.1-ft`, `hexgrad/kokoro-82m`

---

## `session-voice.js` — Provider 인터페이스

```js
// 내장 브라우저 TTS
function createBrowserSpeechProvider() {
    return {
        name: 'browser-speech',
        isSupported() { return typeof speechSynthesis !== 'undefined'; },
        speak({ message, lang = 'ko-KR', rate = 1.0 }) { ... },
        cancel() { speechSynthesis.cancel(); },
    };
}

// OpenRouter API TTS (서버 프록시)
function createApiSpeechProvider({ endpoint, model, voice, rate }) {
    return {
        name: 'api-speech',
        isSupported() { return typeof fetch === 'function' && typeof Audio === 'function'; },
        speak({ message }) {
            this.cancel();               // ← this.cancel() 로 수정 (버그 픽스)
            fetch(endpoint, { body: JSON.stringify({message, model, voice}) })
                .then(r => r.blob())
                .then(blob => { audio.src = URL.createObjectURL(blob); audio.play(); });
            return { spoken: true };
        },
        cancel() { if (currentAudio) { currentAudio.pause(); currentAudio = null; } },
    };
}

// SessionVoice wrapper (중복억제, 간격제한, 음소거)
function createSessionVoice({ provider, enabled, minIntervalMs, ... }) {
    return {
        speak(message, context),
        setEnabled(enabled), isEnabled(), cancel(), isSupported(),
    };
}
```

---

## `session-controller.js` — Provider 선택

```js
function readTtsConfig() {
    try {
        return JSON.parse(localStorage.getItem('fitplus_tts_config') || '{}');
    } catch { return {}; }
}

function createTtsProvider() {
    const config = readTtsConfig();
    if (config.provider === 'openrouter' && typeof createApiSpeechProvider === 'function') {
        return createApiSpeechProvider({
            endpoint: '/api/tts',
            model: config.model || 'openai/gpt-4o-mini-tts-2025-12-15',
            voice: config.voice || 'nova',
        });
    }
    return createBrowserSpeechProvider();  // fallback
}
```

`shouldSpeakFeedbackEvent()` — 오직 `LOW_SCORE_HINT`만 발화:
```js
function shouldSpeakFeedbackEvent(event) {
    return event.type === 'LOW_SCORE_HINT';
}
```

---

## 테스트 결과

118 tests, 0 failures. (npm test 기준)

---

## 수동 검증

1. `.env`에 `OPENROUTER_API_KEY=sk-or-...` 설정
2. `node app.js` → `/settings` 접속 → AI TTS (OpenRouter) 선택
3. 모델/보이스 선택 → 음성 테스트 버튼으로 확인
4. 운동 세션 진입 → 자세 불량 시 OpenRouter TTS 음성 출력 확인

---

## 아키텍처 결정

| 항목 | 결정 |
|---|---|
| 설정 저장 | localStorage (`fitplus_tts_config`), DB 수정 없음 |
| 모델 목록 | OpenRouter `?output_modalities=speech` 동적 조회 |
| 모델 ID 필터 | `architecture.output_modalities.includes('speech')` (서버 측) |
| API 키 | `OPENROUTER_API_KEY` (OpenRouter 하나로 통일) |
| 스피치 엔드포인트 | `POST https://openrouter.ai/api/v1/audio/speech` |
| 음성 피드백 대상 | `LOW_SCORE_HINT` 만 (자세 교정 필요 시) |
| 화면-only 피드백 | `REP_COMPLETE_FEEDBACK`, `QUALITY_GATE_WITHHOLD` |
