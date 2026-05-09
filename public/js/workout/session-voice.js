/**
 * session-voice.js
 *
 * 운동 세션 중 음성 피드백(TTS) 추상화.
 * - 기본: 브라우저 SpeechSynthesis(Web Speech API)
 * - 대안: 서버 TTS API로 오디오 재생(createApiSpeechProvider)
 *
 * 스팸 방지: 최소 간격(minIntervalMs), 동일 메시지 중복 방지(duplicateWindowMs),
 * 재생 중 일반 메시지 스킵(busy). severity가 critical이면 대기열을 끊고 우선 재생.
 *
 * 사용자 on/off 설정은 localStorage(기본 키: fitplus_voice_feedback_enabled)에 저장합니다.
 */

/** @type {string} 음성 사용 여부 로컬 스토리지 키 */
const DEFAULT_STORAGE_KEY = 'fitplus_voice_feedback_enabled';

/**
 * Web Speech API 기반 TTS 프로바이더를 만듭니다.
 * 브라우저 미지원 시 isSupported()가 false가 됩니다.
 *
 * @param {Object} [options]
 * @param {SpeechSynthesis|null} [options.speechSynthesis=window.speechSynthesis]
 * @param {typeof SpeechSynthesisUtterance|null} [options.SpeechSynthesisUtterance=window.SpeechSynthesisUtterance]
 * @returns {{
 *   name: string,
 *   isSupported: () => boolean,
 *   isSpeaking: () => boolean,
 *   speak: (opts: { message: string, lang?: string, rate?: number }) => { spoken: boolean, reason?: string },
 *   cancel: () => void
 * }}
 */
function createBrowserSpeechProvider({
  speechSynthesis = typeof window !== 'undefined' ? window.speechSynthesis : null,
  SpeechSynthesisUtterance = typeof window !== 'undefined'
    ? window.SpeechSynthesisUtterance
    : null,
} = {}) {
  let speaking = false;

  return {
    name: 'browser-speech',
    isSupported() {
      return Boolean(speechSynthesis && SpeechSynthesisUtterance);
    },
    isSpeaking() {
      return speaking || (speechSynthesis?.speaking ?? false);
    },
    speak({ message, lang = 'ko-KR', rate = 1.0 } = {}) {
      if (!this.isSupported() || !message) {
        return { spoken: false, reason: 'unsupported' };
      }

      const utterance = new SpeechSynthesisUtterance(message);
      utterance.lang = lang;
      utterance.rate = rate;
      utterance.onstart = () => { speaking = true; };
      utterance.onend = () => { speaking = false; };
      utterance.onerror = () => { speaking = false; };
      speechSynthesis.speak(utterance);
      return { spoken: true };
    },
    cancel() {
      speaking = false;
      if (speechSynthesis?.cancel) {
        speechSynthesis.cancel();
      }
    },
  };
}

/**
 * localStorage에서 음성 on/off를 읽습니다. 'true' / 'false' 문자열만 인정, 그 외는 fallback.
 *
 * @param {Storage|null} storage
 * @param {string} storageKey
 * @param {boolean} fallback
 * @returns {boolean}
 */
function readStoredEnabled(storage, storageKey, fallback) {
  if (!storage?.getItem) return fallback;
  const stored = storage.getItem(storageKey);
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  return fallback;
}

