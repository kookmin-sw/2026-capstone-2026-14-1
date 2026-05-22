/**
 * session-controller.js
 *
 * 운동 세션 라이프사이클 단일 진입점: 카메라·PoseEngine·ScoringEngine·RepCounter·UI·버퍼·루틴·학습 모드 연동.
 * - 포즈 루프: 품질 게이트 → 채점 → rep 갱신 → 음성/화면 피드백
 * - IIFE 내부 클로저로 상태 보관; Node 테스트 시 require로 일부 헬퍼 재사용
 */

function loadSessionQualityGate() {
  // Node 단위 테스트: CommonJS require로 동일 헬퍼를 직접 로드
  if (typeof module !== "undefined" && typeof require === "function") {
    return require("./quality-gate-session.js");
  }

  // 브라우저: 스크립트 로드 순서에 따라 전역에 붙은 모듈 사용
  if (typeof window !== "undefined") {
    return window.SessionQualityGate || null;
  }

  return null;
}

const sessionQualityGateHelpers = loadSessionQualityGate();

function loadSessionUiFactory() {
  if (typeof module !== "undefined" && typeof require === "function") {
    return require("./session-ui.js").createSessionUi;
  }

  if (typeof window !== "undefined") {
    return window.createSessionUi || null;
  }

  return null;
}

const sessionUiFactory = loadSessionUiFactory();

function loadSessionVoiceFactory() {
  if (typeof module !== "undefined" && typeof require === "function") {
    return require('./session-voice.js').createSessionVoice;
  }

  if (typeof window !== "undefined") {
    return window.createSessionVoice || null;
  }

  return null;
}

const sessionVoiceFactory = loadSessionVoiceFactory();

function loadRoutineSessionManagerFactory() {
  if (typeof module !== "undefined" && typeof require === "function") {
    return require("./routine-session-manager.js").createRoutineSessionManager;
  }

  if (typeof window !== "undefined") {
    return window.createRoutineSessionManager || null;
  }

  return null;
}

const routineSessionManagerFactory = loadRoutineSessionManagerFactory();

function loadWorkoutOnboardingGuide() {
  if (typeof module !== "undefined" && typeof require === "function") {
    return require("./onboarding-guide.js");
  }

  if (typeof window !== "undefined") {
    return window.WorkoutOnboardingGuide || null;
  }

  return null;
}

const workoutOnboardingGuide = loadWorkoutOnboardingGuide();

function loadLearnStepEngine() {
  if (typeof module !== "undefined" && typeof require === "function") {
    return require("./learn-step-engine.js");
  }

  if (typeof window !== "undefined") {
    return window.LearnStepEngine || null;
  }

  return null;
}

const learnStepEngine = loadLearnStepEngine();

if (!sessionQualityGateHelpers) {
  throw new Error("SessionQualityGate helpers are unavailable.");
}

if (typeof sessionUiFactory !== "function") {
  throw new Error("createSessionUi factory is unavailable.");
}

if (typeof routineSessionManagerFactory !== "function") {
  throw new Error("createRoutineSessionManager factory is unavailable.");
}

if (!learnStepEngine) {
  throw new Error("LearnStepEngine helpers are unavailable.");
}

const {
  mapWithholdReasonToMessage: mapGateWithholdReasonToMessage,
  shouldMirrorSourcePreview: shouldMirrorPreviewSource,
  createQualityGateTracker: createGateTracker,
  updateQualityGateTracker: updateGateTracker,
  buildGateInputsFromPoseData: buildGateInputs,
  shouldSuppressScoring: shouldGateSuppressScoring,
} = sessionQualityGateHelpers;

const {
  normalizeLearnStepEvaluation: normalizeLearnStepEvaluationHelper,
  updateLearnHoldState: updateLearnHoldStateHelper,
} = learnStepEngine;

function resolveDisplayedSetCountOnPause({
  mode,
  displayedSetCount = 1,
  phase,
  nextIsPaused,
}) {
  const current = Math.max(1, Math.round(Number(displayedSetCount) || 1));
  if (mode === "FREE" && phase === "WORKING" && nextIsPaused === true) {
    return current + 1;
  }
  return current;
}

function clearPoseOverlay({ poseEngine, poseCanvas }) {
  if (poseEngine?.clearPose) {
    poseEngine.clearPose(poseCanvas);
    return;
  }

  const ctx = poseCanvas?.getContext?.("2d");
  if (!ctx || !poseCanvas) return;

  ctx.clearRect(0, 0, poseCanvas.width, poseCanvas.height);
}

/**
 * 운동 세션 페이지 — 포즈/점수/루틴/세션 저장 오케스트레이션
 * 아키텍처 흐름:
 *   1. initAIEngines(): MediaPipe Pose + ScoringEngine + RepCounter 초기화
 *   2. connectCameraSource(): 선택한 카메라 소스 스트림 연결
 *   3. startPoseDetection(): requestAnimationFrame 루프 시작 → poseEngine.send(video)
 *   4. handlePoseDetected(): 품질 게이트 → 채점 → 반복 감지 → UI 업데이트
 *   5. handleRepComplete(): rep 완료 시 서버 동기화(루틴) + 피드백 표시
 *   6. finishWorkout(): 세션 종료 + SessionBuffer.export() → 서버 저장
 *
 * @param {object} workoutData 서버에서 주입된 세션 데이터
 *   - exercise: 운동 메타데이터 (code, name, allowed_views, default_view 등)
 *   - scoringProfile: DB 채점 프로필 (없으면 운동 모듈 fallback 사용)
 *   - mode: 'FREE' | 'ROUTINE' | 'LEARN'
 *   - routine: 루틴 정보 (ROUTINE 모드일 때만)
 */
