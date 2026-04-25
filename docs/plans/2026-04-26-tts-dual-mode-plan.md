# TTS 이중화: 내장 TTS / AI API TTS 구현 계획

**목표:** 브라우저 내장 TTS + AI API TTS(OpenRouter)를 선택 가능하게 이중화. 모델/보이스 선택은 `/settings` 페이지에서, 실제 피드백은 운동 세션에서.

---

## 아키텍처

```
/settings 페이지:
  GET /api/tts/models  → OpenRouter에서 사용 가능한 TTS 모델 목록 조회
  POST /settings/tts   → 사용자 TTS 설정 DB 저장

운동 세션:
  GET /free-workout/session → 서버가 user_settings에서 TTS 설정 주입
  session-controller.js → 주입된 설정으로 voice provider 생성
```

---

## Task 1: DB 스키마 확장

**수정 파일:**
- `docs/sql/DB_init.sql`

`user_settings` 테이블에 TTS 관련 컬럼 추가:

```sql
ALTER TABLE user_settings
  ADD COLUMN tts_provider VARCHAR(50) DEFAULT 'browser',
  ADD COLUMN tts_model    VARCHAR(100),
  ADD COLUMN tts_voice    VARCHAR(50);
```

`tts_provider` 값: `'browser'` (내장) 또는 `'openrouter'`

---

## Task 2: 서버 TTS 컨트롤러 + 라우트

**생성 파일:**
- `controllers/tts.js`
- `routes/tts.js`

### `controllers/tts.js`

```js
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

// OpenRouter에서 사용 가능한 TTS 모델 목록 조회
const getTtsModels = async (req, res) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        return res.json({ models: [], error: 'OPENROUTER_API_KEY not set' });
    }

    try {
        const response = await fetch(`${OPENROUTER_BASE}/models`, {
            headers: { Authorization: `Bearer ${apiKey}` },
        });
        const data = await response.json();
        const ttsModels = (data.data || [])
            .filter(m => m.id && m.id.includes('tts'))
            .map(m => ({ id: m.id, name: m.name || m.id }));
        return res.json({ models: ttsModels });
    } catch (error) {
        return res.status(502).json({ models: [], error: 'OpenRouter unavailable' });
    }
};

// TTS 음성 생성
const textToSpeech = async (req, res) => {
    const { message, model, voice } = req.body;
    if (!message?.trim()) {
        return res.status(400).json({ error: 'message is required' });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'OPENROUTER_API_KEY not set' });
    }

    try {
        const response = await fetch(`${OPENROUTER_BASE}/audio/speech`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'openai/tts-1',
                voice: voice || 'nova',
                input: message.trim().slice(0, 500),
            }),
        });

        if (!response.ok) {
            const err = await response.text().catch(() => '');
            return res.status(response.status).json({ error: `TTS failed: ${response.status}` });
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Cache-Control', 'no-cache');
        return res.send(buffer);
    } catch (error) {
        return res.status(502).json({ error: 'TTS unavailable' });
    }
};

module.exports = { getTtsModels, textToSpeech };
```

### `routes/tts.js`

```js
const express = require('express');
const router = express.Router();
const { getTtsModels, textToSpeech } = require('../controllers/tts');

router.get('/models', getTtsModels);
router.post('/', textToSpeech);

module.exports = router;
```

### `app.js`에 라우트 등록

```js
app.use('/api/tts', require('./routes/tts'));
```

---

## Task 3: 설정 페이지 TTS UI + 저장

**수정 파일:**
- `controllers/settings.js`
- `routes/main.js`
- `views/settings/index.ejs`

### `controllers/settings.js` — TTS 설정 저장 추가

```js
const validTtsProviders = ['browser', 'openrouter'];

const updateTts = asyncHandler(async (req, res) => {
    const userId = req.user.user_id;
    const { provider, model, voice } = req.body;

    if (provider && !validTtsProviders.includes(provider)) {
        return res.status(400).json({ error: 'invalid provider' });
    }

    const updates = {};
    if (provider) updates.tts_provider = provider;
    if (model !== undefined) updates.tts_model = model || null;
    if (voice !== undefined) updates.tts_voice = voice || null;

    await supabase.from('user_settings').upsert({
        user_id: userId,
        ...updates,
    });

    return res.json({ ok: true });
});

// module.exports에 추가
module.exports = {
    getSettingsPage,
    updateNickname,
    updatePassword,
    updateTheme,
    updateTts,
};
```

### `routes/main.js` — 라우트 추가

```js
const { ..., updateTts } = require('../controllers/settings');

router.post('/settings/tts', requireAuth, updateTts);
```

### `views/settings/index.ejs` — TTS 설정 카드 추가

password 카드와 account 카드 사이에 추가:

