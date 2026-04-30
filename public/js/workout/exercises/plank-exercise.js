/* EXERCISE_MANIFEST
{
  "code": "PLANK",
  "name": "플랭크",
  "description": "코어 안정성과 자세 유지 능력을 평가하는 시간 기반 운동",
  "default_target_type": "TIME",
  "allowed_views": ["SIDE"],
  "default_view": "SIDE",
  "sort_order": 30,
  "is_active": false
}
*/
/**
 * 플랭크 전용 자세 게이트/시간 기반 점수 보조
 */
(function registerPlankExerciseModule() {
  const registry = typeof window !== 'undefined' ? window.WorkoutExerciseRegistry : null;
  if (!registry) return;

  const plankExercise = {
    code: 'plank',

    getDefaultProfileMetrics() {
      return [
        {
          weight: 0.3,
          max_score: 30,
          rule: {
            ideal_min: 150,
            ideal_max: 180,
            acceptable_min: 130,
            acceptable_max: 180,
            feedback_low: '골반이 처지지 않게 머리부터 발끝까지 일직선을 유지해주세요'
          },
          metric: {
            metric_id: 'plank_body_line',
            key: 'hip_angle',
            title: '몸통 일직선',
            unit: 'DEG'
          }
        },
        {
          weight: 0.25,
          max_score: 25,
          rule: {
            ideal_min: 70,
            ideal_max: 105,
            acceptable_min: 55,
            acceptable_max: 120,
            feedback_low: '상체가 너무 들리지 않게 몸통을 바닥과 평행하게 맞춰주세요',
            feedback_high: '허리가 꺾이지 않도록 코어에 힘을 주세요'
          },
          metric: {
            metric_id: 'plank_spine_stability',
            key: 'spine_angle',
            title: '몸통 수평 유지',
            unit: 'DEG'
          }
        },
        {
          weight: 0.15,
          max_score: 15,
          rule: {
            ideal_min: 55,
            ideal_max: 105,
            acceptable_min: 40,
            acceptable_max: 125,
            feedback_low: '어깨가 팔 지지선 위에 오도록 위치를 다시 맞춰주세요',
            feedback_high: '어깨가 너무 앞으로 나가지 않게 팔과 수직에 가깝게 맞춰주세요'
          },
          metric: {
            metric_id: 'plank_shoulder_stack',
            key: 'shoulder_angle',
            title: '어깨 지지 정렬',
            unit: 'DEG'
          }
        },
        {
          weight: 0.15,
          max_score: 15,
          rule: {
            type: 'threshold',
            value: 60,
            direction: 'gte',
            feedback_low: '팔꿈치가 몸 아래로 너무 말리지 않게 전완과 상완 각도를 조금 더 열어주세요'
          },
          metric: {
            metric_id: 'plank_elbow_support',
            key: 'elbow_support_angle',
            title: '팔 지지 각도',
            unit: 'DEG'
          }
        },
        {
          weight: 0.15,
          max_score: 15,
          rule: {
            ideal_min: 160,
            ideal_max: 180,
            acceptable_min: 145,
            acceptable_max: 180,
            feedback_low: '무릎을 굽히지 말고 다리를 길게 펴서 버텨주세요'
          },
          metric: {
            metric_id: 'plank_leg_extension',
            key: 'knee_angle',
            title: '다리 펴기',
            unit: 'DEG'
          }
        }
      ];
    },

    getLearnSteps() {
      return createLearnSteps();
    },

    getFrameGate(angles, runtime) {
      const quality = angles?.quality || {};
      const view = angles?.view || 'UNKNOWN';
      const selectedView = runtime?.selectedView || runtime?.state?.selectedView || null;
      const trackedJointRatio = quality.trackedJointRatio ?? 0;
      const inFrameRatio = quality.inFrameRatio ?? 0;
      const score = quality.score ?? 0;
      const hipAngle = runtime?.repCounter?.getAngleValue ? runtime.repCounter.getAngleValue(angles, 'hip_angle') : null;
      const spineAngle = runtime?.repCounter?.getAngleValue ? runtime.repCounter.getAngleValue(angles, 'spine_angle') : null;
      const kneeAngle = runtime?.repCounter?.getAngleValue ? runtime.repCounter.getAngleValue(angles, 'knee_angle') : null;

      if (!Number.isFinite(hipAngle) || !Number.isFinite(spineAngle) || !Number.isFinite(kneeAngle)) {
        return {
          isReady: false,
          reason: 'joints_missing',
          message: '어깨, 골반, 무릎, 발목이 모두 보이도록 카메라를 맞춰주세요'
        };
      }

      if (trackedJointRatio < 0.7) {
        return {
          isReady: false,
          reason: 'tracked_joints_low',
          message: '전신이 잘 보이도록 카메라를 조금 더 멀리 두세요'
        };
      }

      if (inFrameRatio < 0.72) {
        return {
          isReady: false,
          reason: 'out_of_frame',
          message: '머리부터 발끝까지 프레임 안에 들어오도록 위치를 조정해주세요'
        };
      }

      if (view === 'UNKNOWN') {
        return {
          isReady: false,
          reason: 'view_unknown',
          message: '플랭크는 측면 자세에서만 채점합니다. 몸을 옆으로 돌려주세요'
        };
      }

      if (selectedView && view !== selectedView) {
        return {
          isReady: false,
          reason: 'view_mismatch',
          message: '플랭크는 측면 자세에서만 채점합니다. 몸을 측면으로 유지해주세요'
        };
      }

      if (score < 0.55) {
        return {
          isReady: false,
          reason: 'quality_low',
          message: '카메라 위치와 조명을 조정하고 다시 자세를 잡아주세요'
        };
      }

      return { isReady: true };
    },

    filterLiveFeedback(scoreResult) {
      if (!scoreResult?.breakdown?.length) {
        return scoreResult;
      }

      const normalizedScore = calculateNormalizedLiveScore(scoreResult.breakdown);
      const prioritized = scoreResult.breakdown
        .slice()
        .sort((a, b) => {
          const left = (a.score || 0) / (a.maxScore || 1);
          const right = (b.score || 0) / (b.maxScore || 1);
          return left - right;
        })
        .slice(0, 3);

      return {
        ...scoreResult,
        score: normalizedScore,
        breakdown: prioritized
      };
    }
  };

  function calculateNormalizedLiveScore(breakdown) {
    let scoreSum = 0;
    let maxScoreSum = 0;

    for (const item of breakdown || []) {
      const score = Number(item?.score);
      const maxScore = Number(item?.maxScore);
      if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) {
        continue;
      }

      scoreSum += Math.max(0, Math.min(maxScore, score));
      maxScoreSum += maxScore;
    }

    if (maxScoreSum <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((scoreSum / maxScoreSum) * 100)));
  }

  function readMetric(scoringEngine, angles, metricKey) {
    if (!scoringEngine?.getMetricValue) return null;
    return scoringEngine.getMetricValue(angles, metricKey);
  }

  function createCheck(label, passed, progress = null) {
    return {
      label,
      passed: passed === true,
      progress: Number.isFinite(progress)
        ? Math.max(0, Math.min(1, progress))
        : (passed ? 1 : 0),
    };
  }

  function buildLearnEvaluation(checks, feedback = null, status = null) {
    const safeChecks = Array.isArray(checks) ? checks.filter(Boolean) : [];
    const progress = safeChecks.length > 0
      ? safeChecks.reduce((sum, item) => sum + (item.passed ? 1 : (Number(item.progress) || 0)), 0) / safeChecks.length
      : 0;

    return {
      passed: safeChecks.length > 0 && safeChecks.every((item) => item.passed),
      progress,
      checks: safeChecks,
      feedback,
      status,
    };
  }

  function createLearnSteps() {
    return [
      {
        id: 'plank_setup',
        badge: '준비 자세',
        title: '팔 지지선 맞추기',
        instruction: '팔꿈치가 어깨 아래에 오도록 두고 측면 자세를 먼저 안정적으로 맞춰주세요.',
        hintLines: [
          '카메라에는 몸의 옆면이 잘 보이게 서주세요.',
          '전완으로 바닥을 밀면서 어깨를 가볍게 띄워주세요.',
        ],
        holdMs: 800,
        successMessage: '좋아요. 이제 몸통을 더 길게 펴볼게요.',
        evaluate({ angles, scoringEngine }) {
          const shoulderAngle = readMetric(scoringEngine, angles, 'shoulder_angle');
          const elbowSupportAngle = readMetric(scoringEngine, angles, 'elbow_support_angle');
          const spineAngle = readMetric(scoringEngine, angles, 'spine_angle');

          return buildLearnEvaluation([
            createCheck('어깨와 팔 지지선이 맞고 있어요', Number.isFinite(shoulderAngle) && shoulderAngle >= 50 && shoulderAngle <= 115),
            createCheck('팔꿈치 지지 각도가 안정적이에요', Number.isFinite(elbowSupportAngle) && elbowSupportAngle >= 58),
            createCheck('상체를 무너지지 않게 세웠어요', Number.isFinite(spineAngle) && spineAngle >= 55 && spineAngle <= 125),
          ], '팔꿈치가 어깨 아래에 오도록 조금만 더 위치를 맞춰주세요');
        },
      },
      {
        id: 'plank_body_line',
        badge: '몸통 정렬',
        title: '머리부터 골반까지 일직선 만들기',
        instruction: '배에 힘을 주고 골반이 처지지 않게 몸통을 길게 펴주세요.',
        hintLines: [
          '허리가 꺾이지 않게 배와 엉덩이에 힘을 주세요.',
          '목을 들기보다 몸 전체를 길게 만든다는 느낌을 가져가세요.',
        ],
        holdMs: 900,
        successMessage: '좋아요. 이제 다리까지 길게 뻗어 완성해볼게요.',
        evaluate({ angles, scoringEngine }) {
          const hipAngle = readMetric(scoringEngine, angles, 'hip_angle');
          const spineAngle = readMetric(scoringEngine, angles, 'spine_angle');
          const shoulderAngle = readMetric(scoringEngine, angles, 'shoulder_angle');

          return buildLearnEvaluation([
            createCheck('몸통이 일직선에 가까워요', Number.isFinite(hipAngle) && hipAngle >= 150),
            createCheck('허리와 등이 크게 꺾이지 않았어요', Number.isFinite(spineAngle) && spineAngle >= 60 && spineAngle <= 115),
            createCheck('어깨 지지 정렬을 유지하고 있어요', Number.isFinite(shoulderAngle) && shoulderAngle >= 50 && shoulderAngle <= 115),
          ], '골반이 내려가지 않게 배에 힘을 조금 더 주세요');
        },
      },
      {
        id: 'plank_leg_extension',
        badge: '다리 정렬',
        title: '다리까지 길게 펴기',
        instruction: '무릎을 굽히지 말고 뒤꿈치를 멀리 보낸다는 느낌으로 다리를 펴주세요.',
        hintLines: [
          '발끝으로 바닥을 밀어내며 다리를 길게 유지하세요.',
          '몸통 정렬이 무너지지 않는 범위에서 다리만 더 뻗어주세요.',
        ],
        holdMs: 900,
        successMessage: '좋아요. 이제 완성 자세를 잠깐 유지해볼게요.',
        evaluate({ angles, scoringEngine }) {
          const hipAngle = readMetric(scoringEngine, angles, 'hip_angle');
          const kneeAngle = readMetric(scoringEngine, angles, 'knee_angle');
          const elbowSupportAngle = readMetric(scoringEngine, angles, 'elbow_support_angle');

          return buildLearnEvaluation([
            createCheck('다리를 길게 펴고 있어요', Number.isFinite(kneeAngle) && kneeAngle >= 155),
            createCheck('몸통 정렬을 유지하고 있어요', Number.isFinite(hipAngle) && hipAngle >= 150),
            createCheck('팔 지지선이 계속 안정적이에요', Number.isFinite(elbowSupportAngle) && elbowSupportAngle >= 58),
          ], '무릎을 살짝 더 펴고 발끝을 뒤로 길게 보내주세요');
        },
      },
      {
        id: 'plank_hold',
        badge: '유지',
        title: '완성 자세 유지하기',
        instruction: '지금 만든 자세를 그대로 유지하며 잠시 버텨보세요.',
        hintLines: [
          '골반 높이를 유지한 채 짧게 호흡하세요.',
          '전완과 발끝으로 바닥을 밀며 몸통을 단단하게 유지하세요.',
        ],
        holdMs: 2500,
        successMessage: '좋아요. 플랭크 학습을 완료했습니다.',
        evaluate({ angles, scoringEngine }) {
          const hipAngle = readMetric(scoringEngine, angles, 'hip_angle');
          const spineAngle = readMetric(scoringEngine, angles, 'spine_angle');
          const elbowSupportAngle = readMetric(scoringEngine, angles, 'elbow_support_angle');
          const kneeAngle = readMetric(scoringEngine, angles, 'knee_angle');

          return buildLearnEvaluation([
            createCheck('몸통 일직선을 유지하고 있어요', Number.isFinite(hipAngle) && hipAngle >= 150),
            createCheck('허리와 등 높이가 안정적이에요', Number.isFinite(spineAngle) && spineAngle >= 60 && spineAngle <= 115),
            createCheck('팔 지지선이 흔들리지 않아요', Number.isFinite(elbowSupportAngle) && elbowSupportAngle >= 60),
            createCheck('다리를 끝까지 펴고 있어요', Number.isFinite(kneeAngle) && kneeAngle >= 155),
          ], '골반이 내려가지 않게 코어 힘을 유지한 채 조금만 더 버텨주세요');
        },
      },
    ];
  }

  registry.register('plank', plankExercise);
})();