async function initSession(workoutData) {
  // ── 핵심 엔진 인스턴스 ──
  // PoseEngine: MediaPipe 기반 포즈 추론 + 각도 계산
  // ScoringEngine: 메트릭 기반 실시간 채점
  // RepCounter: 상태 머신 기반 반복/시간 감지
  // SessionBuffer: 세션 데이터 로컬 버퍼링 → 서버 전송
  // exerciseModule: 운동별 JS 모듈 (squat, push_up, plank 등)
  let poseEngine = null;
  let scoringEngine = null;
  let repCounter = null;
  let sessionBuffer = null;
  let exerciseModule = null;

  // ── 세션 상태 객체 ──
  // phase:      PREPARING → WORKING → FINISHED (핵심 라이프사이클)
  // isPaused:   일시정지 여부 (타이머/프레임 루프 일시 정지)
  // pauseRepScoring: 품질 게이트 withold 시 rep 점수 반영 일시 정지
  // routineSetSyncPending: 루틴 세트 완료 API 동기화 진행 중
  const state = {
    phase: "PREPARING",
    sessionId: null,
    selectedView: null,
    currentSet: 1,
    displayedSetCount: 1,
    currentRep: 0,
    currentStepIndex: 0,
    totalTime: 0,
    restTimeLeft: 0,
    liveScore: 0,
    isPaused: false,
    timerInterval: null,
    restInterval: null,
    alertCooldown: false,
    frameLoop: null,
    lastViewInfoAt: 0,
    lastViewInfoText: "",
    repInProgressPrev: false,
    repMetricBuffer: {},
    lastRepMetricSummary: [],
    currentSetWorkSec: 0,
    restAfterAction: null,
    currentTargetSec: 0,
    currentSegmentSec: 0,
    bestHoldSec: 0,
    plankGoalReached: false,
    routineSetSyncPending: false,
    pauseRepScoring: false,
    currentWithholdReason: null,
    learnSteps: [],
    learnStepIndex: 0,
    learnHoldMs: 0,
    learnLastFrameAt: null,
    learnTransitionUntil: 0,
    learnCompleted: false,
    learnLastEvaluation: null,
  };

  // ── DOM 요소 캐싱 ──
  const videoElement = document.getElementById("videoElement"); // 카메라 비디오 소스
  const poseCanvas = document.getElementById("poseCanvas"); // 랜드마크 오버레이 캔버스
  const cameraFrame = document.getElementById("cameraFrame"); // 카메라 프레임 컨테이너
  const cameraOverlay = document.getElementById("cameraOverlay"); // 로딩/에러 오버레이
  const statusBadge = document.getElementById("statusBadge"); // 상태 뱃지 (PREPARING/WORKING 등)
  const liveScoreEl = document.getElementById("liveScore"); // 실시간 점수 표시
  const scoreModeLabelEl = document.getElementById("scoreModeLabel");
  const scoreBreakdownEl = document.getElementById("scoreBreakdown");
  const phaseInfoEl = document.getElementById("phaseInfo");
  const viewInfoEl = document.getElementById("viewInfo");
  const repCountEl = document.getElementById("repCount"); // 횟수/시간 카운터
  const repCountLabelEl = document.getElementById("repCountLabel");
  const setCountEl = document.getElementById("setCount"); // 세트 카운터
  const setCountLabelEl = document.getElementById("setCountLabel");
  const routineProgressEl = document.getElementById("routineProgress");
  const timerValueEl = document.getElementById("timerValue"); // 타이머 값
  const timerLabelEl = document.getElementById("timerLabel"); // 타이머 라벨
  const restTimerEl = document.getElementById("restTimer"); // 휴식 타이머
  const restValueEl = document.getElementById("restValue");
  const alertContainer = document.getElementById("alertContainer");
  const alertTitle = document.getElementById("alertTitle");
  const alertMessage = document.getElementById("alertMessage");
  const startBtn = document.getElementById("startBtn");
  const originalStartBtnText =
    startBtn?.textContent?.trim() ||
    (workoutData.mode === "LEARN" ? "학습 시작" : "운동 시작");
  const pauseBtn = document.getElementById("pauseBtn");
  const finishBtn = document.getElementById("finishBtn");
  const viewSelectRoot = document.getElementById("viewSelect"); // 뷰(FRONT/SIDE) 선택
  const routineStepEl = document.getElementById("routineStep");
  const plankTargetSelectRoot = document.getElementById("plankTargetSelect");
  const plankTargetInput = document.getElementById("plankTargetSeconds"); // 플랭크 목표 시간 입력
  const plankTargetHint = document.getElementById("plankTargetHint");
  const plankTargetReadoutEl = document.getElementById("plankTargetReadout");
  const plankCurrentHoldEl = document.getElementById("plankCurrentHold"); // 현재 유지 시간
  const plankBestHoldEl = document.getElementById("plankBestHold"); // 최고 유지 시간
  const plankPhaseInfoEl = document.getElementById("plankPhaseInfo");
  const plankProgressEl = document.getElementById("plankProgress");
  const plankRuntimePanelEl = document.getElementById("plankRuntimePanel");
  const plankStateLabelEl = document.getElementById("plankStateLabel");
  const plankGoalLabelEl = document.getElementById("plankGoalLabel");
  const plankSegmentLabelEl = document.getElementById("plankSegmentLabel");
  const plankTimerPanelEl = document.getElementById("plankTimerPanel");
  const onboardingModal = document.getElementById("workoutOnboardingModal");
  const onboardingTitleEl = document.getElementById("onboardingSlideTitle");
  const onboardingProgressEl = document.getElementById("onboardingProgress");
  const onboardingImageEl = document.getElementById("onboardingImage");
  const onboardingImagePlaceholderEl = document.getElementById(
    "onboardingImagePlaceholder",
  );
  const onboardingBulletsEl = document.getElementById("onboardingSlideBullets");
  const onboardingPrevBtn = document.getElementById("onboardingPrevBtn");
  const onboardingNextBtn = document.getElementById("onboardingNextBtn");
  const onboardingCloseBtn = document.getElementById("onboardingCloseBtn");
  const learnCardEl = document.getElementById("learnCard");
  const learnStepCounterEl = document.getElementById("learnStepCounter");
  const learnStepTitleEl = document.getElementById("learnStepTitle");
  const learnStepBadgeEl = document.getElementById("learnStepBadge");
  const learnStepInstructionEl = document.getElementById(
    "learnStepInstruction",
  );
  const learnHoldProgressBarEl = document.getElementById(
    "learnHoldProgressBar",
  );
  const learnHoldProgressTextEl = document.getElementById(
    "learnHoldProgressText",
  );
  const learnStepHintsEl = document.getElementById("learnStepHints");
  const learnStepChecksEl = document.getElementById("learnStepChecks");
  const learnStepStatusEl = document.getElementById("learnStepStatus");
  const voiceFeedbackToggle = document.getElementById("voiceFeedbackToggle");
  const voiceFeedbackStatus = document.getElementById("voiceFeedbackStatus");
  const voiceFeedbackHint = document.getElementById("voiceFeedbackHint");
  let routineProgressCountEl = null;
  let routineProgressPercentEl = null;
  let routineCurrentExerciseEl = null;
  let routineTargetSummaryEl = null;
  let routineStepListEl = null;
  const uiRefs = {
    alertContainer,
    alertMessage,
    alertTitle,
    liveScoreEl,
    plankBestHoldEl,
    plankCurrentHoldEl,
    plankGoalLabelEl,
    plankPhaseInfoEl,
    plankProgressEl,
    plankRuntimePanelEl,
    plankSegmentLabelEl,
    plankStateLabelEl,
    plankTargetHint,
    plankTargetInput,
    plankTargetReadoutEl,
    plankTargetSelectRoot,
    plankTimerPanelEl,
    repCountEl,
    repCountLabelEl,
    setCountEl,
    setCountLabelEl,
    routineCurrentExerciseEl,
    routineProgressCountEl,
    routineProgressEl,
    routineProgressPercentEl,
    routineStepEl,
    routineStepListEl,
    routineTargetSummaryEl,
    scoreBreakdownEl,
    scoreModeLabelEl,
    learnCardEl,
    learnStepBadgeEl,
    learnStepChecksEl,
    learnStepCounterEl,
    learnStepHintsEl,
    learnStepInstructionEl,
    learnStepStatusEl,
    learnStepTitleEl,
    learnHoldProgressBarEl,
    learnHoldProgressTextEl,
    startBtn,
    statusBadge,
    timerLabelEl,
    voiceFeedbackHint,
    voiceFeedbackStatus,
    voiceFeedbackToggle,
  };

  // ── 유틸리티 함수들 ──

  /** 뷰 코드 정규화: FRONT, SIDE, DIAGONAL만 허용, 나머지는 null */
  const normalizeViewCode = (value) => {
    const normalized = (value || "").toString().trim().toUpperCase();
    return ["FRONT", "SIDE", "DIAGONAL"].includes(normalized)
      ? normalized
      : null;
  };

  /** 플랭크 운동 여부 확인 — 시간 기반 운동 특수 처리 필요 시 사용 */
  const isPlankExerciseCode = (exerciseCode = workoutData.exercise?.code) =>
    (exerciseCode || "").toString().trim().toLowerCase().replace(/-/g, "_") ===
    "plank";

  /** 초 단위 시간을 MM:SS 형식으로 포맷 */
  const formatClock = (totalSeconds) => {
    const safe = Math.max(0, Math.round(Number(totalSeconds) || 0));
    const mins = Math.floor(safe / 60);
    const secs = safe % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const ui = sessionUiFactory({
    refs: uiRefs,
    createElement: document.createElement.bind(document),
    formatClock,
  });
  const routineManager = routineSessionManagerFactory({
    state,
    fetchImpl: (...args) => fetch(...args),
    startRest,
    finishWorkout,
  });
  const DEFAULT_API_TTS_MODEL = "openai/gpt-4o-mini-tts-2025-12-15";
  const DEFAULT_API_TTS_VOICE = "nova";
  const SUPPORTED_API_TTS_MODELS = new Set([DEFAULT_API_TTS_MODEL]);
  const SUPPORTED_API_TTS_VOICES = new Set([
    "alloy",
    "ash",
    "ballad",
    "coral",
    "echo",
    "fable",
    "nova",
    "onyx",
    "sage",
    "shimmer",
    "verse",
    "marin",
    "cedar",
  ]);

  function readTtsConfig() {
    try {
      return (
        JSON.parse(
          (typeof window !== "undefined"
            ? window.localStorage
            : null
          )?.getItem?.("fitplus_tts_config"),
        ) || { provider: "browser" }
      );
    } catch {
      return { provider: "browser" };
    }
  }

  function createTtsProvider(config) {
    if (
      config.provider === "openrouter" &&
      typeof createApiSpeechProvider === "function"
    ) {
      const selectedModel = SUPPORTED_API_TTS_MODELS.has(config.model)
        ? config.model
        : DEFAULT_API_TTS_MODEL;
      const selectedVoice =
        selectedModel === config.model &&
        SUPPORTED_API_TTS_VOICES.has(config.voice)
          ? config.voice
          : DEFAULT_API_TTS_VOICE;
      return createApiSpeechProvider({
        endpoint: "/api/tts",
        model: selectedModel,
        voice: selectedVoice,
      });
    }
    return createBrowserSpeechProvider();
  }

  const ttsConfig = readTtsConfig();
  const ttsProvider =
    typeof createApiSpeechProvider !== "undefined"
      ? createTtsProvider(ttsConfig)
      : createBrowserSpeechProvider();

  const voice =
    typeof sessionVoiceFactory === "function"
      ? sessionVoiceFactory({
          provider: ttsProvider,
          enabled: true,
          storage: typeof window !== "undefined" ? window.localStorage : null,
        })
      : null;
  const isLearnMode = () => workoutData.mode === "LEARN";
  const isTimeBasedExercise = () => Boolean(repCounter?.pattern?.isTimeBased);

  function getFeedbackTimestamp() {
    return sessionBuffer?.startTime ? Date.now() - sessionBuffer.startTime : 0;
  }

  function buildDeliveryResult(visual, voiceResult) {
    return {
      visual: visual === true,
      voice: voiceResult?.spoken === true,
    };
  }

  function createFeedbackEvent({
    type,
    message,
    metric = null,
    repRecord = null,
    severity = "info",
    source = "session",
    withholdReason = null,
  }) {
    const normalizedMessage = (message || "").toString().trim();
    // SessionBuffer.recordEvent / 분석 파이프라인이 기대하는 공통 이벤트 셰이프
    const event = {
      type,
      timestamp: getFeedbackTimestamp(),
      message: normalizedMessage,
      exercise_code: getCurrentExerciseCode(),
      severity,
      source,
      selected_view: state.selectedView,
    };

    if (metric) {
      // 어떤 메트릭이 문제인지 식별 + 점수 스냅샷
      event.metric_key = metric.key || metric.metric_key || null;
      event.metric_name = metric.title || metric.metric_name || null;
      event.score = Number.isFinite(Number(metric.score))
        ? Number(metric.score)
        : null;
      event.max_score = Number.isFinite(Number(metric.maxScore))
        ? Number(metric.maxScore)
        : 100;
      event.normalized_score = Number.isFinite(Number(metric.normalizedScore))
        ? Number(metric.normalizedScore)
        : getNormalizedMetricScore(metric);
    }

    if (repRecord) {
      event.rep_number = repRecord.repNumber || repRecord.rep_number || null;
      event.score = Number.isFinite(Number(repRecord.score))
        ? Number(repRecord.score)
        : event.score;
    }

    if (state.currentSet) {
      event.set_number = state.currentSet;
    }

    if (withholdReason) {
      event.withhold_reason = withholdReason;
    }

    return event;
  }

  function shouldSpeakFeedbackEvent(event) {
    if (!event?.message) return false;
    if (event.type === "LOW_SCORE_HINT") return true;
    return false;
  }

  function deliverFeedbackEvent(event, options = {}) {
    if (!event?.message) return;

    const visual = options.visual !== false;
    if (visual) {
      if (options.alertTitle) {
        // 모달 — 게이트 보류 등 즉시 눈에 띄어야 할 때
        showAlert(options.alertTitle, event.message);
      } else if (options.toast) {
        ui.showToast(event.message);
      }
    }

    // 음성은 스팸 방지 정책: 현재는 저점 힌트만 TTS 후보
    const voiceResult = shouldSpeakFeedbackEvent(event)
      ? voice?.speak(event.message, event)
      : { spoken: false, reason: "policy" };

    const eventWithDelivery = {
      ...event,
      delivery: buildDeliveryResult(visual, voiceResult),
    };

    // 세션 종료 후 "무슨 피드백이 나갔는지" 재현·분석 가능하도록 저장
    if (sessionBuffer?.recordEvent) {
      sessionBuffer.recordEvent(eventWithDelivery);
    } else if (sessionBuffer?.addEvent) {
      sessionBuffer.addEvent(eventWithDelivery.type, eventWithDelivery);
    }
  }

  /** 플랭크 목표 시간을 UI 입력에서 읽기 (최소 10초) */
  const readTargetSecFromInput = () => {
    const parsed = Number(plankTargetInput?.value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(10, Math.round(parsed));
  };

  /** 현재 목표 시간(초) 반환 — 루틴 모드면 단계의 target_value, 자유 모드면 state.currentTargetSec */
  const getCurrentTargetSec = () => {
    if (workoutData.mode === "ROUTINE" && workoutData.routine) {
      const step = getCurrentRoutineStep();
      if (normalizeRoutineTargetType(step?.target_type) === "TIME") {
        return Math.max(1, Number(step?.target_value) || 1);
      }
    }

    return Math.max(0, Number(state.currentTargetSec) || 0);
  };

  /** 운동 시작 가능 여부 — 플랭크는 목표 시간이 설정되어야 시작 가능 */
  const canStartCurrentExercise = () => {
    if (isLearnMode()) return true;
    if (!isPlankExerciseCode()) return true;
    if (workoutData.mode === "ROUTINE") return getCurrentTargetSec() > 0;
    return getCurrentTargetSec() >= 10;
  };

  const getPrimaryTimerLabel = () => {
    if (isLearnMode()) return "\uD559\uC2B5 \uC2DC\uAC04";
    return isPlankExerciseCode()
      ? "\uD50C\uB7AD\uD06C \uC2DC\uAC04"
      : "\uC6B4\uB3D9 \uC2DC\uAC04";
  };

  /** 운동별 허용 뷰(FRONT/SIDE/DIAGONAL) 목록 반환 */
  function getAllowedViews(exercise = workoutData.exercise) {
    const allowed = Array.isArray(exercise?.allowed_views)
      ? exercise.allowed_views
      : [];
    const normalized = allowed
      .map((code) => normalizeViewCode(code))
      .filter(Boolean);
    return normalized.length > 0 ? normalized : ["FRONT"];
  }

  /** 운동의 기본 뷰 결정 — DB 설정优先, 없으면 허용 뷰 중 첫 번째 */
  function resolveDefaultView(exercise = workoutData.exercise) {
    const allowed = getAllowedViews(exercise);
    const defaultView = normalizeViewCode(exercise?.default_view);
    if (defaultView && allowed.includes(defaultView)) return defaultView;
    return allowed[0] || "FRONT";
  }

  /** 루틴 목표 타입 정규화 — DURATION → TIME, 나머지는 REPS/TIME 유지 */
  function normalizeRoutineTargetType(value) {
    const normalized = (value || "").toString().trim().toUpperCase();
    if (normalized === "DURATION") return "TIME";
    return normalized === "TIME" ? "TIME" : "REPS";
  }

  /** 루틴 현재 단계(routine_setup) 반환 */
  function getCurrentRoutineStep() {
    return workoutData.routine?.routine_setup?.[state.currentStepIndex] || null;
  }

  /** 루틴 전체 단계 목록 반환 */
  function getRoutineSteps() {
    return Array.isArray(workoutData.routine?.routine_setup)
      ? workoutData.routine.routine_setup
      : [];
  }

  /** 루틴 단계의 목표 요약 텍스트 생성 (예: "목표 10회 x 3세트") */
  function getRoutineTargetSummary(step = {}) {
    const targetType = normalizeRoutineTargetType(step.target_type);
    const targetValue = Math.max(1, Number(step.target_value) || 1);
    const unit = targetType === "TIME" ? "\uCD08" : "\uD68C";
    const sets = Math.max(1, Number(step.sets) || 1);

    return {
      targetType,
      targetValue,
      unit,
      sets,
      text: `\uBAA9\uD45C ${targetValue}${unit} x ${sets}\uC138\uD2B8`,
    };
  }

  /** 루틴 프로그레스 UI 최초 구성 — 단계 칩 카드를 DOM에 동적 생성 */
  function setupRoutineProgressUi() {
    if (!routineProgressEl || !routineStepEl) return;

    ui.setupRoutineProgressUi({
      steps: getRoutineSteps().map((step, index) => ({
        exerciseName:
          step?.exercise?.name || `${index + 1}\uBC88\uC9F8 \uC6B4\uB3D9`,
        targetSummary: getRoutineTargetSummary(step).text,
      })),
    });

    routineCurrentExerciseEl = uiRefs.routineCurrentExerciseEl;
    routineProgressCountEl = uiRefs.routineProgressCountEl;
    routineProgressPercentEl = uiRefs.routineProgressPercentEl;
    routineStepListEl = uiRefs.routineStepListEl;
    routineTargetSummaryEl = uiRefs.routineTargetSummaryEl;
  }

  /** 루틴 현재 단계가 시간 기반 목표인지 확인 */
  function isRoutineTimeTarget() {
    if (workoutData.mode !== "ROUTINE" || !workoutData.routine) return false;
    const step = getCurrentRoutineStep();
    return normalizeRoutineTargetType(step?.target_type) === "TIME";
  }

  /** 메인 카운터 UI 업데이트 — 시간 기반이면 초, 횟수 기반이면 rep 수 표시 */
  function updatePrimaryCounterDisplay() {
    if (isLearnMode()) {
      ui.updateLearnCounterDisplay({
        currentStep: Math.min(
          state.learnStepIndex + 1,
          Math.max(1, state.learnSteps.length),
        ),
        totalSteps: Math.max(1, state.learnSteps.length),
      });
      return;
    }

    ui.updatePrimaryCounterDisplay({
      isRoutineTimeTarget: isRoutineTimeTarget(),
      isTimeBased: isTimeBasedExercise(),
      currentRep: state.currentRep,
      currentSegmentSec: state.currentSegmentSec,
      currentSetWorkSec: state.currentSetWorkSec,
    });
  }

  function syncDisplayedSetCount() {
    if (!setCountEl || isLearnMode()) return;
    const nextCount =
      workoutData.mode === "FREE" ? state.displayedSetCount : state.currentSet;
    setCountEl.textContent = String(
      Math.max(1, Math.round(Number(nextCount) || 1)),
    );
  }

  /** 루틴 단계 프로그레스 표시 업데이트 — 현재 단계/전체, 완료 칩 하이라이트 */
  function updateRoutineStepDisplay() {
    if (
      !routineStepEl ||
      workoutData.mode !== "ROUTINE" ||
      !workoutData.routine
    )
      return;

    setupRoutineProgressUi();

    const steps = getRoutineSteps();
    if (steps.length === 0) return;

    const progressState = routineManager.resolveRoutineProgressState({
      bestHoldSec: state.bestHoldSec,
      currentRep: state.currentRep,
      currentSet: state.currentSet,
      currentSetWorkSec: state.currentSetWorkSec,
      currentStepIndex: state.currentStepIndex,
      isTimeBasedExercise: isTimeBasedExercise(),
      normalizeTargetType: normalizeRoutineTargetType,
      routineSetup: steps,
    });
    const stepIndex = progressState.stepIndex;
    const step = steps[stepIndex] || {};
    const targetSummary = getRoutineTargetSummary(step);

    ui.updateRoutineStepDisplay({
      currentExerciseName:
        step?.exercise?.name || `${stepIndex + 1}\uBC88\uC9F8 \uC6B4\uB3D9`,
      progressPercent: progressState.progressPercent,
      stepIndex,
      targetSummary: targetSummary.text,
      totalSteps: steps.length,
    });
  }

  /**
   * 플랭크 목표 시간 UI 동기화
   * - 루틴 모드: 자동 적용 (버튼/입력 비활성화)
   * - 자유 모드: 수동 선택 (PREPARING 상태에서만)
   */
  function syncPlankTargetUi() {
    const targetSec = getCurrentTargetSec();
    const isPlank = isPlankExerciseCode();
    const isRoutinePlank = isPlank && workoutData.mode === "ROUTINE";
    const showFreeTargetUi =
      isPlank && workoutData.mode === "FREE" && state.phase === "PREPARING";

    ui.syncPlankTargetUi({
      canStart: canStartCurrentExercise(),
      isPlank,
      isRoutinePlank,
      phase: state.phase,
      showFreeTargetUi,
      targetSec,
    });
  }

  /**
   * 목표 시간(초) 적용 — state 및 RepCounter에 반영 후 UI 갱신
   * - state.currentTargetSec: 세션 목표 시간 저장
   * - repCounter.setTargetSec(): RepCounter에 목표 시간 전달
   * - syncPlankTargetUi(): UI 동기화
   * - updatePlankRuntimeDisplay(): 플랭크 런타임 표시 갱신
   */
  function applyTargetSec(nextTargetSec) {
    const parsed = Number(nextTargetSec);
    state.currentTargetSec =
      Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
    if (repCounter?.setTargetSec) {
      repCounter.setTargetSec(state.currentTargetSec);
    }
    syncPlankTargetUi();
    updatePlankRuntimeDisplay(
      repCounter?.getTimeSummary ? repCounter.getTimeSummary() : null,
    );
    if (startBtn && !startBtn.hidden) {
      startBtn.disabled = !canStartCurrentExercise();
    }
  }

  /**
   * 플랭크 목표 시간 선택 버튼/입력 이벤트 바인딩
   * - 프리셋 버튼(30/60/90/120초) 클릭 → applyTargetSec()
   * - 직접 입력 → applyTargetSec()
   */
  function setupPlankTargetControls() {
    if (!plankTargetSelectRoot) return;

    plankTargetSelectRoot
      .querySelectorAll("[data-plank-target-sec]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          if (workoutData.mode === "ROUTINE") return;
          const targetSec = Number(
            button.getAttribute("data-plank-target-sec"),
          );
          applyTargetSec(targetSec);
        });
      });

    if (plankTargetInput) {
      plankTargetInput.addEventListener("change", () => {
        if (workoutData.mode === "ROUTINE") return;
        applyTargetSec(readTargetSecFromInput());
      });
      plankTargetInput.addEventListener("input", () => {
        if (workoutData.mode === "ROUTINE") return;
        const nextValue = Number(plankTargetInput.value);
        if (!Number.isFinite(nextValue) || nextValue < 10) return;
        applyTargetSec(nextValue);
      });
    }
  }

  /**
   * 플랭크 실시간 표시 업데이트 — 현재 유지 시간, 최고 시간, 진행률, phase 라벨
   * summary: RepCounter.getTimeSummary() 결과
   *   - currentHoldSec: 현재 유지 시간
   *   - bestHoldSec: 최고 유지 시간
   *   - currentHoldScore: 현재 자세 점수
   *   - currentPhase: SETUP/HOLD/BREAK
   */
  function updatePlankRuntimeDisplay(summary = null) {
    const isPlank = isPlankExerciseCode();
    const phase = summary?.currentPhase || window.TIME_PHASES?.SETUP || "SETUP";
    const currentSegmentSec = Math.max(
      0,
      Math.floor((summary?.currentSegmentMs || 0) / 1000),
    );
    const bestHoldSec = Math.max(0, Math.floor(summary?.bestHoldSec || 0));
    const targetSec = getCurrentTargetSec();
    const progressRatio =
      targetSec > 0 ? Math.min(1, bestHoldSec / targetSec) : 0;

    state.currentSegmentSec = currentSegmentSec;
    state.bestHoldSec = bestHoldSec;
    state.plankGoalReached = targetSec > 0 && bestHoldSec >= targetSec;

    ui.updatePlankRuntimeDisplay({
      bestHoldSec,
      currentSegmentSec,
      goalReached: state.plankGoalReached,
      isPlank,
      phase,
      progressPercent: Math.round(progressRatio * 100),
      targetSec,
    });
    updateRoutineStepDisplay();
  }

  let isEndingSession = false;
  let pendingSessionPayload = null;
  let hasUnloadAbortSent = false;
  let aiEnginesInitialized = false;
  let aiReady = false;
  let warmUpGeneration = 0;
  let aiInitPromise = null;
  let selectedCameraSource = window.SESSION_CAMERA_DEFAULT_SOURCE || "webcam";
  const sessionCamera = new SessionCamera(videoElement, poseCanvas);
  let wakeLock = null;

  /**
   * 카메라 프리뷰 방향(미러링 등) 적용
   * - webcam: 미러링 (사용자가 거울처럼 보도록)
   * - mobile_front: 미러링
   * - mobile_rear: 미러링 없음
   * - 기타 소스: 미러링 없음
   */
  function applyPreviewOrientation(sourceType) {
    if (!cameraFrame) return;
    cameraFrame.setAttribute(
      "data-preview-mirrored",
      shouldMirrorPreviewSource(sourceType) ? "true" : "false",
    );
  }

  /** 화면 꺼짐 방지 Wake Lock 요청 (운동 중 화면 유지) */
  async function requestWakeLock() {
    try {
      if ("wakeLock" in navigator) {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => {
          console.log("[Wake Lock] Screen Wake Lock released");
        });
        console.log("[Wake Lock] Screen Wake Lock acquired");
      }
    } catch (err) {
      console.error(`[Wake Lock] Error: ${err.name}, ${err.message}`);
    }
  }

  /** Wake Lock 해제 — 운동 종료/일시정지 시 호출 */
  async function releaseWakeLock() {
    if (wakeLock !== null) {
      await wakeLock.release().catch(() => {});
      wakeLock = null;
    }
  }

  document.addEventListener("visibilitychange", async () => {
    if (
      document.visibilityState === "visible" &&
      (state.phase === "WORKING" || state.phase === "RESTING")
    ) {
      await requestWakeLock();
    }
  });

  const cameraReadyHtml =
    '<p>준비 완료</p><p class="muted">전신이 잘 보이도록 위치를 조정하세요</p>';

  // ── 품질 게이트 추적 상태 ──
  // noPersonCount: 카메라에서 사람 미감지 프레임 누적
  // NO_PERSON_THRESHOLD: 이 프레임 수 이상 미감지 시 경고
  // qualityGateTracker: 점수 산출 보류(withhold) 여부와 안정 프레임 수 추적
  let noPersonCount = 0;
  const NO_PERSON_THRESHOLD = 30;
  let qualityGateTracker = createGateTracker();
  state.selectedView =
    normalizeViewCode(workoutData.selectedView) || resolveDefaultView();
  state.currentTargetSec = Math.max(0, Number(workoutData.plankTargetSec) || 0);

  /** 현재 운동 코드 반환 (정규화: 대소문자, 하이픈→언더스코어) */
  function getCurrentExerciseCode() {
    return ((workoutData.exercise && workoutData.exercise.code) || "")
      .toString()
      .trim()
      .toLowerCase()
      .replace(/-/g, "_");
  }

  function resolveExerciseModule(exerciseCode = workoutData.exercise?.code) {
    return window.WorkoutExerciseRegistry?.get(exerciseCode) || null;
  }

  function getCurrentLearnStep() {
    return state.learnSteps[state.learnStepIndex] || null;
  }

  function refreshLearnSteps({ resetProgress = false } = {}) {
    if (!isLearnMode()) return;

    exerciseModule = resolveExerciseModule();
    const nextSteps = exerciseModule?.getLearnSteps?.({
      selectedView: state.selectedView,
      exercise: workoutData.exercise,
    });

    state.learnSteps = Array.isArray(nextSteps) ? nextSteps : [];

    if (resetProgress) {
      state.learnStepIndex = 0;
      state.learnHoldMs = 0;
      state.learnLastFrameAt = null;
      state.learnTransitionUntil = 0;
      state.learnCompleted = false;
      state.learnLastEvaluation = null;
    } else if (state.learnStepIndex >= state.learnSteps.length) {
      state.learnStepIndex = Math.max(0, state.learnSteps.length - 1);
    }
  }

  function getLearnStatusText(
    step,
    evaluation,
    holdProgressPercent,
    gateMessage = null,
  ) {
    if (gateMessage) return gateMessage;
    if (state.learnCompleted)
      return "모든 step을 완료했습니다. 결과를 저장 중입니다.";
    if (!step) return "학습 step 정보를 준비 중입니다.";
    if (evaluation?.passed === true) {
      return holdProgressPercent >= 100
        ? step.successMessage || "좋아요! 다음 step으로 넘어갑니다."
        : `좋아요. ${Math.max(0, 100 - Math.round(holdProgressPercent))}%만 더 유지해주세요.`;
    }
    return (
      evaluation?.status ||
      evaluation?.feedback ||
      step.instruction ||
      "현재 step 자세를 잡아주세요."
    );
  }

  function updateLearnModeDisplay({
    evaluation = null,
    holdProgressPercent = 0,
    gateMessage = null,
  } = {}) {
    if (!isLearnMode()) return;

    const totalSteps = Math.max(1, state.learnSteps.length);
    const safeStepIndex = Math.min(state.learnStepIndex, totalSteps - 1);
    const step = getCurrentLearnStep();

    if (state.learnCompleted || !step) {
      ui.updateLearnCard({
        visible: true,
        stepIndex: totalSteps - 1,
        totalSteps,
        title: `${workoutData.exercise?.name || "운동"} 학습 완료`,
        badge: "완료",
        instruction: "모든 step을 통과했습니다. 지금 결과를 저장하고 있습니다.",
        hints: [
          "잠시 후 결과 화면으로 이동합니다.",
          "다음에는 바로 자율 운동으로 이어가 보세요.",
        ],
        checks: [],
        holdProgressPercent: 100,
        statusText: "학습이 완료되었습니다.",
      });
      updatePrimaryCounterDisplay();
      return;
    }

    ui.updateLearnCard({
      visible: true,
      stepIndex: safeStepIndex,
      totalSteps,
      title: step.title || `${workoutData.exercise?.name || "운동"} step`,
      badge: step.badge || "자세 맞추기",
      instruction: step.instruction || "현재 step 자세를 준비하세요.",
      hints: Array.isArray(step.hintLines) ? step.hintLines : [],
      checks: evaluation?.checks || [],
      holdProgressPercent,
      statusText: getLearnStatusText(
        step,
        evaluation,
        holdProgressPercent,
        gateMessage,
      ),
    });
    updatePrimaryCounterDisplay();
  }

  /** ScoringEngine/RepCounter를 현재 운동에 바인딩 — 운동 변경 시(루틴 단계 전환) 재호출 */
  function bindEnginesToCurrentExercise() {
    if (!workoutData.exercise) {
      return false;
    }

    // DB 프로필(+선택 뷰)로 실시간 채점기 구성; 프로필 비어 있으면 운동 모듈 기본 메트릭 사용
    scoringEngine = new ScoringEngine(workoutData.scoringProfile || null, {
      exerciseCode: workoutData.exercise.code,
      selectedView: state.selectedView,
    });
    // squat-exercise.js 등: 페이즈·scoreRep·라이브 피드백 필터
    exerciseModule = resolveExerciseModule(workoutData.exercise.code);

    repCounter = new RepCounter(workoutData.exercise.code);
    // rep 하나 끝날 때 운동 모듈/프로필 기반으로 최종 점수·breakdown 보강
    repCounter.repEvaluator = (repRecord) => scoringEngine.scoreRep(repRecord);
    repCounter.onRepComplete = handleRepComplete;
    if (repCounter?.pattern?.isTimeBased && repCounter?.setTargetSec) {
      repCounter.setTargetSec(getCurrentTargetSec());
    }
    if (isLearnMode()) {
      refreshLearnSteps({ resetProgress: state.phase === "PREPARING" });
    }
    return true;
  }

  /** 현재 운동 런타임 컨텍스트 반환 — 운동 모듈에서 접근용 */
  function getExerciseRuntime(extra = {}) {
    return {
      exerciseCode: getCurrentExerciseCode(),
      exerciseModule,
      repCounter,
      scoringEngine,
      selectedView: state.selectedView,
      state,
      ...extra,
    };
  }

  // REMOVED: getFrameGateResult — gate authority belongs exclusively to scoring-engine.js
  // The common quality gate (evaluateQualityGate) is the sole pass/withhold decision-maker.
  // Exercise modules must not emit gating decisions (spec §3.1, §3.2).

  /**
   * AI 엔진 초기화 — 세션 시작 전 최초 1회 호출
   * 1. PoseEngine 생성 + MediaPipe 초기화
   * 2. bindEnginesToCurrentExercise()로 ScoringEngine/RepCounter 바인딩
   * 3. onPoseDetected / onNoPerson 콜백 연결
   */
  async function initAIEngines() {
    try {
      poseEngine = new PoseEngine();
      // MediaPipe Wasm/모델 로드 — 완료 전에는 send() 불가
      await poseEngine.initialize();

      if (!bindEnginesToCurrentExercise()) {
        throw new Error("운동 정보를 불러오지 못했습니다.");
      }

      // 포즈 추론이 끝날 때마다 브라우저 → 이 콜백 순으로 흐름이 이어짐
      poseEngine.onPoseDetected = handlePoseDetected;
      poseEngine.onNoPerson = handleNoPerson;

      console.log("[Session] AI 엔진 초기화 완료");
      return true;
    } catch (error) {
      console.error("[Session] AI 엔진 초기화 실패:", error);
      return false;
    }
  }

  /**
   * 카메라 스트림 연결
   * sourceType: 'webcam' | 'screen' | 'mobile_front' | 'mobile_rear'
   * 스트림 획득 → 비디오 요소에 바인딩 → 세션 시작 버튼 활성화
   */
  async function connectCameraSource(sourceType) {
    // 미러링·가로세로 등 프리뷰 방향만 먼저 맞춤(스트림과 독립)
    applyPreviewOrientation(sourceType);
    cameraOverlay.innerHTML = `
      <div class="camera-loading-overlay" aria-live="polite">
        <div class="camera-loading-spinner" aria-hidden="true"></div>
        <p class="camera-loading-title">카메라를 연결 중...</p>
        <p class="camera-loading-subtitle">브라우저 권한과 입력 소스를 확인하고 있습니다.</p>
      </div>
    `;
    cameraOverlay.hidden = false;
    startBtn.disabled = true;
    startBtn.textContent = "카메라 연결 중...";
    aiReady = false;

    try {
      sessionCamera.destroy();
      // session-camera.js: 제약 완화 단계를 거쳐 MediaStream 획득
      const stream = await sessionCamera.getStream(sourceType);
      sessionCamera.applyStream(stream);

      // 비디오 첫 프레임이 decoded(HAVE_CURRENT_DATA)될 때까지 대기 — 이후 poseEngine이 픽셀 읽기 가능
      await new Promise((resolve) => {
        if (videoElement.readyState >= 2) resolve();
        else
          videoElement.addEventListener("loadeddata", resolve, { once: true });
      });

      cameraOverlay.hidden = false;
      cameraOverlay.innerHTML = cameraReadyHtml;
      startBtn.disabled = !canStartCurrentExercise();
      startBtn.textContent = originalStartBtnText;
    } catch (error) {
      console.error("[Session] 카메라 에러:", error);

      let userMessage = "권한을 확인하거나 다른 입력 소스를 선택해 주세요";
      if (
        error.name === "NotFoundError" ||
        error.name === "DevicesNotFoundError"
      ) {
        userMessage =
          "카메라가 감지되지 않았습니다. 다른 입력 소스를 선택해 주세요";
      } else if (
        error.name === "NotAllowedError" ||
        error.name === "PermissionDeniedError"
      ) {
        userMessage =
          "카메라 권한이 거부되었습니다. 브라우저 설정에서 허용해 주세요";
      } else if (
        error.name === "NotReadableError" ||
        error.name === "TrackStartError"
      ) {
        userMessage =
          "카메라를 열 수 없습니다. 다른 프로그램이 카메라를 사용 중이거나 드라이버 문제일 수 있습니다";
      } else if (error.name === "AbortError") {
        userMessage = "사용자가 취소했습니다. 입력 소스를 다시 선택해 주세요";
      }

      cameraOverlay.innerHTML = `<p>미디어 연결 실패</p><p class="muted">${userMessage}</p>`;
      startBtn.disabled = true;
    }
  }

  async function prepareAI(generation) {
    if (!aiEnginesInitialized) {
      if (!aiInitPromise) {
        aiInitPromise = initAIEngines();
      }
      const ok = await aiInitPromise;
      aiInitPromise = null;
      // 사용자가 빠르게 소스/뷰를 바꿔 warmUpGeneration이 증가하면 이전 초기화 결과는 폐기
      if (generation !== warmUpGeneration) return false;
      if (!ok) {
        cameraOverlay.hidden = false;
        cameraOverlay.innerHTML =
          '<p>AI 엔진 로딩 실패</p><p class="muted">페이지를 새로고침해주세요</p>';
        startBtn.textContent = originalStartBtnText;
        return false;
      }
      aiEnginesInitialized = true;
    }

    if (generation !== warmUpGeneration) return false;

    aiReady = true;
    // 플랭크는 목표 시간 미설정이면 시작 버튼은 여전히 비활성
    startBtn.disabled = !canStartCurrentExercise();
    startBtn.textContent = originalStartBtnText;
    return true;
  }

  /**
   * 카메라 소스 선택 버튼 이벤트 바인딩
   * 선택 시 connectCameraSource() 호출 → 스트림 연결
   */
  function setupSourceSelectors() {
    const root = document.getElementById("sourceSelect");
    if (!root) return;

    root.querySelectorAll("[data-source]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (state.phase !== "PREPARING") return;
        const next = btn.getAttribute("data-source");
        if (!next || next === selectedCameraSource) return;
        selectedCameraSource = next;
        root.querySelectorAll("[data-source]").forEach((b) => {
          b.classList.toggle(
            "active",
            b.getAttribute("data-source") === selectedCameraSource,
          );
        });
        await connectCameraSource(selectedCameraSource);
      });
    });

    root.querySelectorAll("[data-source]").forEach((b) => {
      b.classList.toggle(
        "active",
        b.getAttribute("data-source") === selectedCameraSource,
      );
    });
  }

  /**
   * 선택된 뷰(FRONT/SIDE/DIAGONAL) 적용 — ScoringEngine에도 반영
   * - scoringEngine.setSelectedView(): 채점 엔진에 뷰 정보 전달
   * - state.selectedView: 세션 상태에 저장
   */
  function applySelectedView(nextView) {
    const normalized = normalizeViewCode(nextView);
    const allowed = getAllowedViews();
    const fallback = resolveDefaultView();
    state.selectedView =
      normalized && allowed.includes(normalized) ? normalized : fallback;

    if (!viewSelectRoot) return;

    viewSelectRoot.querySelectorAll("[data-view]").forEach((btn) => {
      btn.classList.toggle(
        "active",
        btn.getAttribute("data-view") === state.selectedView,
      );
    });

    if (isLearnMode() && state.phase === "PREPARING") {
      refreshLearnSteps({ resetProgress: true });
      updateLearnModeDisplay();
      updatePrimaryCounterDisplay();
    }
  }

  /**
   * 뷰 선택 버튼(FRONT/SIDE/DIAGONAL) 이벤트 바인딩
   * 선택 시 applySelectedView() → ScoringEngine에 반영
   */
  function setupViewSelectors() {
    if (!viewSelectRoot) return;
    applySelectedView(state.selectedView);

    viewSelectRoot.querySelectorAll("[data-view]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (state.phase !== "PREPARING") return;
        const next = btn.getAttribute("data-view");
        if (!next) return;
        applySelectedView(next);
        if (scoringEngine?.setSelectedView) {
          scoringEngine.setSelectedView(state.selectedView);
        }
      });
    });
  }

  /**
   * 세션 버퍼 초기화 — 새 세션 시작 또는 루틴 단계 전환 시 호출
   * SessionBuffer 인스턴스를 새로 생성하고 localStorage 백업 키 설정
   */
  function resetSessionBufferForSession(nextSessionId, options = {}) {
    const normalizedSessionId = Number(nextSessionId);
    if (!Number.isFinite(normalizedSessionId) || normalizedSessionId <= 0) {
      return;
    }

    const nextSelectedView = normalizeViewCode(options.selectedView);
    if (nextSelectedView) {
      state.selectedView = nextSelectedView;
    }

    const exerciseCode =
      options.exerciseCode || workoutData.exercise?.code || "unknown";

    if (sessionBuffer) {
      sessionBuffer.clearStorage();
    }

    state.sessionId = normalizedSessionId;
    pendingSessionPayload = null;
    hasUnloadAbortSent = false;

    sessionBuffer = new SessionBuffer(state.sessionId, {
      exerciseCode,
      mode: workoutData.mode,
      selectedView: state.selectedView,
      resultBasis: repCounter?.pattern?.isTimeBased ? "DURATION" : "REPS",
      targetSec: Number.isFinite(Number(options.targetSec))
        ? Number(options.targetSec)
        : getCurrentTargetSec() || null,
    });

    sessionBuffer.addEvent("SESSION_START", {
      exercise: exerciseCode,
      selected_view: state.selectedView,
      source: options.source || "SESSION_RESET",
    });
  }

  /**
   * 운동 세션 시작 — 프리/루틴 공통 진입점
   * 1. 서버에 POST /api/workout/session — 세션 생성 (sessionId 획득)
   * 2. SessionBuffer 초기화 (localStorage 백업 키 설정)
   * 3. 포즈 감지 루프(startPoseDetection) 시작
   * 4. 타이머 시작, Wake Lock 획득
   * 5. 루틴 모드면 첫 단계 UI 표시
   */
  function showModelLoadingOverlay() {
    state.phase = "PREPARING";
    ui.updateStatus("preparing", "모델 로딩 중");
    cameraOverlay.hidden = false;
    cameraOverlay.innerHTML = `
      <div class="camera-loading-overlay" aria-live="polite">
        <div class="camera-loading-spinner" aria-hidden="true"></div>
        <p class="camera-loading-title">모델 로딩 중...</p>
        <p class="camera-loading-subtitle">잠시 후 카운트다운이 시작됩니다.</p>
      </div>
    `;
  }

  async function runStartCountdown() {
    state.phase = "COUNTDOWN";
    ui.updateStatus("preparing", "시작 준비");

    const steps = [
      { num: "5", hint: "카메라 위치를 확인하세요" },
      { num: "4", hint: "전신이 화면에 들어오게 서세요" },
      { num: "3", hint: "좋은 자세를 준비하세요" },
      { num: "2", hint: "호흡을 가다듬으세요" },
      { num: "1", hint: "곧 시작합니다" },
    ];

    cameraOverlay.hidden = false;
    cameraOverlay.innerHTML = `
      <div class="start-countdown-overlay" aria-live="polite">
        <span class="start-countdown-number" id="countdownNumber"></span>
        <p class="start-countdown-hint" id="countdownHint"></p>
      </div>
    `;

    const numEl = document.getElementById("countdownNumber");
    const hintEl = document.getElementById("countdownHint");

    for (const step of steps) {
      if (numEl) numEl.textContent = step.num;
      if (hintEl) hintEl.textContent = step.hint;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    cameraOverlay.hidden = true;
    cameraOverlay.innerHTML = "";
  }

  async function startWorkout() {
    // 실패·조기 return 시 UI를 원래대로 되돌리기 위한 스냅샷
    const prevOverlayHtml = cameraOverlay.innerHTML;
    const prevOverlayHidden = cameraOverlay.hidden;
    const prevStartHidden = startBtn.hidden;
    const prevStartDisabled = startBtn.disabled;
    const prevStartText = startBtn.textContent;

    cameraOverlay.hidden = true;
    startBtn.hidden = true;
    startBtn.disabled = true;

    if (!state.selectedView) {
      state.selectedView = resolveDefaultView();
    }

    if (!canStartCurrentExercise()) {
      alert("목표 시간을 먼저 설정해주세요.");
      cameraOverlay.hidden = prevOverlayHidden;
      cameraOverlay.innerHTML = prevOverlayHtml || cameraReadyHtml;
      startBtn.hidden = prevStartHidden;
      startBtn.disabled = prevStartDisabled;
      startBtn.textContent = prevStartText;
      return;
    }

    const sourceSelectEl = document.getElementById("sourceSelect");
    const setupPanelContainer = document.getElementById("setupPanelContainer");
    const prevSourceSelectHidden = sourceSelectEl?.hidden || false;
    const prevViewSelectHidden = viewSelectRoot?.hidden || false;
    const prevPlankTargetHidden = plankTargetSelectRoot?.hidden || false;
    const hadSetupPanelHiddenClass =
      setupPanelContainer?.classList.contains("hidden-during-workout") || false;

    try {
      showModelLoadingOverlay();
      warmUpGeneration++;
      // aiReady면 스킵; 아니면 initAIEngines(단 한 번) — generation으로 경쟁 취소 처리
      const aiPrepared = aiReady || (await prepareAI(warmUpGeneration));
      if (!aiPrepared) {
        throw new Error("AI 모델 로딩에 실패했습니다.");
      }

      // DB에 workout_session 행 생성 + session_id 발급
      const response = await fetch("/api/workout/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exercise_id: workoutData.exercise.exercise_id,
          selected_view: state.selectedView,
          mode: workoutData.mode,
          routine_id: workoutData.routine?.routine_id || null,
          target_sec: getCurrentTargetSec() || null,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          data.error || data.message || "세션 시작에 실패했습니다.",
        );
      }

      state.sessionId = data.session.session_id;
      state.selectedView =
        normalizeViewCode(data.session.selected_view) || state.selectedView;
      hasUnloadAbortSent = false;
      pendingSessionPayload = null;
      if (data.routineInstance) {
        workoutData.routineInstance = data.routineInstance;
      }
      if (isLearnMode()) {
        refreshLearnSteps({ resetProgress: true });
        updateLearnModeDisplay();
      }
      syncPlankTargetUi();
      updatePrimaryCounterDisplay();
      updateRoutineStepDisplay();
      updatePlankRuntimeDisplay(
        repCounter?.getTimeSummary ? repCounter.getTimeSummary() : null,
      );

      resetSessionBufferForSession(state.sessionId, {
        exerciseCode: workoutData.exercise.code,
        selectedView: state.selectedView,
        targetSec: getCurrentTargetSec() || null,
        source: "SESSION_START",
      });
      // 루틴/플랭크 UI와 동기화된 "현재 목표 초"
      state.currentTargetSec = getCurrentTargetSec();

      // 운동 중에는 소스·뷰·목표 변경을 막아 녹화/채점 조건이 바뀌지 않게 함
      cameraOverlay.hidden = true;
      startBtn.hidden = true;
      if (sourceSelectEl) sourceSelectEl.hidden = true;
      if (viewSelectRoot) viewSelectRoot.hidden = true;
      if (plankTargetSelectRoot) plankTargetSelectRoot.hidden = true;

      if (setupPanelContainer)
        setupPanelContainer.classList.add("hidden-during-workout");

      await runStartCountdown();

      state.phase = "WORKING";
      ui.updateStatus("running", isLearnMode() ? "학습 중" : "운동 중");

      pauseBtn.disabled = false;
      finishBtn.disabled = false;
      finishBtn.textContent = isLearnMode() ? "학습 종료" : "운동 종료";

      startTimer();
      startPoseDetection();
      // 화면 꺼짐 방지(지원 브라우저) — 긴 세션에서 카메라·루프 유지에 도움
      await requestWakeLock();
    } catch (error) {
      console.error("[Session] 시작 에러:", error);
      cameraOverlay.hidden = prevOverlayHidden;
      cameraOverlay.innerHTML = prevOverlayHtml || cameraReadyHtml;
      startBtn.hidden = prevStartHidden;
      startBtn.disabled = prevStartDisabled;
      startBtn.textContent = prevStartText;
      if (sourceSelectEl) sourceSelectEl.hidden = prevSourceSelectHidden;
      if (viewSelectRoot) viewSelectRoot.hidden = prevViewSelectHidden;
      if (plankTargetSelectRoot)
        plankTargetSelectRoot.hidden = prevPlankTargetHidden;
      if (setupPanelContainer && !hadSetupPanelHiddenClass) {
        setupPanelContainer.classList.remove("hidden-during-workout");
      }
      alert("운동 시작에 실패했습니다: " + error.message);
    }
  }

  /**
   * 포즈 감지 루프 시작 — requestAnimationFrame으로 매 프레임 poseEngine.send(video) 호출
   * - poseEngine.start(): MediaPipe 파이프라인 시작
   * - processFrame(): 비디오 프레임 전송 → 랜드마크 추론 → 캔버스에 랜드마크 오버레이
   * - state.isPaused: 일시정지 시 프레임 전송 중단 (루프 자체는 유지)
   */
  function startPoseDetection() {
    if (!poseEngine) return;

    // MediaPipe Graph 실행 시작 — 이후 send()가 유효
    poseEngine.start();

    const processFrame = async () => {
      try {
        // 일시정지 중엔 모델에 프레임을 넣지 않음(부하·불필요한 콜백 방지)
        if (poseEngine && poseEngine.isRunning && !state.isPaused) {
          // 비디오 현재 프레임 → 랜드마크 추론 → 내부에서 onPoseDetected 트리거
          await poseEngine.send(videoElement);

          if (poseEngine.lastResults) {
            // 관절선·점을 오버레이 캔버스에 그림(UI용, 채점은 이미 poseData로 진행됨)
            poseEngine.drawPose(poseCanvas, poseEngine.lastResults);
          }
        }
      } catch (error) {
        console.error("[Session] processFrame 예외:", error);
      }

      // FINISHED면 루프 중단 — 그 외에는 다음 vsync에서 다시 processFrame
      if (state.phase !== "FINISHED") {
        state.frameLoop = requestAnimationFrame(processFrame);
      }
    };

    state.frameLoop = requestAnimationFrame(processFrame);
    console.log("[Session] 포즈 감지 시작");
  }

  /**
   * 포즈 감지 콜백 — 매 프레임마다 PoseEngine에서 호출됨
   * 핵심 처리 흐름:
   *   1. 품질 게이트 평가 → 통과 못하면 점수 억제(withhold) 후 return
   *      - isFrameStable(): 프레임 안정성 확인 (LOW 품질이거나 뷰 안정성 < 0.5면 불안정)
   *      - updateQualityGateTracker(): 최근 12프레임 안정성 비율 + 연속 안정 프레임 수
   *      - buildGateInputsFromPoseData(): PoseEngine 품질 데이터 → 게이트 입력 표준화
   *      - evaluateQualityGate(): 게이트 통과/보류 결정 (ScoringEngine 공통 게이트)
   *      - shouldSuppressScoring(): withhold면 즉시 true, 아니면 안정 프레임 threshold 확인
   *   2. ScoringEngine.calculate(angles) → 점수 산출
   *   3. RepCounter.update(angles, score) → 반복/시간 감지
   *   4. UI 업데이트 (점수, 카운터, 피드백, 뷰 정보)
   *   5. SessionBuffer.addScore() → 타임라인 기록
   */
  function handlePoseDetected(poseData) {
    // 사람이 다시 보이면 NO_PERSON 누적 카운터 리셋
    noPersonCount = 0;

    if (state.phase !== "WORKING" || state.isPaused) return;
    // PoseEngine이 미리 계산해 둔 관절 각도(무릎·엉덩이 등) — ScoringEngine.calculate 입력
    const { angles } = poseData;
    // updateViewInfo(angles);

    // 최근 프레임들의 안정성 비율·연속 안정 카운트 갱신(게이트 "얼마나 믿을 만한지")
    const stabilityMetrics = updateGateTracker(poseData, qualityGateTracker);
    // scoring-engine의 evaluateQualityGate와 맞는 필드 형태로 묶음
    const gateInputs = buildGateInputs(poseData, stabilityMetrics);
    const gateContext = {
      allowedViews: getAllowedViews(),
      // 사용자가 시작 전에 고른 촬영 각도 — 게이트가 "허용 뷰·실제 뷰" 정합성 검사에 사용
      selectedView: state.selectedView,
    };
    // pass | withhold 및 사유 — 운동 모듈이 아닌 scoring-engine 쪽 단일 권한
    const gateResult =
      typeof evaluateQualityGate !== "undefined"
        ? evaluateQualityGate(gateInputs, gateContext)
        : { result: "pass", reason: null };
    // withhold가 아니어도 "연속 안정 프레임"이 부족하면 아직 채점하지 않도록 하는 보조 임계
    const gateThreshold =
      typeof QUALITY_GATE_THRESHOLDS !== "undefined"
        ? QUALITY_GATE_THRESHOLDS.stableFrameCount
        : 8;
    // true면 이 프레임은 점수/rep 에 반영하지 않음
    const suppression = shouldGateSuppressScoring(
      gateResult,
      qualityGateTracker,
      gateThreshold,
    );

    if (suppression.suppress) {
      // 게이트 실패: 채점·rep 진행을 멈추고 사용자에게 이유 안내(음성은 정책에 따라 일부만)
      state.pauseRepScoring = true;
      state.currentWithholdReason = suppression.reason;
      if (isLearnMode()) {
        // 홀드 타이머·마지막 평가 리셋 — 불안정 프레임으로 통과 처리되지 않게
        state.learnHoldMs = 0;
        state.learnLastEvaluation = null;
      }
      if (isTimeBasedExercise() && repCounter?.handleTimeBreak) {
        repCounter.handleTimeBreak("QUALITY_GATE");
        updatePlankRuntimeDisplay(repCounter.getTimeSummary());
        updatePrimaryCounterDisplay();
      }
      if (poseEngine && poseEngine.setVisualFeedback) {
        poseEngine.setVisualFeedback([]);
      }
      const message = mapGateWithholdReasonToMessage(suppression.reason, {
        allowedViews: getAllowedViews(),
        selectedView: state.selectedView,
      });
      updateScoreDisplay({
        score: 0,
        breakdown: [],
        gated: true,
        displayText: "측정 불안정",
        message,
      });
      const event = createFeedbackEvent({
        type: "QUALITY_GATE_WITHHOLD",
        message,
        severity: "warning",
        source: "quality_gate",
        withholdReason: suppression.reason,
      });
      event.stable_frame_count = stabilityMetrics.stableFrameCount;
      deliverFeedbackEvent(event, {
        alertTitle: "자세 인식 대기",
      });
      if (isLearnMode()) {
        updateLearnModeDisplay({
          gateMessage: message,
          holdProgressPercent: 0,
        });
      }
      return;
    }

    state.pauseRepScoring = false;
    state.currentWithholdReason = null;

    // REMOVED: exercise module frame gate — authority consolidated in scoring-engine.js
    // The quality gate (evaluateQualityGate) above already decides pass/withhold.
    // If gate passes, proceed directly to scoring.

    // 프로필 메트릭 전체 채점(라이브 breakdown 원본)
    const rawScoreResult = scoringEngine.calculate(angles);
    // 운동 모듈이 있으면 화면/음성용으로 breakdown 항목 필터·가공
    const liveScoreResult = getLiveFeedbackResult(rawScoreResult, angles);
    if (poseEngine && poseEngine.setVisualFeedback) {
      // 관절 옆 텍스트 힌트 등 — 모듈이 넘긴 breakdown 기준
      poseEngine.setVisualFeedback(liveScoreResult.breakdown);
    }

    if (isLearnMode()) {
      // 학습 모드는 rep 카운터 대신 스텝·홀드 평가 경로
      handleLearnPoseDetected(poseData, rawScoreResult, liveScoreResult);
      return;
    }

    // 플랭크: 부드러운 피드백 점수로 상태 전이 / 횟수 운동: "공식" 합산 점수로 rep 머신 구동
    const scoreForState = isTimeBasedExercise()
      ? liveScoreResult.score
      : rawScoreResult.score;

    // repCounter.update 직후 배열 길이 변화를 감지해 "새 샘플이 들어왔을 때만" 동기화하기 위한 스냅샷
    const previousCounts = {
      all: repCounter?.currentRepAllScores?.length || 0,
      active: repCounter?.currentRepScores?.length || 0,
      movement: repCounter?.currentMovementScores?.length || 0,
    };
    const timeOrRepResult = repCounter.update(angles, scoreForState);
    // updateViewInfo(angles);

    if (isTimeBasedExercise()) {
      updatePlankRuntimeDisplay(timeOrRepResult || repCounter.getTimeSummary());
      updatePrimaryCounterDisplay();
    }
    // rep 내부 버퍼에 쌓인 점수와 헤더의 live 숫자를 맞춤
    syncRepCounterLatestScores(liveScoreResult.score, previousCounts);

    if (liveScoreResult.score > 0) {
      console.log(
        "[Session] 점수:",
        liveScoreResult.score,
        "breakdown:",
        liveScoreResult.breakdown?.length,
      );
    }

    // 진행 중인 rep의 메트릭별 프레임 점수 누적 — 완료 후 요약·저장에 사용
    updateRepMetricBuffer(liveScoreResult);

    updateScoreDisplay(liveScoreResult);

    if (sessionBuffer) {
      // 초~프레임 단위 타임라인(서버 분석·리플레이용)
      sessionBuffer.addScore(liveScoreResult);
    }

    // 플랭크는 항상 저점 피드백 검사, 횟수 운동은 rep 진행 중에만(쿨다운은 checkFeedback 내부)
    const shouldCheckFeedback = repCounter?.pattern?.isTimeBased
      ? true
      : repCounter?.isInProgress();
    if (shouldCheckFeedback) {
      checkFeedback(liveScoreResult);
    }
  }

  /**
   * 사람 미감지 콜백 — PoseEngine에서 landmarks가 없을 때 호출
   * - 시간 기반 운동(플랭크): handleTimeBreak("NO_PERSON") → 브레이크 처리
   * - NO_PERSON_THRESHOLD(30프레임) 초과 시 이벤트 로그 + 알림
   */
  function handleNoPerson() {
    if (state.phase !== "WORKING" || state.isPaused) return;

    // 연속 미검출 프레임 수 — 임계 넘으면 한 번만 사용자 알림·이벤트 기록
    noPersonCount++;
    if (isLearnMode()) {
      state.learnHoldMs = 0;
      state.learnLastEvaluation = null;
      updateLearnModeDisplay({
        gateMessage: "카메라에 전신이 보이도록 위치를 조정해주세요.",
        holdProgressPercent: 0,
      });
      renderLearnScoreDisplay({
        gateMessage: "카메라에 전신이 보이도록 위치를 조정해주세요.",
      });
    }

    if (isTimeBasedExercise() && repCounter?.handleTimeBreak) {
      repCounter.handleTimeBreak("NO_PERSON");
      updatePlankRuntimeDisplay(repCounter.getTimeSummary());
      updatePrimaryCounterDisplay();
    }

    if (noPersonCount === NO_PERSON_THRESHOLD) {
      if (sessionBuffer) {
        sessionBuffer.addEvent("NO_PERSON", {
          duration: noPersonCount,
          message: "카메라에 사람이 감지되지 않습니다",
        });
      }
      showAlert("감지 안됨", "카메라에 전신이 보이도록 해주세요");
    }
  }

  /** 점수 배열의 평균 계산 — null/undefined/Infinity 제외 후 산술 평균 */
  function aggregateScores(scores) {
    if (!scores || scores.length === 0) return 0;
    const sorted = scores
      .filter((s) => typeof s === "number" && !Number.isNaN(s))
      .slice()
      .sort((a, b) => a - b);
    if (sorted.length === 0) return 0;

    // 표본이 많을 때 상·하위 10%를 잘라 이상치에 덜 민감한 대표값 사용
    const trimCount = Math.floor(sorted.length * 0.1);
    const trimmed =
      sorted.length >= 10
        ? sorted.slice(trimCount, sorted.length - trimCount)
        : sorted;
    const sum = trimmed.reduce((a, b) => a + b, 0);
    return Math.round(sum / trimmed.length);
  }

  /**
   * 메트릭 항목을 0~100 정규화 점수로 변환
   * - normalizedScore가 있으면 사용, 없으면 score/maxScore 비율로 계산
   */
  function getNormalizedMetricScore(item) {
    const explicit = Number(item?.normalizedScore ?? item?.normalized_score);
    if (Number.isFinite(explicit)) {
      return Math.max(0, Math.min(100, explicit));
    }

    const rawScore = Number(item?.score ?? item?.avg_score);
    const rawMaxScore = Number(item?.maxScore ?? item?.max_score);
    if (
      Number.isFinite(rawScore) &&
      Number.isFinite(rawMaxScore) &&
      rawMaxScore > 0
    ) {
      return Math.max(0, Math.min(100, (rawScore / rawMaxScore) * 100));
    }

    return Number.isFinite(rawScore) ? Math.max(0, Math.min(100, rawScore)) : 0;
  }

  function getLearnDisplayColor(score) {
    if (score >= 80) return "#22c55e";
    if (score >= 60) return "#eab308";
    if (score > 0) return "#ef4444";
    return "#94a3b8";
  }

  function buildLearnBreakdown(evaluation) {
    return (evaluation?.checks || [])
      .map((item) => ({
        key: item.id || item.label,
        title: item.label,
        score: Math.round((item.passed ? 1 : Number(item.progress) || 0) * 100),
      }))
      .slice(0, 3);
  }

  function renderLearnScoreDisplay({
    evaluation = null,
    holdProgressPercent = 0,
    gateMessage = null,
  } = {}) {
    if (gateMessage) {
      ui.updateScoreDisplay({
        score: 0,
        displayText: "--",
        breakdown: [],
        gated: true,
        message: gateMessage,
      });
      return;
    }

    const displayScore =
      evaluation?.passed === true
        ? Math.round(holdProgressPercent)
        : Math.round((Number(evaluation?.progress) || 0) * 100);
    const breakdown = buildLearnBreakdown(evaluation);

    ui.updateScoreDisplay({
      score: displayScore,
      displayText: `${displayScore}%`,
      breakdown,
      color: getLearnDisplayColor(displayScore),
      emptyMessage: "현재 step 자세를 준비하세요.",
    });
  }

  function recordLearnStepEvent(type, payload = {}) {
    if (!sessionBuffer) return;
    sessionBuffer.addEvent(type, {
      selected_view: state.selectedView,
      ...payload,
    });
  }

  function handleLearnStepComplete(step) {
    const totalSteps = state.learnSteps.length;
    const completedStepNumber = Math.min(state.learnStepIndex + 1, totalSteps);

    recordLearnStepEvent("LEARN_STEP_COMPLETE", {
      step_id: step.id || `step_${completedStepNumber}`,
      step_index: state.learnStepIndex,
      step_number: completedStepNumber,
      step_title: step.title || `${completedStepNumber}단계`,
      total_steps: totalSteps,
    });

    if (step.successMessage) {
      deliverFeedbackEvent(
        {
          type: "LEARN_STEP_HINT",
          timestamp: getFeedbackTimestamp(),
          message: step.successMessage,
          exercise_code: getCurrentExerciseCode(),
          selected_view: state.selectedView,
          severity: "info",
          source: "learn",
        },
        {
          alertTitle: "Step 완료",
        },
      );
    }

    state.learnStepIndex += 1;
    state.learnHoldMs = 0;
    state.learnLastEvaluation = null;
    state.learnLastFrameAt = performance.now();
    state.learnTransitionUntil = state.learnLastFrameAt + 600;

    if (state.learnStepIndex >= totalSteps) {
      state.learnCompleted = true;
      recordLearnStepEvent("LEARN_COMPLETE", {
        completed_steps: totalSteps,
        total_steps: totalSteps,
      });
      updateLearnModeDisplay({ holdProgressPercent: 100 });
      renderLearnScoreDisplay({
        evaluation: { passed: true, progress: 1, checks: [] },
        holdProgressPercent: 100,
      });
      setTimeout(() => {
        finishWorkout();
      }, 600);
      return;
    }

    updateLearnModeDisplay();
    renderLearnScoreDisplay();
  }

  function handleLearnPoseDetected(poseData, rawScoreResult, liveScoreResult) {
    const step = getCurrentLearnStep();
    if (!step) {
      state.learnCompleted = true;
      finishWorkout();
      return;
    }

    const now = performance.now();
    const deltaMs =
      state.learnLastFrameAt == null
        ? 0
        : Math.max(0, Math.min(200, now - state.learnLastFrameAt));
    state.learnLastFrameAt = now;

    if (state.learnTransitionUntil > now) {
      updateLearnModeDisplay();
      return;
    }

    let stepEvaluationResult = null;
    if (typeof step.evaluate === "function") {
      try {
        stepEvaluationResult = step.evaluate({
          angles: poseData.angles,
          poseData,
          rawScoreResult,
          scoringResult: liveScoreResult,
          scoringEngine,
          exerciseModule,
          selectedView: state.selectedView,
          state,
          now,
          deltaMs,
        });
      } catch (error) {
        console.error("[Session] learn step evaluation failed:", error);
      }
    }

    const evaluation = normalizeLearnStepEvaluationHelper(stepEvaluationResult);

    state.learnLastEvaluation = evaluation;
    const holdState = updateLearnHoldStateHelper({
      currentHoldMs: state.learnHoldMs,
      deltaMs,
      holdMs: step.holdMs,
      passed: evaluation.passed,
    });
    state.learnHoldMs = holdState.holdMs;

    const holdProgressPercent = Math.round(holdState.holdProgress * 100);
    updateLearnModeDisplay({
      evaluation,
      holdProgressPercent,
    });
    renderLearnScoreDisplay({
      evaluation,
      holdProgressPercent,
    });

    if (holdState.completed) {
      handleLearnStepComplete(step);
    }
  }

  /**
   * ScoringEngine 점수를 RepCounter의 운동 모듈에도 동기화
   * - 운동 모듈의 recordFrame()에 점수 전달 (phase 기반 채점용)
   * - 이전 카운트와 비교해 rep 완료 여부 확인 → handleRepComplete 트리거
   */
  function syncRepCounterLatestScores(score, previousCounts) {
    if (!repCounter || !Number.isFinite(score)) return;

    const targets = [
      {
        list: repCounter.currentRepAllScores,
        previous: previousCounts?.all || 0,
      },
      {
        list: repCounter.currentRepScores,
        previous: previousCounts?.active || 0,
      },
      {
        list: repCounter.currentMovementScores,
        previous: previousCounts?.movement || 0,
      },
    ];

    for (const target of targets) {
      if (!Array.isArray(target.list)) continue;
      // update() 직후 새 샘플이 append 됐다면, 마지막 슬롯을 이번 프레임 UI 점수로 덮어씀
      if (target.list.length > target.previous) {
        target.list[target.list.length - 1] = score;
      }
    }
  }

  /**
   * 실시간 피드백 결과 생성
   * - 시간 기반 운동: 정규화된 점수로 변환 (poseEngine.getQualityFactor 보정)
   * - 횟수 기반 운동: raw scoreResult 그대로 사용
   * - breakdown에 시각 피드백 정보 추가 (poseEngine용)
   */
  function getLiveFeedbackResult(scoreResult, angles) {
    if (!scoreResult?.breakdown?.length) {
      return scoreResult;
    }

    if (exerciseModule?.filterLiveFeedback) {
      return (
        exerciseModule.filterLiveFeedback(
          scoreResult,
          getExerciseRuntime({ angles }),
        ) || scoreResult
      );
    }

    return scoreResult;
  }

  /**
   * rep별 메트릭 점수를 버퍼에 누적 — rep 완료 시 요약에 사용
   * - breakdown의 각 메트릭을 state.repMetricBuffer에 scores 배열로 누적
   * - rep 완료 시 handleRepComplete에서 이 버퍼를 기반으로 최종 요약 생성
   */
  function updateRepMetricBuffer(scoreResult) {
    const isTimeBased = repCounter?.pattern?.isTimeBased;
    if (isTimeBased) return;

    const isRepInProgress = repCounter?.isInProgress
      ? repCounter.isInProgress()
      : false;
    if (isRepInProgress && !state.repInProgressPrev) {
      state.repMetricBuffer = {};
    }
    state.repInProgressPrev = isRepInProgress;

    if (!isRepInProgress) return;
    if (exerciseModule?.shouldAccumulateRepMetrics) {
      if (
        !exerciseModule.shouldAccumulateRepMetrics(
          getExerciseRuntime({ scoreResult }),
        )
      )
        return;
    } else if (repCounter?.currentState !== window.REP_STATES?.ACTIVE) {
      return;
    }

    if (!scoreResult?.breakdown || scoreResult.breakdown.length === 0) return;
    for (const item of scoreResult.breakdown) {
      const key = item.key;
      if (!key) continue;
      if (!state.repMetricBuffer[key]) {
        state.repMetricBuffer[key] = {
          metric_id: item.metric_id,
          key,
          title: item.title || key,
          maxScore: 100,
          scores: [],
        };
      }
      state.repMetricBuffer[key].scores.push(getNormalizedMetricScore(item));
    }
  }

  /**
   * 감지된 뷰(FRONT/SIDE/DIAGONAL) 정보를 UI에 표시 — 쓰로틀 적용 (1초에 1회)
   * - angles.view: PoseEngine의 classifyView() 결과
   * - angles.quality.viewStability: 뷰 안정성 점수
   */
  function updateViewInfo(angles) {
    if ((!viewInfoEl && !phaseInfoEl) || !angles) return;

    const now = performance.now();
    if (now - state.lastViewInfoAt < 250) return;
    state.lastViewInfoAt = now;

    const view = angles.view || "UNKNOWN";
    const source = angles.angleSource || "UNKNOWN";
    const quality = angles.quality?.level || "UNKNOWN";
    const phase =
      repCounter?.currentPhase || window.REP_PHASES?.NEUTRAL || "UNKNOWN";
    const selectedView = state.selectedView || "N/A";
    const phaseText = `PHASE: ${phase}`;
    const viewText = `VIEW: ${view} / SELECTED: ${selectedView} / SRC: ${source} / Q: ${quality}`;

    if (phaseText !== state.lastViewInfoText) {
      state.lastViewInfoText = phaseText;
      if (phaseInfoEl) {
        phaseInfoEl.textContent = phaseText;
      }
    }

    if (viewInfoEl && viewInfoEl.textContent !== viewText) {
      viewInfoEl.textContent = viewText;
    }
  }

  /**
   * rep 완료 콜백 — RepCounter가 1회 동작 완료 시 호출
   * 1. 카운터 UI 업데이트
   * 2. 메트릭 요약 집계
   * 3. SessionBuffer에 rep + 이벤트 기록
   * 4. 루틴 모드면 checkRoutineProgress()로 다음 단계 전환 판단
   * 5. 피드백 표시
   */
  function handleRepComplete(repRecord) {
    state.currentRep = repRecord.repNumber;
    updatePrimaryCounterDisplay();
    updateRoutineStepDisplay();

    // UI·버퍼용: 방금 끝난 rep의 메트릭 요약(없으면 프레임 누적 버퍼에서 역산)
    state.lastRepMetricSummary =
      Array.isArray(repRecord.breakdown) && repRecord.breakdown.length > 0
        ? repRecord.breakdown.map((item) => ({
            ...item,
            normalizedScore: getNormalizedMetricScore(item),
          }))
        : Object.values(state.repMetricBuffer || {})
            .map((m) => ({
              metric_id: m.metric_id,
              key: m.key,
              title: m.title,
              maxScore: m.maxScore,
              score: aggregateScores(m.scores),
            }))
            .sort(
              (a, b) =>
                b.score / (b.maxScore || 1) - a.score / (a.maxScore || 1),
            );

    if (sessionBuffer) {
      sessionBuffer.addRep(repRecord);

      sessionBuffer.addEvent("REP_COMPLETE", {
        repNumber: repRecord.repNumber,
        score: repRecord.score,
        duration: repRecord.duration,
        phase: repRecord.phase || null,
        view: repRecord.view || null,
        selected_view: state.selectedView,
        confidence: repRecord.confidence?.level || null,
        feedback: repRecord.feedback || null,
      });
    }

    if (workoutData.mode === "ROUTINE" && workoutData.routine) {
      // 목표 횟수/시간 달성 시 휴식·다음 세트·다음 동작으로 넘어갈지 결정
      void checkRoutineProgress();
    }

    showRepFeedback(repRecord);
  }

  /**
   * 점수 UI 업데이트
   * - 시간 기반: 실시간 scoreResult.score 표시
   * - 횟수 기반: 현재 진행 중인 rep의 점수 (RepCounter.getCurrentRepScore)
   * - gated: 품질 게이트 보류 중이면 0점 + 안내 메시지
   * - breakdown: 메트릭별 점수를 scoreBreakdownEl에 표시
   */
  function updateScoreDisplay(scoreResult) {
    const isTimeBased = repCounter?.pattern?.isTimeBased;
    const hasAnyRep = repCounter?.getCount ? repCounter.getCount() > 0 : false;
    const isRepInProgress = repCounter?.isInProgress
      ? repCounter.isInProgress()
      : false;

    // 헤더 상태는 rep 누적 점수가 아니라 현재 프레임의 자세 점수로 즉시 반응한다.
    const displayScore = Math.max(0, Math.min(100, Number(scoreResult?.score) || 0));
    const displayText =
      scoreResult.displayText ||
      String(displayScore);

    state.liveScore = displayScore;
    let color = "#94a3b8";
    if (displayScore >= 80) {
      color = "#22c55e";
    } else if (displayScore >= 60) {
      color = "#eab308";
    } else if (displayScore > 0) {
      color = "#ef4444";
    }

    const shouldShowBreakdown = isTimeBased
      ? scoreResult.breakdown && scoreResult.breakdown.length > 0
      : (isRepInProgress &&
          Object.keys(state.repMetricBuffer || {}).length > 0) ||
        (!isRepInProgress &&
          hasAnyRep &&
          state.lastRepMetricSummary?.length > 0);

    if (shouldShowBreakdown) {
      // 상위 3개 메트릭만 카드에 표시 — 진행 중엔 버퍼, 완료 직후엔 직전 rep 요약
      const items = isTimeBased
        ? scoreResult.breakdown
        : isRepInProgress
          ? Object.values(state.repMetricBuffer).map((m) => ({
              key: m.key,
              title: m.title,
              score: aggregateScores(m.scores),
              maxScore: m.maxScore,
            }))
          : state.lastRepMetricSummary;

      const breakdown = items
        .map((item) => ({
          ...item,
          displayScore: getNormalizedMetricScore(item),
          displayMaxScore: 100,
        }))
        .filter((it) => it && it.displayMaxScore != null)
        .sort((a, b) => b.displayScore - a.displayScore)
        .slice(0, 3)
        .map((item) => ({
          key: item.key,
          title: item.title,
          score: item.displayScore,
        }));

      ui.updateScoreDisplay({
        breakdown,
        color,
        displayAsGrade: true,
        displayText,
        score: displayScore,
      });
      return;
    }

    ui.updateScoreDisplay({
      color,
      displayAsGrade: !scoreResult.gated,
      emptyMessage:
        scoreResult.score === 0 ? "포즈 감지 중..." : "rep 시작하면 표시됩니다",
      gated: scoreResult.gated,
      message: scoreResult.message,
      displayText,
      score: displayScore,
    });
  }

  /**
   * 점수 기반 피드백 경고 표시 — 주요 메트릭 점수가 낮으면 알림
   * - selectAlertFeedbackItem(): 가장 점수가 낮은 메트릭 선택
   * - alertCooldown: 3초 쿨다운으로 과도한 알림 방지
   */
  function checkFeedback(scoreResult) {
    if (state.alertCooldown) return;

    const lowScoreItem = selectAlertFeedbackItem(scoreResult);

    if (lowScoreItem) {
      const event = createFeedbackEvent({
        type: "LOW_SCORE_HINT",
        message: lowScoreItem.feedback,
        metric: lowScoreItem,
        severity: "warning",
        source: "live_feedback",
      });

      deliverFeedbackEvent(event, {
        alertTitle: "자세 교정 필요",
      });
    }
  }

  /**
   * 가장 점수가 낮은 메트릭을 선택해 피드백 메시지 결정
   * - feedback 문자열이 있는 breakdown 항목만 후보
   * - 정규화 점수 60 미만이면서(횟수 운동은 최소 샘플 수 충족 시) 최하위 하나 선택
   */
  function selectAlertFeedbackItem(scoreResult) {
    if (!scoreResult?.breakdown?.length) {
      return null;
    }

    const isTimeBased = Boolean(repCounter?.pattern?.isTimeBased);
    const candidates = scoreResult.breakdown
      .filter((item) => item?.feedback)
      .map((item) => {
        // 횟수 운동: 같은 rep 동안 프레임별로 쌓인 점수가 있으면 그걸로 대표값(트리밍 평균)
        const bufferedScores = !isTimeBased
          ? state.repMetricBuffer?.[item.key]?.scores
          : null;
        const bufferedCount = Array.isArray(bufferedScores)
          ? bufferedScores.length
          : 0;
        const normalizedScore =
          bufferedCount > 0
            ? aggregateScores(bufferedScores)
            : getNormalizedMetricScore(item);
        // 노이즈 메트릭은 더 많은 샘플이 있을 때만 "진짜로 나쁨"이라고 알림
        const requiredSamples = item.key === "heel_contact" ? 4 : 2;
        return {
          ...item,
          score: normalizedScore,
          maxScore: 100,
          normalizedScore,
          bufferedCount,
          requiredSamples,
        };
      })
      .filter((item) => {
        if (item.normalizedScore >= 60) return false;
        if (isTimeBased) return true;
        return item.bufferedCount >= item.requiredSamples;
      })
      // 가장 낮은 정규화 점수 하나만 골라 과도한 동시 힌트 방지
      .sort((a, b) => a.normalizedScore - b.normalizedScore);

    return candidates[0] || null;
  }

  /**
   * 점수를 운동 중 등급 label로 변환 (session-ui.js와 동일 기준)
   */
  function getWorkoutGradeLabel(score) {
    const numericScore = Number(score);
    if (!Number.isFinite(numericScore) || numericScore <= 0) return "--";
    if (numericScore >= 80) return "좋음";
    if (numericScore >= 50) return "보통";
    return "교정 필요";
  }

  /**
   * rep 완료 시 짧은 피드백 토스트 표시
   * - repRecord.score에 따라 등급 label + feedback 메시지 분기
   * - repRecord.feedback이 있으면 우선 사용
   */
  function showRepFeedback(repRecord) {
    const gradeLabel = getWorkoutGradeLabel(repRecord.score);
    const msg = repRecord.feedback || gradeLabel;
    const message = repRecord.feedback
      ? `${repRecord.repNumber}회 완료 · ${gradeLabel} · ${msg}`
      : `${repRecord.repNumber}회 완료 · ${gradeLabel}`;

    const event = createFeedbackEvent({
      type: "REP_COMPLETE_FEEDBACK",
      message,
      repRecord,
      severity: repRecord.score >= 80 ? "success" : "info",
      source: "rep_complete",
    });

    deliverFeedbackEvent(event, {
      toast: true,
    });

    if (repRecord.feedback) {
      const correctionEvent = createFeedbackEvent({
        type: "LOW_SCORE_HINT",
        message: repRecord.feedback,
        repRecord,
        severity: "warning",
        source: "rep_complete",
      });

      deliverFeedbackEvent(correctionEvent, {
        visual: false,
      });
    }
  }

  /** RepCounter 런타임 상태 리셋 + 목표 시간 재주입 */
  function resetRepCounterRuntime() {
    if (repCounter) {
      repCounter.reset();
      if (repCounter.setTargetSec) {
        repCounter.setTargetSec(getCurrentTargetSec());
      }
    }
  }

  /**
   * 루틴 단계 전환 시 UI 상태 초기화
   * - 실제 state reset 정책은 routine-session-manager.js에 위임
   * - 여기서는 점수판/카운터 등 표시 상태만 다시 맞춘다
   */
  function resetRoutineStepUiState() {
    setCountEl.textContent = 1;
    updatePrimaryCounterDisplay();
    updateRoutineStepDisplay();
    liveScoreEl.textContent = "--";
    scoreBreakdownEl.innerHTML =
      '<div class="score-item"><span class="muted">rep 시작하면 표시됩니다.</span></div>';
    resetRepCounterRuntime();
    updatePlankRuntimeDisplay(
      repCounter?.getTimeSummary ? repCounter.getTimeSummary() : null,
    );
  }

  /**
   * 현재 세트 추적 UI 동기화
   * - 실제 set-local state reset 정책은 routine-session-manager.js에 위임
   */
  function resetRoutineSetUiState() {
    resetRepCounterRuntime();
    updatePrimaryCounterDisplay();
    updateRoutineStepDisplay();
    updatePlankRuntimeDisplay(
      repCounter?.getTimeSummary ? repCounter.getTimeSummary() : null,
    );
  }

  /**
   * 루틴 다음 단계로 전환
   * 1. 현재 운동 코드를 다음 단계 운동으로 변경
   * 2. bindEnginesToCurrentExercise(): ScoringEngine/RepCounter 재초기화
   * 3. resetSessionBufferForSession(): SessionBuffer 재생성
   * 4. resetStepUiState(): UI 상태 초기화
   * 5. syncPlankTargetUi(): 플랭크 목표 시간 UI 동기화
   */
  function switchRoutineStep(stepIndex) {
    const stepConfig = routineManager.resolveRoutineStepConfig({
      normalizeTargetType: normalizeRoutineTargetType,
      resolveDefaultView,
      routineSetup: workoutData.routine?.routine_setup,
      stepIndex,
    });

    if (!stepConfig?.exercise) {
      return false;
    }

    workoutData.exercise = stepConfig.exercise;
    workoutData.scoringProfile = stepConfig.scoringProfile;
    state.selectedView = stepConfig.selectedView;
    state.currentTargetSec = stepConfig.targetSec;

    if (!bindEnginesToCurrentExercise()) {
      return false;
    }

    syncPlankTargetUi();
    routineManager.resetStepState();
    resetRoutineStepUiState();

    if (sessionBuffer) {
      sessionBuffer.addEvent("ROUTINE_STEP_CHANGE", {
        stepIndex,
        exercise_id: stepConfig.exercise.exercise_id,
        exercise_code: stepConfig.exercise.code,
        selected_view: state.selectedView,
      });
    }

    updateRoutineStepDisplay();
    return true;
  }

  async function checkRoutineProgress(trigger = "REP") {
    if (state.phase !== "WORKING") return;
    if (state.routineSetSyncPending) return;

    const currentStep =
      workoutData.routine.routine_setup[state.currentStepIndex];
    if (!currentStep) return;

    const targetType = normalizeRoutineTargetType(currentStep.target_type);
    const targetValue = Math.max(1, Number(currentStep.target_value) || 1);
    const actualValue =
      targetType === "TIME"
        ? isTimeBasedExercise()
          ? state.bestHoldSec
          : state.currentSetWorkSec
        : state.currentRep;

    if (actualValue < targetValue) return;

    state.routineSetSyncPending = true;
    const fallbackRestSec = Math.max(0, Number(currentStep.rest_sec) || 0);
    const hasNextExerciseStep =
      state.currentStepIndex < workoutData.routine.routine_setup.length - 1;

    try {
      let sessionPayload = null;
      const isTimeBased = isTimeBasedExercise();
      const timeSummary =
        isTimeBased && repCounter?.getTimeSummary
          ? repCounter.getTimeSummary()
          : null;

      if (sessionBuffer) {
        if (trigger) {
          sessionBuffer.addEvent("ROUTINE_TARGET_REACHED");
        }
        sessionPayload = sessionBuffer.export({
          isTimeBased,
          targetSec: getCurrentTargetSec(),
          bestHoldSec: timeSummary?.bestHoldSec || state.bestHoldSec || 0,
          bestHoldPostureScore: repCounter?.getBestHoldPostureScore
            ? repCounter.getBestHoldPostureScore()
            : 0,
        });
      } else {
        sessionPayload = {
          selected_view: state.selectedView,
          result_basis: isTimeBased ? "DURATION" : "REPS",
          total_result_value: isTimeBased
            ? timeSummary?.bestHoldSec || state.bestHoldSec || 0
            : actualValue,
          total_result_unit: isTimeBased ? "SEC" : "COUNT",
          duration_sec: state.currentSetWorkSec,
          total_reps: isTimeBased ? 0 : actualValue,
          target_sec: isTimeBased ? getCurrentTargetSec() || null : null,
          best_hold_sec: isTimeBased
            ? timeSummary?.bestHoldSec || state.bestHoldSec || 0
            : null,
          final_score: state.liveScore || 0,
        };
      }

      const actionResult = await routineManager.checkRoutineProgress({
        actualValue,
        targetValue,
        currentSet: state.currentSet,
        totalSets: Math.max(1, Number(currentStep.sets) || 1),
        hasNextExerciseStep,
        fallbackRestSec,
        payload: {
          actualValue,
          targetType,
          durationSec: state.currentSetWorkSec,
          score: state.liveScore,
          sessionPayload,
        },
      });
      const action = actionResult.action;
      const restSec = actionResult.restSec;
      const routineState = actionResult.routineState || null;

      if (action === "ALREADY_PROCESSED" || action === "NONE") {
        return;
      }

      if (action === "NEXT_SET" || action === "NEXT_STEP") {
        const nextSessionId = actionResult.nextSessionId;

        const nextTargetType =
          action === "NEXT_STEP"
            ? normalizeRoutineTargetType(routineState?.next_step?.target_type)
            : targetType;
        const nextTargetSec =
          nextTargetType === "TIME"
            ? Math.max(
                1,
                Number(
                  action === "NEXT_STEP"
                    ? routineState?.next_step?.target_value
                    : currentStep.target_value,
                ) || 1,
              )
            : null;
        const nextExerciseCode =
          action === "NEXT_STEP"
            ? routineState?.next_exercise?.code ||
              workoutData.routine?.routine_setup?.[state.currentStepIndex + 1]
                ?.exercise?.code ||
              workoutData.exercise?.code
            : workoutData.exercise?.code;

        resetSessionBufferForSession(nextSessionId, {
          exerciseCode: nextExerciseCode,
          selectedView: routineState?.next_session?.selected_view,
          targetSec: nextTargetSec,
          source: `ROUTINE_${action}`,
        });
      }

      if (action === "ROUTINE_COMPLETE") {
        return;
      }

      state.currentSetWorkSec = 0;
      updatePrimaryCounterDisplay();

      if (action === "NEXT_SET") {
        if (restSec > 0) {
          return;
        }

        state.currentSet++;
        syncDisplayedSetCount();
        routineManager.resetSetState();
        resetRoutineSetUiState();
        showAlert("다음 세트", `${state.currentSet}세트 시작!`);
        return;
      }

      if (action === "NEXT_STEP") {
        if (restSec > 0) {
          return;
        }

        nextExercise();
        return;
      }
    } catch (error) {
      console.error("[Session] 루틴 세트 동기화 실패:", error);
      const errorMessage =
        String(error?.message || "").trim() ||
        "세트 저장에 실패했습니다. 잠시 후 다시 시도됩니다.";
      showAlert("루틴 저장 실패", errorMessage);
    } finally {
      state.routineSetSyncPending = false;
    }
  }

  /** 운동 시간 타이머 시작 — 1초 간격으로 state.totalTime 증가 + UI 갱신 */
  function startTimer() {
    state.timerInterval = setInterval(() => {
      if (!state.isPaused && state.phase === "WORKING") {
        state.totalTime++;
        if (!isTimeBasedExercise()) {
          state.currentSetWorkSec++;
        }
        updateTimerDisplay();

        if (isRoutineTimeTarget() && !isTimeBasedExercise()) {
          updatePrimaryCounterDisplay();
          updateRoutineStepDisplay();
        }

        if (workoutData.mode === "ROUTINE" && workoutData.routine) {
          void checkRoutineProgress("TIMER");
        }
      }
    }, 1000);
  }

  /** 타이머 UI 갱신 — 경과 시간을 MM:SS로 표시 */
  function updateTimerDisplay() {
    const mins = Math.floor(state.totalTime / 60);
    const secs = state.totalTime % 60;
    timerValueEl.textContent = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  /** 일시정지/재개 토글 — 타이머/프레임 루프 정지 & Wake Lock 해제/재획득 */
  function togglePause() {
    const nextIsPaused = !state.isPaused;
    if (nextIsPaused) {
      state.displayedSetCount = resolveDisplayedSetCountOnPause({
        mode: workoutData.mode,
        displayedSetCount: state.displayedSetCount,
        phase: state.phase,
        nextIsPaused,
      });
      syncDisplayedSetCount();
    }
    state.isPaused = nextIsPaused;

    if (state.isPaused) {
      state.phase = "PAUSED";
      ui.updateStatus("paused", "일시정지");
      pauseBtn.innerHTML = "계속하기";
      if (poseEngine) poseEngine.stop();
      clearPoseOverlay({ poseEngine, poseCanvas });
      if (sessionBuffer) sessionBuffer.addEvent("PAUSE");
      releaseWakeLock();
    } else {
      state.phase = "WORKING";
      ui.updateStatus("running", isLearnMode() ? "학습 중" : "운동 중");
      pauseBtn.innerHTML = "일시정지";
      if (poseEngine) poseEngine.start();
      if (sessionBuffer) sessionBuffer.addEvent("RESUME");
      requestWakeLock();
    }
  }

  /** 루틴 세트 간 휴식 타이머 시작 — afterAction: 'NEXT_SET' | 'NEXT_STEP' | 'ROUTINE_COMPLETE' */
  function startRest(seconds, afterAction = "NEXT_SET") {
    state.phase = "RESTING";
    state.restTimeLeft = seconds;
    state.restAfterAction = afterAction;
    ui.updateStatus("rest", "휴식 중");
    timerLabelEl.textContent = getPrimaryTimerLabel();
    restTimerEl.hidden = false;
    restValueEl.textContent = seconds;

    if (poseEngine) poseEngine.stop();
    clearPoseOverlay({ poseEngine, poseCanvas });
    if (sessionBuffer)
      sessionBuffer.addEvent("REST_START", { duration: seconds });

    state.restInterval = setInterval(() => {
      if (!state.isPaused) {
        state.restTimeLeft--;
        restValueEl.textContent = state.restTimeLeft;

        if (state.restTimeLeft <= 0) {
          endRest();
        }
      }
    }, 1000);
  }

  /** 휴식 종료 — 타이머 정리 후 afterAction에 따라 다음 세트/단계/완료 분기 */
  function endRest() {
    clearInterval(state.restInterval);
    restTimerEl.hidden = true;
    timerLabelEl.textContent = getPrimaryTimerLabel();
    state.phase = "WORKING";
    ui.updateStatus("running", "운동 중");
    syncPlankTargetUi();

    const action = state.restAfterAction || "NEXT_SET";
    state.restAfterAction = null;

    if (action === "NEXT_EXERCISE") {
      if (poseEngine) poseEngine.start();
      if (sessionBuffer) sessionBuffer.addEvent("REST_END");
      nextExercise();
      return;
    }

    state.currentSet++;
    syncDisplayedSetCount();
    routineManager.resetSetState();
    resetRoutineSetUiState();

    if (poseEngine) poseEngine.start();
    if (sessionBuffer) sessionBuffer.addEvent("REST_END");

    showAlert("다음 세트", `${state.currentSet}세트 시작!`);
  }

  /** 품질 게이트/에러 알림 배너 표시 */
  function showAlert(title, message) {
    if (state.alertCooldown) return;

    ui.showAlert(title, message);

    state.alertCooldown = true;
    setTimeout(() => {
      ui.hideAlert();
      state.alertCooldown = false;
    }, 3000);
  }

  /** 루틴 다음 운동으로 전환 (버튼/자동) — switchRoutineStep 래퍼 */
  function nextExercise() {
    state.restAfterAction = null;
    const routineSteps = workoutData.routine.routine_setup;
    const nextStepIndex = routineManager.resolveNextRoutineStepIndex({
      currentStepIndex: state.currentStepIndex,
      routineSetup: routineSteps,
    });

    if (nextStepIndex == null) {
      finishWorkout();
      return;
    }

    state.currentStepIndex = nextStepIndex;
    const switched = switchRoutineStep(state.currentStepIndex);
    if (!switched) {
      showAlert("루틴 오류", "다음 운동의 채점 설정을 불러오지 못했습니다.");
      finishWorkout();
      return;
    }
    if (sessionBuffer) {
      sessionBuffer.addEvent("NEXT_EXERCISE", {
        stepIndex: state.currentStepIndex,
        exercise_code: workoutData.exercise?.code || null,
      });
    }

    showAlert(
      "다음 운동",
      routineSteps[state.currentStepIndex].exercise?.name || "다음 운동",
    );
  }

  function buildLearnSessionPayload() {
    const totalSteps = state.learnSteps.length;
    const completedSteps = Math.min(state.learnStepIndex, totalSteps);
    const progressScore =
      totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

    return {
      selected_view: state.selectedView,
      result_basis: "REPS",
      total_result_value: completedSteps,
      total_result_unit: "COUNT",
      duration_sec: state.totalTime,
      total_reps: 0,
      final_score: progressScore,
      summary_feedback: generateSummary(false, null),
      metric_results: [],
      interim_snapshots: [],
      events: Array.isArray(sessionBuffer?.events) ? sessionBuffer.events : [],
    };
  }

  /**
   * 운동 세션 종료 — 핵심 종료 로직
   * 1. phase → FINISHED, 타이머/프레임 루프 정지, Wake Lock 해제
   * 2. SessionBuffer.export()로 최종 페이로드 생성
   * 3. PUT /api/workout/session/:id/end 로 서버에 저장
   * 4. 결과 페이지로 리다이렉트
   */
  async function finishWorkout() {
    if (!state.sessionId || isEndingSession) return;
    isEndingSession = true;
    finishBtn.disabled = true;
    finishBtn.textContent = "저장 중...";
    pauseBtn.disabled = true;

    // 이후 handlePoseDetected 등은 phase/루프 정지로 더 이상 의미 있는 처리를 하지 않음
    state.phase = "FINISHED";
    clearInterval(state.timerInterval);
    clearInterval(state.restInterval);
    if (state.frameLoop) {
      cancelAnimationFrame(state.frameLoop);
    }
    if (poseEngine) {
      poseEngine.stop();
    }
    clearPoseOverlay({ poseEngine, poseCanvas });
    sessionCamera.destroy();
    releaseWakeLock();

    ui.updateStatus("finished", "완료");

    try {
      const isTimeBased = isTimeBasedExercise();
      const timeSummary =
        isTimeBased && repCounter?.getTimeSummary
          ? repCounter.getTimeSummary()
          : null;
      let sessionData = pendingSessionPayload;
      if (!sessionData) {
        // 학습/일반/버퍼 없음 — 가능한 한 서버 스키마에 맞는 최소 페이로드
        if (isLearnMode()) {
          sessionData = buildLearnSessionPayload();
        } else if (sessionBuffer) {
          sessionData = sessionBuffer.export({
            isTimeBased,
            targetSec: getCurrentTargetSec(),
            bestHoldSec: timeSummary?.bestHoldSec || state.bestHoldSec || 0,
            bestHoldPostureScore: repCounter?.getBestHoldPostureScore
              ? repCounter.getBestHoldPostureScore()
              : 0,
          });
        } else {
          sessionData = {
            selected_view: state.selectedView,
            result_basis: isTimeBased ? "DURATION" : "REPS",
            total_result_value: isTimeBased
              ? timeSummary?.bestHoldSec || state.bestHoldSec || 0
              : state.currentRep,
            total_result_unit: isTimeBased ? "SEC" : "COUNT",
            duration_sec: state.totalTime,
            total_reps: isTimeBased ? 0 : state.currentRep,
            target_sec: getCurrentTargetSec() || null,
            best_hold_sec: timeSummary?.bestHoldSec || state.bestHoldSec || 0,
            final_score: state.liveScore || 0,
            summary_feedback: generateSummary(isTimeBased, timeSummary),
          };
        }
      }
      pendingSessionPayload = sessionData;

      const response = await fetch(
        `/api/workout/session/${state.sessionId}/end`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sessionData),
        },
      );

      const responseBody = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          responseBody.error || responseBody.message || "세션 종료 실패",
        );
      }

      if (sessionBuffer) {
        sessionBuffer.clearStorage();
      }
      pendingSessionPayload = null;
      // 저장 성공 시에만 결과 화면으로 이동
      window.location.href = `/workout/result/${state.sessionId}`;
    } catch (error) {
      console.error("[Session] 종료 에러:", error);
      showAlert(
        "저장 실패",
        "운동 결과 저장에 실패했습니다. 종료 버튼을 다시 눌러 재시도해 주세요.",
      );
      finishBtn.disabled = false;
      finishBtn.textContent = "저장 재시도";
    } finally {
      isEndingSession = false;
    }
  }

  /** 세션 종료 시 요약 피드백 텍스트 생성 — 시간 기반/횟수 기반 분기 */
  function generateSummary(
    isTimeBased = isTimeBasedExercise(),
    timeSummary = null,
  ) {
    if (isLearnMode()) {
      const totalSteps = state.learnSteps.length;
      const completedSteps = Math.min(state.learnStepIndex, totalSteps);
      if (completedSteps >= totalSteps && totalSteps > 0) {
        return `${workoutData.exercise?.name || "운동"} 학습 ${totalSteps}단계를 모두 완료했습니다.`;
      }
      if (totalSteps > 0) {
        return `${workoutData.exercise?.name || "운동"} 학습 ${totalSteps}단계 중 ${completedSteps}단계를 완료했습니다.`;
      }
      return "운동 배우기 세션을 마쳤습니다.";
    }

    if (isTimeBased) {
      const bestHoldSec = timeSummary?.bestHoldSec || state.bestHoldSec || 0;
      const targetSec = getCurrentTargetSec();
      if (bestHoldSec >= targetSec && targetSec > 0) {
        return `목표 ${targetSec}초를 달성했습니다. 최고 ${bestHoldSec}초를 유지했어요.`;
      }
      if (bestHoldSec > 0 && targetSec > 0) {
        return `최고 ${bestHoldSec}초 유지했습니다. 목표 ${targetSec}초까지 조금 더 도전해보세요.`;
      }
      return "플랭크 자세를 안정적으로 유지해보세요.";
    }

    if (state.liveScore >= 80) {
      return "훌륭해요! 자세가 매우 좋습니다.";
    }
    if (state.liveScore >= 60) {
      return "좋아요! 조금만 더 신경쓰면 완벽해요.";
    }
    return "자세 교정이 필요합니다. 운동 배우기를 확인해보세요.";
  }

  /** 종료 확인 모달 표시 */
  function confirmExit() {
    if (state.phase === "PREPARING") {
      if (workoutData.mode === "ROUTINE") {
        window.location.href = "/routine";
      } else if (isLearnMode()) {
        window.location.href = "/learn";
      } else {
        window.location.href = "/workout/free";
      }
    } else {
      document.getElementById("exitModal").hidden = false;
    }
  }

  /** 종료 확인 모달 닫기 */
  function closeExitModal() {
    document.getElementById("exitModal").hidden = true;
  }

  /** 강제 종료 — 확인 없이 페이지 이탈 */
  function forceExit() {
    finishWorkout();
  }

  /**
   * 페이지 이탈/강제 종료 시 beacon으로 서버에 ABORTED 알림
   * navigator.sendBeacon() 사용해 페이지 언로드 중에도 전송 보장
   */
  function sendAbortBeacon(reason = "UNLOAD") {
    if (!state.sessionId || hasUnloadAbortSent || state.phase === "FINISHED") {
      return;
    }

    hasUnloadAbortSent = true;
    const learnCompletedSteps = Math.min(
      state.learnStepIndex,
      state.learnSteps.length,
    );
    const payload = JSON.stringify({
      reason,
      selected_view: state.selectedView,
      duration_sec: state.totalTime || 0,
      total_reps: isLearnMode()
        ? 0
        : isTimeBasedExercise()
          ? 0
          : state.currentRep || 0,
      total_result_value: isLearnMode()
        ? learnCompletedSteps
        : isTimeBasedExercise()
          ? state.bestHoldSec || 0
          : state.currentRep || 0,
      result_basis:
        isTimeBasedExercise() && !isLearnMode() ? "DURATION" : "REPS",
      target_sec: isTimeBasedExercise() ? getCurrentTargetSec() || null : null,
    });
    const url = `/api/workout/session/${state.sessionId}/abort`;

    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon(url, blob);
      return;
    }

    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  }

  // ── 페이지 이탈 처리: 세션 버퍼 localStorage 백업 + ABORTED beacon 전송 ──
  window.addEventListener("beforeunload", () => {
    if (
      state.phase === "WORKING" ||
      state.phase === "RESTING" ||
      state.phase === "PAUSED"
    ) {
      if (sessionBuffer) sessionBuffer.saveToStorage();
      sendAbortBeacon("UNLOAD");
    }
  });

  // ── 전역 노출: EJS 템플릿에서 onclick="startWorkout()" 등으로 호출 ──
  window.confirmExit = confirmExit;
  function initWorkoutOnboarding() {
    if (workoutData.mode === "ROUTINE") return;
    if (!workoutOnboardingGuide?.createWorkoutOnboardingController) return;
    if (!onboardingModal) return;

    const slides = workoutOnboardingGuide.getWorkoutOnboardingSlides({
      exerciseCode: workoutData.exercise?.code,
    });

    const controller = workoutOnboardingGuide.createWorkoutOnboardingController(
      {
        refs: {
          modal: onboardingModal,
          titleEl: onboardingTitleEl,
          progressEl: onboardingProgressEl,
          imageEl: onboardingImageEl,
          imagePlaceholderEl: onboardingImagePlaceholderEl,
          bulletsEl: onboardingBulletsEl,
          prevBtn: onboardingPrevBtn,
          nextBtn: onboardingNextBtn,
          closeBtn: onboardingCloseBtn,
        },
        slides,
      },
    );

    controller.open();
  }

  function syncVoiceFeedbackToggle() {
    ui.updateVoiceFeedbackToggle?.({
      enabled: voice?.isEnabled ? voice.isEnabled() : false,
      supported: voice?.isSupported ? voice.isSupported() : false,
    });
  }

  function setupVoiceFeedbackToggle() {
    syncVoiceFeedbackToggle();
    if (!voiceFeedbackToggle || !voice?.setEnabled) return;

    voiceFeedbackToggle.addEventListener("click", () => {
      const nextEnabled = !voice.isEnabled();
      voice.setEnabled(nextEnabled);
      syncVoiceFeedbackToggle();
    });
  }

  initWorkoutOnboarding();

  window.startWorkout = startWorkout;
  window.togglePause = togglePause;
  window.finishWorkout = finishWorkout;
  window.closeExitModal = closeExitModal;
  window.forceExit = forceExit;

  // ── 초기화: UI 바인딩 → 카메라 연결 → 세션 준비 완료 ──
  setupSourceSelectors();
  setupViewSelectors();
  setupPlankTargetControls();
  applyPreviewOrientation(selectedCameraSource);
  if (isPlankExerciseCode()) {
    if (workoutData.mode === "ROUTINE") {
      applyTargetSec(getCurrentTargetSec() || 0);
    } else {
      applyTargetSec(readTargetSecFromInput() || 30);
    }
  } else {
    syncPlankTargetUi();
  }
  if (isLearnMode()) {
    refreshLearnSteps({ resetProgress: true });
    updateLearnModeDisplay();
  }
  updatePrimaryCounterDisplay();
  syncDisplayedSetCount();
  updateRoutineStepDisplay();
  updatePlankRuntimeDisplay(
    repCounter?.getTimeSummary ? repCounter.getTimeSummary() : null,
  );
  setupVoiceFeedbackToggle();
  await connectCameraSource(selectedCameraSource);
}

if (typeof window !== "undefined") {
  window.initSession = initSession;
}

// CommonJS test exports
if (typeof module !== "undefined") {
  module.exports = { initSession };
  Object.defineProperties(module.exports, {
    clearPoseOverlay: {
      value: clearPoseOverlay,
      enumerable: false,
    },
    resolveDisplayedSetCountOnPause: {
      value: resolveDisplayedSetCountOnPause,
      enumerable: false,
    },
  });
}
