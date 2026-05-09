/**
 * learn-step-engine.js
 *
 * 학습 모드(learn mode) 단계 평가에 쓰이는 순수 유틸리티.
 * - 체크리스트 UI용 데이터 정규화
 * - 단계 평가 객체(progress, passed, checks)의 통일된 형태
 * - “자세를 N ms 유지하면 통과” 홀드 타이머 상태 갱신
 *
 * DOM/세션에 의존하지 않으며 session-controller 등에서 import 해 사용합니다.
 */

/**
 * 학습 UI에서 사용할 숫자 값을 [min, max] 범위로 제한합니다.
 * NaN/비유한 값이면 min을 반환합니다.
 *
 * @param {number} value - 입력 값
 * @param {number} min - 하한
 * @param {number} max - 상한
 * @returns {number} 클램핑된 값
 */
function clampLearnValue(value, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, parsed));
}

/**
 * 원시 체크 항목 배열을 UI/평가에 안전한 형태로 정규화합니다.
 * - label: 비어 있으면 `체크 n` 형태의 기본 라벨
 * - progress: passed가 아니면 0~1로 클램프 (기본 진행률)
 * - 라벨이 전혀 없는 항목은 제거
 *
 * @param {Array<Object>} [checks=[]] - { label?, title?, id?, passed?, progress?, detail? }[]
 * @returns {Array<{ id: string, label: string, passed: boolean, progress: number, detail: string|null }>}
 */
function normalizeLearnChecks(checks = []) {
  if (!Array.isArray(checks)) return [];

  return checks
    .map((item, index) => {
      const label = String(item?.label || item?.title || `체크 ${index + 1}`).trim();
      const progress = item?.passed === true
        ? 1
        : clampLearnValue(item?.progress, 0, 1);

      return {
        id: String(item?.id || `check_${index + 1}`),
        label,
        passed: item?.passed === true,
        progress,
        detail: typeof item?.detail === 'string' ? item.detail.trim() : null,
      };
    })
    .filter((item) => item.label);
}

/**
 * 운동 모듈이 반환한 한 스텝 평가 객체를 공통 형식으로 만듭니다.
 * - checks: normalizeLearnChecks 적용
 * - progress: 명시값이 없으면 체크별 (passed면 1, 아니면 progress) 평균
 * - 전체 passed가 true면 progress를 1로 고정
 *
 * @param {Object|null} [rawEvaluation=null] - { passed?, progress?, checks?, feedback?, status? }
 * @returns {{
 *   passed: boolean,
 *   progress: number,
 *   checks: ReturnType<typeof normalizeLearnChecks>,
 *   feedback: string|null,
 *   status: string|null
 * }}
 */
function normalizeLearnStepEvaluation(rawEvaluation = null) {
  const checks = normalizeLearnChecks(rawEvaluation?.checks || []);
  const derivedProgress = checks.length > 0
    ? (checks.reduce((sum, item) => sum + (item.passed ? 1 : item.progress), 0) / checks.length)
    : 0;
  const progress = rawEvaluation?.passed === true
    ? 1
    : clampLearnValue(
      rawEvaluation?.progress != null ? rawEvaluation.progress : derivedProgress,
      0,
      1,
    );

  return {
    passed: rawEvaluation?.passed === true,
    progress,
    checks,
    feedback: typeof rawEvaluation?.feedback === 'string' ? rawEvaluation.feedback.trim() : null,
    status: typeof rawEvaluation?.status === 'string' ? rawEvaluation.status.trim() : null,
  };
}

/**
 * “자세 유지 시간” 홀드 누적 상태를 한 프레임만큼 갱신합니다.
 * - passed가 false면 누적 시간을 0으로 리셋 (조건을 놓치면 처음부터)
 * - deltaMs는 0~200ms로 상한 (프레임 튀는 경우 완화)
 * - holdMs가 0이면 즉시 완료로 간 처리 (타깃 없음)
 *
 * @param {Object} params
 * @param {number} [params.currentHoldMs=0] - 현재까지 누적된 유지 시간(ms)
 * @param {number} [params.deltaMs=0] - 이번 프레임 경과(ms)
 * @param {number} [params.holdMs=0] - 통과에 필요한 목표 유지 시간(ms)
 * @param {boolean} [params.passed=false] - 이번 프레임에 자세 조건 충족 여부
 * @returns {{ holdMs: number, holdProgress: number, completed: boolean }}
 *   holdProgress: 0~1, completed: 목표 시간까지 조건 유지로 통과
 */
function updateLearnHoldState({
  currentHoldMs = 0,
  deltaMs = 0,
  holdMs = 0,
  passed = false,
}) {
  const safeTargetMs = Math.max(0, Math.round(Number(holdMs) || 0));
  // 한 프레임이 비정상적으로 길게 잡히면 홀드가 순식간에 찰 수 있어 상한 둠
  const safeDeltaMs = Math.max(0, Math.min(200, Math.round(Number(deltaMs) || 0)));
  const nextHoldMs = passed
    ? Math.max(0, currentHoldMs + safeDeltaMs)
    : 0;

  if (safeTargetMs === 0) {
    // 목표 시간 0 → "즉시 통과" 모드 (스텝이 홀드 없이 체크만 할 때)
    return {
      holdMs: passed ? 0 : 0,
      holdProgress: passed ? 1 : 0,
      completed: passed,
    };
  }

  return {
    holdMs: nextHoldMs,
    holdProgress: clampLearnValue(nextHoldMs / safeTargetMs, 0, 1),
    completed: passed && nextHoldMs >= safeTargetMs,
  };
}

/** 학습 스텝 엔진에서 노출하는 순수 함수 묶음 */
const LearnStepEngine = {
  clampLearnValue,
  normalizeLearnChecks,
  normalizeLearnStepEvaluation,
  updateLearnHoldState,
};

if (typeof window !== 'undefined') {
  window.LearnStepEngine = LearnStepEngine;
}

if (typeof module !== 'undefined') {
  module.exports = LearnStepEngine;
}
