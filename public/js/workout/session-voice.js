const DEFAULT_STORAGE_KEY = 'fitplus_voice_feedback_enabled';

function createBrowserSpeechProvider({
  speechSynthesis = typeof window !== 'undefined' ? window.speechSynthesis : null,
  SpeechSynthesisUtterance = typeof window !== 'undefined'
    ? window.SpeechSynthesisUtterance
    : null,
} = {}) {
  return {
    name: 'browser-speech',
    isSupported() {
      return Boolean(speechSynthesis && SpeechSynthesisUtterance);
    },
    speak({ message, lang = 'ko-KR', rate = 1.0 } = {}) {
      if (!this.isSupported() || !message) {
        return { spoken: false, reason: 'unsupported' };
      }

      const utterance = new SpeechSynthesisUtterance(message);
      utterance.lang = lang;
      utterance.rate = rate;
      speechSynthesis.speak(utterance);
      return { spoken: true };
    },
    cancel() {
      if (speechSynthesis?.cancel) {
        speechSynthesis.cancel();
      }
    },
  };
}

function readStoredEnabled(storage, storageKey, fallback) {
  if (!storage?.getItem) return fallback;
  const stored = storage.getItem(storageKey);
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  return fallback;
}

function createSessionVoice({
  provider = createBrowserSpeechProvider(),
  enabled = true,
  minIntervalMs = 2500,
  duplicateWindowMs = 6000,
  defaultLang = 'ko-KR',
  defaultRate = 1.0,
  storage = typeof window !== 'undefined' ? window.localStorage : null,
  storageKey = DEFAULT_STORAGE_KEY,
  now = Date.now,
} = {}) {
  let voiceEnabled = readStoredEnabled(storage, storageKey, enabled);
  let lastSpokenAt = -Infinity;
  const lastMessageAt = new Map();

  function isSupported() {
    return Boolean(provider?.isSupported?.());
  }

  function isEnabled() {
    return voiceEnabled && isSupported();
  }

  function setEnabled(nextEnabled) {
    voiceEnabled = nextEnabled === true;
    if (storage?.setItem) {
      storage.setItem(storageKey, voiceEnabled ? 'true' : 'false');
    }
    if (!voiceEnabled) {
      provider?.cancel?.();
    }
  }

  function cancel() {
    provider?.cancel?.();
  }

  function speak(message, context = {}) {
    const normalizedMessage = typeof message === 'string' ? message.trim() : '';
    if (!normalizedMessage) {
      return { spoken: false, reason: 'empty' };
    }
    if (!voiceEnabled) {
      return { spoken: false, reason: 'disabled' };
    }
    if (!isSupported()) {
      return { spoken: false, reason: 'unsupported' };
    }

    const currentTime = Number(now()) || 0;
    const severity = context?.severity || 'info';
    const isCritical = severity === 'critical';
    const previousMessageAt = lastMessageAt.get(normalizedMessage);

    if (
      !isCritical &&
      Number.isFinite(previousMessageAt) &&
      currentTime - previousMessageAt < duplicateWindowMs
    ) {
      return { spoken: false, reason: 'duplicate' };
    }

    if (!isCritical && currentTime - lastSpokenAt < minIntervalMs) {
      return { spoken: false, reason: 'cooldown' };
    }

    if (isCritical) {
      provider.cancel?.();
    }

    const result = provider.speak({
      message: normalizedMessage,
      lang: context?.lang || defaultLang,
      rate: context?.rate || defaultRate,
      context,
    }) || { spoken: true };

    if (result.spoken !== false) {
      lastSpokenAt = currentTime;
      lastMessageAt.set(normalizedMessage, currentTime);
      return { spoken: true };
    }

    return result;
  }

  return {
    cancel,
    isEnabled,
    isSupported,
    setEnabled,
    speak,
  };
}

if (typeof window !== 'undefined') {
  window.createBrowserSpeechProvider = createBrowserSpeechProvider;
  window.createSessionVoice = createSessionVoice;
}

if (typeof module !== 'undefined') {
  module.exports = {
    createBrowserSpeechProvider,
    createSessionVoice,
  };
}
