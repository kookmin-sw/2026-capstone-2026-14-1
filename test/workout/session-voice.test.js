const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createBrowserSpeechProvider,
  createSessionVoice,
} = require('../../public/js/workout/session-voice.js');

function createProviderStub() {
  const calls = [];
  return {
    calls,
    cancelled: 0,
    isSupported() {
      return true;
    },
    speak(payload) {
      calls.push(payload);
      return { spoken: true };
    },
    cancel() {
      this.cancelled += 1;
    },
  };
}

function createStorageStub(initial = {}) {
  const values = { ...initial };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(values, key)
        ? values[key]
        : null;
    },
    setItem(key, value) {
      values[key] = String(value);
    },
  };
}

test('browser speech provider reports unsupported when Web Speech API is missing', () => {
  const provider = createBrowserSpeechProvider({
    speechSynthesis: null,
    SpeechSynthesisUtterance: null,
  });

  assert.equal(provider.name, 'browser-speech');
  assert.equal(provider.isSupported(), false);
});

test('browser speech provider creates a Korean utterance with rate and message', () => {
  const spoken = [];
  function FakeUtterance(text) {
    this.text = text;
  }

  const provider = createBrowserSpeechProvider({
    speechSynthesis: {
      speak(utterance) {
        spoken.push(utterance);
      },
      cancel() {},
    },
    SpeechSynthesisUtterance: FakeUtterance,
  });

  assert.equal(provider.isSupported(), true);

  provider.speak({
    message: '무릎을 바깥쪽으로 밀어주세요',
    lang: 'ko-KR',
    rate: 0.95,
  });

  assert.equal(spoken.length, 1);
  assert.equal(spoken[0].text, '무릎을 바깥쪽으로 밀어주세요');
  assert.equal(spoken[0].lang, 'ko-KR');
  assert.equal(spoken[0].rate, 0.95);
});

test('session voice does not speak when disabled', () => {
  const provider = createProviderStub();
  const voice = createSessionVoice({
    provider,
    enabled: false,
    now: () => 1000,
  });

  const result = voice.speak('조금 더 깊이 앉아주세요', {
    type: 'LOW_SCORE_HINT',
  });

  assert.equal(result.spoken, false);
  assert.equal(result.reason, 'disabled');
  assert.equal(provider.calls.length, 0);
});

test('session voice suppresses duplicate messages inside duplicate window', () => {
  const provider = createProviderStub();
  let now = 1000;
  const voice = createSessionVoice({
    provider,
    enabled: true,
    minIntervalMs: 0,
    duplicateWindowMs: 6000,
    now: () => now,
  });

  assert.equal(
    voice.speak('무릎을 바깥쪽으로 밀어주세요', { type: 'LOW_SCORE_HINT' }).spoken,
    true,
  );
  now = 2000;
  const result = voice.speak('무릎을 바깥쪽으로 밀어주세요', {
    type: 'LOW_SCORE_HINT',
  });

  assert.equal(result.spoken, false);
  assert.equal(result.reason, 'duplicate');
  assert.equal(provider.calls.length, 1);
});

test('session voice respects minimum interval for non-critical messages', () => {
  const provider = createProviderStub();
  let now = 1000;
  const voice = createSessionVoice({
    provider,
    enabled: true,
    minIntervalMs: 2500,
    duplicateWindowMs: 0,
    now: () => now,
  });

  assert.equal(voice.speak('좋아요', { type: 'REP_COMPLETE_FEEDBACK' }).spoken, true);
  now = 2000;

  const result = voice.speak('조금 더 깊이 앉아주세요', {
    type: 'LOW_SCORE_HINT',
    severity: 'warning',
  });

  assert.equal(result.spoken, false);
  assert.equal(result.reason, 'cooldown');
  assert.equal(provider.calls.length, 1);
});

test('critical session voice cancels active speech and bypasses minimum interval', () => {
  const provider = createProviderStub();
  let now = 1000;
  const voice = createSessionVoice({
    provider,
    enabled: true,
    minIntervalMs: 2500,
    duplicateWindowMs: 0,
    now: () => now,
  });

  voice.speak('좋아요', { type: 'REP_COMPLETE_FEEDBACK' });
  now = 1200;

  const result = voice.speak('카메라에 전신이 보이도록 해주세요', {
    type: 'NO_PERSON',
    severity: 'critical',
  });

  assert.equal(result.spoken, true);
  assert.equal(provider.cancelled, 1);
  assert.equal(provider.calls.length, 2);
});

test('session voice persists enabled preference when storage is provided', () => {
  const provider = createProviderStub();
  const storage = createStorageStub({ fitplus_voice_feedback_enabled: 'false' });

  const voice = createSessionVoice({
    provider,
    enabled: true,
    storage,
  });

  assert.equal(voice.isEnabled(), false);
  voice.setEnabled(true);
  assert.equal(voice.isEnabled(), true);
  assert.equal(storage.getItem('fitplus_voice_feedback_enabled'), 'true');
});