/**
 * 세션 전역 음성 피드백 컨트롤러를 생성합니다.
 * 스로틀/중복 억제 후 provider.speak를 호출합니다.
 *
 * @param {Object} [options]
 * @param {ReturnType<typeof createBrowserSpeechProvider>} [options.provider] - 실제 발화 구현
 * @param {boolean} [options.enabled=true] - 스토리지에 값 없을 때 기본 on
 * @param {number} [options.minIntervalMs=2500] - 연속 발화 최소 간격 (critical 제외)
 * @param {number} [options.duplicateWindowMs=6000] - 동일 문구 재생 쿨다운 (critical 제외)
 * @param {string} [options.defaultLang='ko-KR']
 * @param {number} [options.defaultRate=1.0] - SpeechSynthesis utterance.rate
 * @param {Storage|null} [options.storage=window.localStorage]
 * @param {string} [options.storageKey=DEFAULT_STORAGE_KEY]
 * @param {() => number} [options.now=Date.now] - 테스트용 시계 주입
 * @returns {{
 *   cancel: () => void,
 *   isEnabled: () => boolean,
 *   isSupported: () => boolean,
 *   setEnabled: (next: boolean) => void,
 *   speak: (message: string, context?: { severity?: string, lang?: string, rate?: number }) =>
 *     { spoken: boolean, reason?: string }
 * }}
 */
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

  /**
   * 음성 피드백 사용 여부를 설정하고 스토리지에 반영합니다.
   * 끄면 진행 중 발화를 취소합니다.
   *
   * @param {boolean} nextEnabled
   */
  function setEnabled(nextEnabled) {
    voiceEnabled = nextEnabled === true;
    if (storage?.setItem) {
      storage.setItem(storageKey, voiceEnabled ? 'true' : 'false');
    }
    if (!voiceEnabled) {
      provider?.cancel?.();
    }
  }

  /** 진행 중인 TTS를 중단합니다. */
  function cancel() {
    provider?.cancel?.();
  }

  /**
   * 메시지를 음성으로 출력합니다 (스로틀·중복·busy 규칙 적용).
   *
   * @param {string} message - 읽을 문장
   * @param {Object} [context]
   * @param {string} [context.severity] - 'critical'이면 쿨다운/중복 일부 우회, 재생 중이면 cancel 후 시도
   * @param {string} [context.lang]
   * @param {number} [context.rate]
   * @returns {{ spoken: boolean, reason?: string }}
   *   reason: empty | disabled | unsupported | busy | duplicate | cooldown
   */
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
    const isSpeaking = provider.isSpeaking?.() ?? false;

    // 일반 메시지는 재생 중이면 버림 — critical 만 큐 끊고 끼어들기 시도
    if (isSpeaking && !isCritical) {
      return { spoken: false, reason: 'busy' };
    }

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

    if (isCritical && isSpeaking) {
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

/**
 * 서버 `/api/tts`(또는 지정 endpoint)로 WAV/오디오 blob을 받아 재생하는 프로바이더.
 * CORS·fetch·Audio 지원 환경에서만 isSupported true.
 *
 * @param {Object} [options]
 * @param {string} [options.endpoint='/api/tts'] - POST JSON { message, model?, voice? }
 * @param {string} [options.model] - 서버에서 요구하는 TTS 모델 id
 * @param {string} [options.voice] - 음성 프리셋
 * @param {number} [options.rate=1.0] - HTMLAudioElement.playbackRate
 * @returns {ReturnType<typeof createBrowserSpeechProvider>} 와 동일한 형태의 API
 */
function createApiSpeechProvider({
  endpoint = '/api/tts',
  model = 'openai/gpt-4o-mini-tts-2025-12-15',
  voice = 'nova',
  rate = 1.0,
} = {}) {
  let currentAudio = null;

  return {
    name: 'api-speech',
    isSupported() {
      return typeof fetch === 'function' && typeof Audio === 'function';
    },
    speak({ message, lang = 'ko-KR', voice: msgVoice, model: msgModel } = {}) {
      if (!this.isSupported() || !message) {
        return { spoken: false, reason: 'unsupported' };
      }

      this.cancel();
      currentAudio = new Audio();
      currentAudio.playbackRate = rate;

      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          model: msgModel || model,
          voice: msgVoice || voice,
        }),
      })
        .then((response) => {
          if (!response.ok) throw new Error('TTS failed: ' + response.status);
          return response.blob();
        })
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          if (currentAudio) {
            currentAudio.src = url;
            currentAudio.play().catch(() => {});
          }
        })
        .catch((err) => {
          console.error('API TTS error:', err.message);
        });

      return { spoken: true };
    },
    isSpeaking() {
      return Boolean(currentAudio && !currentAudio.paused && !currentAudio.ended);
    },
    cancel() {
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
      }
    },
  };
}

if (typeof window !== 'undefined') {
  window.createBrowserSpeechProvider = createBrowserSpeechProvider;
  window.createApiSpeechProvider = createApiSpeechProvider;
  window.createSessionVoice = createSessionVoice;
}

if (typeof module !== 'undefined') {
  module.exports = {
    createBrowserSpeechProvider,
    createApiSpeechProvider,
    createSessionVoice,
  };
}
