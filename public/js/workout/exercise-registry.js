/**
 * exercise-registry.js
 *
 * 운동별 로직 모듈을 등록하고 조회하는 전역 레지스트리.
 * 각 운동 모듈(squat-exercise.js, push-up-exercise.js, plank-exercise.js 등)은
 * 로드 시 자신을 이 레지스트리에 등록합니다.
 * RepCounter, ScoringEngine 등에서 운동 코드로 모듈을 조회하여 사용합니다.
 */
(function initWorkoutExerciseRegistry() {
  const existing = window.WorkoutExerciseRegistry || {};
  const registry = existing.registry || Object.create(null);

  /**
   * 운동 코드를 레지스트리 키 형태로 정규화합니다.
   * - 앞뒤 공백 제거, 소문자 변환
   * - 하이픈(-)을 언더스코어(_)로 통일 (예: push-up → push_up과 호환 목적)
   * 빈 문자열은 빈 문자열로 남습니다.
   *
   * @param {string|undefined|null} code - API/DB에서 온 운동 코드
   * @returns {string} 정규화된 코드
   */
  function normalizeExerciseCode(code) {
    return (code || '')
      .toString()
      .trim()
      .toLowerCase()
      .replace(/-/g, '_');
  }

  /**
   * 운동 모듈을 레지스트리에 등록합니다.
   * @param {string} code - 운동 코드 (예: 'squat', 'push_up')
   * @param {Object} exerciseModule - 운동 로직 모듈
   */
  function register(code, exerciseModule) {
    const normalized = normalizeExerciseCode(code);
    if (!normalized || !exerciseModule) return;
    // 이후 조회는 항상 정규화된 키로만 이뤄짐
    registry[normalized] = exerciseModule;
  }

  /**
   * 운동 코드로 등록된 모듈을 조회합니다.
   * @param {string} code - 운동 코드
   * @returns {Object|null} 운동 모듈 또는 null
   */
  function get(code) {
    const normalized = normalizeExerciseCode(code);
    // 빈 코드면 조회 비용 없이 null (잘못된 호출 방어)
    return normalized ? registry[normalized] || null : null;
  }

  window.WorkoutExerciseRegistry = {
    registry,
    normalizeExerciseCode,
    register,
    get,
    /**
     * 해당 운동 코드에 대응하는 모듈이 등록되어 있는지 확인합니다.
     * 내부적으로 normalizeExerciseCode 후 registry 조회만 수행합니다.
     *
     * @param {string} code - 운동 코드
     * @returns {boolean} 등록 여부
     */
    has(code) {
      return Boolean(get(code));
    }
  };
})();