```ejs
<div class="settings-card">
  <h3>음성 피드백 (TTS)</h3>

  <div class="field" style="margin-bottom: 16px;">
    <label class="field-label">TTS 방식</label>
    <div class="radio-group">
      <label><input type="radio" name="ttsProvider" value="browser"
        <%= (!settings.tts_provider || settings.tts_provider === 'browser') ? 'checked' : '' %>> 내장 TTS</label>
      <label><input type="radio" name="ttsProvider" value="openrouter"
        <%= settings.tts_provider === 'openrouter' ? 'checked' : '' %>> AI TTS (OpenRouter)</label>
    </div>
  </div>

  <div class="field" id="ttsModelField" style="display:none; margin-bottom: 16px;">
    <label class="field-label" for="ttsModel">TTS 모델</label>
    <select id="ttsModel" name="ttsModel">
      <option value="">불러오는 중...</option>
    </select>
  </div>

  <div class="field" id="ttsVoiceField" style="display:none;">
    <label class="field-label" for="ttsVoice">보이스</label>
    <select id="ttsVoice" name="ttsVoice">
      <option value="nova">nova</option>
      <option value="alloy">alloy</option>
      <option value="echo">echo</option>
      <option value="fable">fable</option>
      <option value="onyx">onyx</option>
      <option value="shimmer">shimmer</option>
    </select>
  </div>

  <button type="button" id="ttsTestBtn" style="display:none; margin-top: 12px;">
    음성 테스트
  </button>
  <div class="field-message" id="ttsMessage"></div>
</div>
```

클라이언트 JS:
- `ttsProvider` 변경 시 → `provider === 'openrouter'`면 모델/보이스 필드 표시, `GET /api/tts/models` 호출해서 모델 목록 채움
- 모델/보이스/프로바이더 변경 시 → `POST /settings/tts`로 자동 저장
- 테스트 버튼 → `POST /api/tts` 호출해 실제 음성 출력

### `controllers/settings.js` `getSettingsPage` — TTS 설정도 조회

기존 `getSettingsPage`에서 `user_settings` 조회 시 `tts_provider, tts_model, tts_voice`도 함께 가져오도록 쿼리 확장.

---

## Task 4: 운동 세션에 TTS 설정 주입

**수정 파일:**
- `controllers/workout.js`
- `public/js/workout/session-voice.js`
- `public/js/workout/session-controller.js`

### `controllers/workout.js` — 세션 페이지 렌더링에 TTS 설정 주입

`getFreeWorkoutPage` / `getFreeWorkoutSession`에서 `user_settings`의 TTS 값을 EJS 템플릿에 전달:

```js
const { data: settings } = await supabase
    .from('user_settings')
    .select('tts_provider, tts_model, tts_voice')
    .eq('user_id', userId)
    .single();

res.render('workout/session', {
    ...other,
    ttsConfig: settings || { tts_provider: 'browser' },
});
```

### `views/workout/session.ejs` — TTS 설정을 JS로 주입

```ejs
<script>
  window.__FITPLUS_TTS__ = <%- JSON.stringify(ttsConfig || { tts_provider: 'browser' }) %>;
</script>
```

### `session-controller.js` — 주입된 설정으로 provider 생성

```js
const ttsConfig = (typeof window !== 'undefined' && window.__FITPLUS_TTS__)
    || { tts_provider: 'browser' };

function createVoiceProvider() {
    if (ttsConfig.tts_provider === 'openrouter') {
        return sessionApiSpeechFactory({
            endpoint: '/api/tts',
            model: ttsConfig.tts_model || 'openai/tts-1',
            voice: ttsConfig.tts_voice || 'nova',
        });
    }
    return createBrowserSpeechProvider();
}
```

---

## Task 5: `session-voice.js` — `createApiSpeechProvider` 추가

**수정 파일:**
- `public/js/workout/session-voice.js`

```js
function createApiSpeechProvider({
    endpoint = '/api/tts',
    model = 'openai/tts-1',
    voice = 'nova',
    rate = 1.0,
} = {}) {
    let currentAudio = null;

    return {
        name: 'api-speech',
        isSupported() {
            return typeof fetch === 'function' && typeof Audio === 'function';
        },
        speak({ message } = {}) {
            if (!this.isSupported() || !message) {
                return { spoken: false, reason: 'unsupported' };
            }
            currentAudio = new Audio();
            currentAudio.playbackRate = rate;

            fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, model, voice }),
            })
                .then(r => { if (!r.ok) throw new Error(r.status); return r.blob(); })
                .then(blob => {
                    const url = URL.createObjectURL(blob);
                    if (currentAudio) { currentAudio.src = url; currentAudio.play().catch(() => {}); }
                })
                .catch(e => console.error('API TTS:', e.message));
            return { spoken: true };
        },
        cancel() {
            if (currentAudio) { currentAudio.pause(); currentAudio.currentTime = 0; currentAudio = null; }
        },
    };
}
```

---

## Task 6: 테스트 및 검증

**테스트 파일:**
- `test/tts-proxy.test.js` — `GET /api/tts/models`, `POST /api/tts` 엔드포인트
- `test/workout/session-voice.test.js` — `createApiSpeechProvider` 추가

**수동 검증:**
1. `.env`에 `OPENROUTER_API_KEY` 설정
2. `node app.js` → `/settings` 접속 → AI TTS 선택 → 모델/보이스 설정 → 테스트 버튼
3. 운동 세션 진입 → 자세 불량 시 OpenRouter TTS 음성 출력 확인

---

## 파일 구조

```
신규:
  controllers/tts.js
  routes/tts.js
  test/tts-proxy.test.js

수정:
  docs/sql/DB_init.sql
  app.js
  controllers/settings.js
  routes/main.js
  views/settings/index.ejs
  controllers/workout.js
  views/workout/session.ejs
  public/js/workout/session-voice.js
  public/js/workout/session-controller.js
  test/workout/session-voice.test.js
```
