/* EXERCISE_MANIFEST
{
  "code": "PUSH_UP",
  "name": "푸쉬업",
  "description": "상체운동의 기본 푸쉬업",
  "default_target_type": "REPS",
  "allowed_views": ["SIDE"],
  "default_view": "SIDE",
  "sort_order": 20
}
*/
/**
 * 푸쉬업 전용 rep 추적/채점/품질 게이트
 */
(function registerPushUpExerciseModule() {
  const registry = typeof window !== 'undefined' ? window.WorkoutExerciseRegistry : null;
  if (!registry) return;

  const REP_PHASES = {
    NEUTRAL: 'NEUTRAL',
    DESCENT: 'DESCENT',
    BOTTOM: 'BOTTOM',
    ASCENT: 'ASCENT',
    LOCKOUT: 'LOCKOUT'
  };
  const SCORING_PHASES = [REP_PHASES.DESCENT, REP_PHASES.BOTTOM, REP_PHASES.ASCENT, REP_PHASES.LOCKOUT];

  const pushUpExercise = {
    code: 'push_up',

    /**
     * Declarative requirement metadata consumed by the common quality gate.
     * Spec §4.2 — exercise modules provide requirements as data, not as decision logic.
     */
    requirements: {
      requiredViews: ['SIDE'],
      importantJoints: [
        'left_shoulder', 'right_shoulder',
        'left_elbow', 'right_elbow',
        'left_hip', 'right_hip',
        'left_knee', 'right_knee',
        'left_ankle', 'right_ankle',
      ],
      minJointVisibility: 0.40,
    },

    getDefaultProfileMetrics() {
      return [
        {
          weight: 0.35,
          max_score: 35,
          rule: {
            ideal_min: 70,
            ideal_max: 100,
            acceptable_min: 55,
            acceptable_max: 120,
            feedback_high: '가슴을 조금 더 내려주세요'
          },
          metric: {
            metric_id: 'pushup_depth',
            key: 'elbow_depth',
            title: '푸쉬업 깊이',
            unit: 'DEG'
          }
        },
        {
          weight: 0.25,
          max_score: 25,
          rule: {
            ideal_min: 150,
            ideal_max: 180,
            acceptable_min: 135,
            acceptable_max: 180,
            feedback_low: '올라올 때 팔을 끝까지 펴주세요'
          },
          metric: {
            metric_id: 'pushup_lockout',
            key: 'elbow_lockout',
            title: '팔 펴기',
            unit: 'DEG'
          }
        },
        {
          weight: 0.25,
          max_score: 25,
          rule: {
            ideal_min: 155,
            ideal_max: 180,
            acceptable_min: 140,
            acceptable_max: 180,
            feedback_low: '엉덩이가 처지지 않게 몸을 일직선으로 유지해주세요'
          },
          metric: {
            metric_id: 'pushup_body_line',
            key: 'hip_angle',
            title: '몸통 일직선',
            unit: 'DEG'
          }
        },
        {
          weight: 0.15,
          max_score: 15,
          rule: {
            ideal_min: 55,
            ideal_max: 105,
            acceptable_min: 35,
            acceptable_max: 125,
            feedback_low: '머리부터 골반까지 같은 각도로 움직여주세요',
            feedback_high: '머리부터 골반까지 같은 각도로 움직여주세요'
          },
          metric: {
            metric_id: 'pushup_torso_angle',
            key: 'spine_angle',
            title: '상체 각도',
            unit: 'DEG'
          }
        },
        {
          weight: 0.1,
          max_score: 10,
          rule: { type: 'hold' },
          metric: {
            metric_id: 'pushup_torso_stability',
            key: 'spine_stability',
            title: '상체 안정성',
            unit: 'DEG'
          }
        },
        {
          weight: 0.1,
          max_score: 10,
          rule: { type: 'tempo' },
          metric: {
            metric_id: 'pushup_tempo',
            key: 'tempo',
            title: '동작 템포',
            unit: 'MS'
          }
        }
      ];
    },

    getLearnSteps() {
      return createLearnSteps();
    },

    getRepPattern() {
      return {
        primaryAngle: 'elbow_angle',
        thresholds: {
          neutral: 155,
          active: 95
        },
        direction: 'decrease',
        minDuration: 700,
        minActiveTime: 180
      };
    },

    startRepTracking(repCounter, now) {
      repCounter.currentPhase = REP_PHASES.NEUTRAL;
      repCounter.currentRepSummary = createRepSummary(repCounter, now);
      repCounter.repLastFrameTime = now;
      repCounter.bottomStableFrames = 0;
      repCounter.bottomReached = false;
      repCounter.ascentStarted = false;
    },

    resetRepTracking(repCounter) {
      repCounter.currentPhase = REP_PHASES.NEUTRAL;
      repCounter.currentRepSummary = null;
      repCounter.repLastFrameTime = null;
      repCounter.bottomStableFrames = 0;
      repCounter.bottomReached = false;
      repCounter.ascentStarted = false;
    },

    updateRepTracking(repCounter, angles, now, primaryAngle, currentScore) {
      if (!repCounter.currentRepSummary) {
        this.startRepTracking(repCounter, now);
      }

      const phase = detectPhase(repCounter, angles, primaryAngle);
      const deltaMs = repCounter.repLastFrameTime != null
        ? Math.max(0, Math.min(now - repCounter.repLastFrameTime, 120))
        : 0;

      repCounter.repLastFrameTime = now;
      repCounter.currentPhase = phase;

      const snapshot = getSnapshot(repCounter, angles, primaryAngle);
      recordFrame(repCounter, phase, deltaMs, snapshot);

      if (SCORING_PHASES.includes(phase) && Number.isFinite(currentScore)) {
        repCounter.currentMovementScores.push(currentScore);
      }
    },

    finalizeRepSummary(repCounter) {
      if (!repCounter.currentRepSummary) return null;

      const summary = repCounter.currentRepSummary;
      const confidenceScore = getScoringPhaseConfidence(summary);

      return {
        exerciseCode: summary.exerciseCode,
        durationMs: Math.round(summary.durationMs),
        finalPhase: summary.finalPhase,
        flags: summary.flags,
        dominantView: repCounter.getDominantBucketKey(summary.views),
        views: summary.views,
        confidence: {
          score: Math.round(confidenceScore * 100) / 100,
          level: repCounter.getConfidenceLevel(confidenceScore),
          factor: repCounter.getConfidenceFactor(confidenceScore),
          levels: summary.quality.levels
        },
        overall: finalizePhaseSummary(repCounter, summary.overall),
        phases: Object.fromEntries(
          Object.entries(summary.phases).map(([phase, phaseSummary]) => [phase, finalizePhaseSummary(repCounter, phaseSummary)])
        )
      };
    },

    scoreRep(scoringEngine, repRecord) {
      const summary = repRecord?.summary;
      if (!summary) return repRecord;

      const requestedView = repRecord?.selectedView || null;
      const view = requestedView && requestedView !== 'DIAGONAL'
        ? requestedView
        : (summary.dominantView || 'UNKNOWN');
      const confidence = summary.confidence || { score: 0, level: 'LOW', factor: 0.7 };

      const bottomElbow = scoringEngine.pickMetric(summary, ['BOTTOM', 'DESCENT'], 'elbowAngle', 'min');
      const lockoutElbow = scoringEngine.pickMetric(summary, ['LOCKOUT', 'ASCENT'], 'elbowAngle', 'max');
      const minHip = scoringEngine.pickMetric(summary, ['DESCENT', 'BOTTOM', 'ASCENT'], 'hipAngle', 'min');
      const spineRange = getMetricRange(summary, ['DESCENT', 'BOTTOM', 'ASCENT'], 'spineAngle');
      const duration = Number.isFinite(repRecord?.duration) ? repRecord.duration : summary.durationMs;

      const hardFails = [];
      // Note: view_mismatch and low_confidence are gate-owned reasons (spec §3.2).
      // The common quality gate in scoring-engine.js handles these BEFORE exercise
      // evaluation runs, so they cannot reach this code path.
      if (!summary.flags?.bottomReached || bottomElbow == null || bottomElbow > 110) {
        hardFails.push('depth_not_reached');
      }
      if (!summary.flags?.lockoutReached || (lockoutElbow != null && lockoutElbow < 145)) {
        hardFails.push('lockout_incomplete');
      }
      if (minHip != null && minHip < 140) {
        hardFails.push('body_line_broken');
      }

      const metricPlan = getMetricPlan({
        bottomElbow,
        lockoutElbow,
        minHip,
        spineRange,
        duration
      });
      const breakdown = [];
      let weightedScore = 0;
      let totalWeight = 0;

      for (const item of metricPlan) {
        const normalizedScore = item.scorer();
        if (!Number.isFinite(normalizedScore)) continue;

        const metric = scoringEngine.getProfileMetricConfig(item.key, item.title, item.maxScore);
        const score = Math.round((normalizedScore / 100) * metric.maxScore);
        breakdown.push({
          metric_id: metric.metric_id,
          key: item.key,
          title: metric.title,
          rawValue: item.rawValue(),
          score,
          normalizedScore: Math.round(normalizedScore * 100) / 100,
          maxScore: metric.maxScore,
          weight: item.weight,
          feedback: normalizedScore < 70 ? item.feedback : null
        });

        weightedScore += normalizedScore * item.weight;
        totalWeight += item.weight;
      }

      const baseScore = totalWeight > 0 ? (weightedScore / totalWeight) : (repRecord.score || 0);
      let finalScore = baseScore * (confidence.factor || 0.7);

      if (hardFails.includes('depth_not_reached')) {
        finalScore = Math.min(finalScore, 55);
      }
      if (hardFails.includes('lockout_incomplete')) {
        finalScore = Math.min(finalScore, 65);
      }
      if (hardFails.includes('body_line_broken')) {
        finalScore = Math.min(finalScore, 60);
      }

      finalScore = Math.max(0, Math.min(100, Math.round(finalScore)));

      const softFails = breakdown
        .filter((item) => item.maxScore > 0 && (item.score / item.maxScore) < 0.7)
        .map((item) => item.key);

      const feedback = pickFeedback({
        hardFails,
        breakdown,
        confidence,
        minHip,
        spineRange
      });

      console.log('[ScoringEngine][PushUp] Rep evaluation:', {
        repNumber: repRecord.repNumber,
        scoreBeforeRepScoring: repRecord.score,
        finalScore,
        view,
        confidenceLevel: confidence.level,
        confidenceScore: confidence.score,
        bottomElbow,
        lockoutElbow,
        minHip,
        spineRange,
        duration,
        hardFails,
        softFails,
        feedback
      });

      return {
        ...repRecord,
        score: finalScore,
        breakdown,
        feedback,
        hardFails,
        softFails,
        view,
        confidence,
        summary: {
          ...summary,
          finalScore,
          feedback,
          hardFails,
          softFails,
          dominantView: view,
          confidence
        }
      };
    },

    filterLiveFeedback(scoreResult, runtime) {
      return this.prepareLiveScoreResult(scoreResult, runtime);
    },

    prepareLiveScoreResult(scoreResult, runtime) {
      if (!scoreResult?.breakdown?.length) {
        return scoreResult;
      }

      const phase = runtime?.repCounter?.currentPhase || REP_PHASES.NEUTRAL;
      const currentState = runtime?.repCounter?.currentState || window.REP_STATES?.NEUTRAL;
      const livePhase = getLivePhase(currentState, phase);
      const breakdown = scoreResult.breakdown.filter((item) => shouldKeepLiveMetric(item.key, livePhase));

      if (breakdown.length === scoreResult.breakdown.length) {
        return scoreResult;
      }

      if (breakdown.length === 0) {
        return {
          ...scoreResult,
          breakdown: []
        };
      }

      return {
        ...scoreResult,
        score: calculateLiveScore(breakdown, scoreResult.score),
        breakdown
      };
    },

    shouldAccumulateRepMetrics(runtime) {
      const phase = runtime?.repCounter?.currentPhase;
      return SCORING_PHASES.includes(phase);
    }
  };

  function detectPhase(repCounter, angles, primaryAngle) {
    const hipAngle = repCounter.getAngleValue(angles, 'hip_angle');
    const delta = repCounter.previousPrimaryAngle == null ? 0 : (primaryAngle - repCounter.previousPrimaryAngle);
    const nearBottom = primaryAngle <= ((repCounter.pattern.thresholds.active || 95) + 8);
    const nearLockout = primaryAngle >= ((repCounter.pattern.thresholds.neutral || 155) - 10) &&
      (hipAngle == null || hipAngle >= 145);
    const movingDown = delta <= -1.5;
    const movingUp = delta >= 1.5;

    if (repCounter.currentState === window.REP_STATES?.NEUTRAL) {
      return (repCounter.bottomReached || repCounter.ascentStarted) ? REP_PHASES.LOCKOUT : REP_PHASES.NEUTRAL;
    }

    if (!repCounter.bottomReached) {
      if (nearBottom) {
        repCounter.bottomStableFrames = Math.abs(delta) <= 2 ? repCounter.bottomStableFrames + 1 : 1;
        if (repCounter.bottomStableFrames >= 2 || (!movingDown && repCounter.currentState === window.REP_STATES?.ACTIVE)) {
          repCounter.bottomReached = true;
          return REP_PHASES.BOTTOM;
        }
      } else {
        repCounter.bottomStableFrames = 0;
      }

      return REP_PHASES.DESCENT;
    }

    if (!repCounter.ascentStarted) {
      if (movingUp || repCounter.currentState !== window.REP_STATES?.ACTIVE) {
        repCounter.ascentStarted = true;
        return nearLockout ? REP_PHASES.LOCKOUT : REP_PHASES.ASCENT;
      }

      return REP_PHASES.BOTTOM;
    }

    if (nearLockout && repCounter.currentState === window.REP_STATES?.NEUTRAL) {
      return REP_PHASES.LOCKOUT;
    }

    return REP_PHASES.ASCENT;
  }

  function createRepSummary(repCounter, startedAt) {
    return {
      exerciseCode: 'push_up',
      startedAt,
      durationMs: 0,
      finalPhase: REP_PHASES.NEUTRAL,
      flags: {
        bottomReached: false,
        ascentStarted: false,
        lockoutReached: false
      },
      views: {
        FRONT: 0,
        SIDE: 0,
        UNKNOWN: 0
      },
      quality: {
        scoreSum: 0,
        count: 0,
        levels: {
          HIGH: 0,
          MEDIUM: 0,
          LOW: 0,
          UNKNOWN: 0
        }
      },
      overall: createPhaseSummary(repCounter),
      phases: {
        DESCENT: createPhaseSummary(repCounter),
        BOTTOM: createPhaseSummary(repCounter),
        ASCENT: createPhaseSummary(repCounter),
        LOCKOUT: createPhaseSummary(repCounter)
      }
    };
  }

  function createPhaseSummary(repCounter) {
    return {
      samples: 0,
      durationMs: 0,
      views: {
        FRONT: 0,
        SIDE: 0,
        UNKNOWN: 0
      },
      qualityLevels: {
        HIGH: 0,
        MEDIUM: 0,
        LOW: 0,
        UNKNOWN: 0
      },
      metrics: {
        elbowAngle: repCounter.createMetricStats(),
        hipAngle: repCounter.createMetricStats(),
        spineAngle: repCounter.createMetricStats(),
        shoulderAngle: repCounter.createMetricStats(),
        qualityScore: repCounter.createMetricStats()
      }
    };
  }

  function getSnapshot(repCounter, angles, primaryAngle) {
    const qualityScore = Number.isFinite(angles.quality?.score) ? angles.quality.score : null;

    return {
      elbowAngle: primaryAngle,
      hipAngle: repCounter.getAngleValue(angles, 'hip_angle'),
      spineAngle: repCounter.getAngleValue(angles, 'spine_angle'),
      shoulderAngle: repCounter.getAngleValue(angles, 'shoulder_angle'),
      qualityScore,
      view: angles.view || 'UNKNOWN',
      qualityLevel: angles.quality?.level || 'UNKNOWN'
    };
  }

  function incrementBucketValue(bucket, key) {
    const normalized = Object.prototype.hasOwnProperty.call(bucket, key) ? key : 'UNKNOWN';
    bucket[normalized]++;
  }

  function recordFrame(repCounter, phase, deltaMs, snapshot) {
    const summary = repCounter.currentRepSummary;
    if (!summary) return;

    const phaseSummary = summary.phases[phase];

    summary.durationMs += deltaMs;
    summary.finalPhase = phase;
    summary.flags.bottomReached = repCounter.bottomReached;
    summary.flags.ascentStarted = repCounter.ascentStarted;
    summary.flags.lockoutReached = summary.flags.lockoutReached || phase === REP_PHASES.LOCKOUT;

    incrementBucketValue(summary.views, snapshot.view);
    incrementBucketValue(summary.quality.levels, snapshot.qualityLevel);
    if (Number.isFinite(snapshot.qualityScore)) {
      summary.quality.scoreSum += snapshot.qualityScore;
      summary.quality.count++;
    }

    recordPhaseFrame(repCounter, summary.overall, deltaMs, snapshot);
    if (phaseSummary) {
      recordPhaseFrame(repCounter, phaseSummary, deltaMs, snapshot);
    }
  }

  function recordPhaseFrame(repCounter, target, deltaMs, snapshot) {
    target.samples++;
    target.durationMs += deltaMs;
    incrementBucketValue(target.views, snapshot.view);
    incrementBucketValue(target.qualityLevels, snapshot.qualityLevel);

    repCounter.updateMetricStats(target.metrics.elbowAngle, snapshot.elbowAngle);
    repCounter.updateMetricStats(target.metrics.hipAngle, snapshot.hipAngle);
    repCounter.updateMetricStats(target.metrics.spineAngle, snapshot.spineAngle);
    repCounter.updateMetricStats(target.metrics.shoulderAngle, snapshot.shoulderAngle);
    repCounter.updateMetricStats(target.metrics.qualityScore, snapshot.qualityScore);
  }

  function getScoringPhaseConfidence(summary) {
    let weightedSum = 0;
    let totalCount = 0;

    for (const phase of SCORING_PHASES) {
      const qualityStats = summary?.phases?.[phase]?.metrics?.qualityScore;
      if (!qualityStats || !Number.isFinite(qualityStats.sum) || !Number.isFinite(qualityStats.count) || qualityStats.count <= 0) {
        continue;
      }

      weightedSum += qualityStats.sum;
      totalCount += qualityStats.count;
    }

    if (totalCount > 0) {
      return weightedSum / totalCount;
    }

    return summary.quality.count > 0 ? summary.quality.scoreSum / summary.quality.count : 0;
  }

  function finalizePhaseSummary(repCounter, summary) {
    return {
      samples: summary.samples,
      durationMs: Math.round(summary.durationMs),
      views: summary.views,
      qualityLevels: summary.qualityLevels,
      metrics: Object.fromEntries(
        Object.entries(summary.metrics).map(([key, stats]) => [key, repCounter.finalizeMetricStats(stats)])
      )
    };
  }

  function getMetricRange(summary, phases, metricKey) {
    let min = null;
    let max = null;

    for (const phase of phases) {
      const stats = summary?.phases?.[phase]?.metrics?.[metricKey];
      if (!stats || stats.count <= 0) continue;
      if (Number.isFinite(stats.min)) {
        min = min == null ? stats.min : Math.min(min, stats.min);
      }
      if (Number.isFinite(stats.max)) {
        max = max == null ? stats.max : Math.max(max, stats.max);
      }
    }

    if (min == null || max == null) {
      const overall = summary?.overall?.metrics?.[metricKey];
      if (overall && overall.count > 0 && Number.isFinite(overall.min) && Number.isFinite(overall.max)) {
        return Math.round((overall.max - overall.min) * 10) / 10;
      }
      return null;
    }

    return Math.round((max - min) * 10) / 10;
  }

  function getMetricPlan(values) {
    return [
      {
        key: 'elbow_depth',
        title: '푸쉬업 깊이',
        maxScore: 35,
        weight: 0.35,
        scorer: () => scoreDepth(values.bottomElbow),
        rawValue: () => values.bottomElbow,
        feedback: '가슴을 조금 더 내려주세요'
      },
      {
        key: 'elbow_lockout',
        title: '팔 펴기',
        maxScore: 25,
        weight: 0.2,
        scorer: () => scoreLockout(values.lockoutElbow),
        rawValue: () => values.lockoutElbow,
        feedback: '올라올 때 팔을 끝까지 펴주세요'
      },
      {
        key: 'hip_angle',
        title: '몸통 일직선',
        maxScore: 25,
        weight: 0.25,
        scorer: () => scoreBodyLine(values.minHip),
        rawValue: () => values.minHip,
        feedback: '엉덩이가 처지지 않게 몸을 일직선으로 유지해주세요'
      },
      {
        key: 'spine_stability',
        title: '상체 안정성',
        maxScore: 10,
        weight: 0.1,
        scorer: () => scoreSpineRange(values.spineRange),
        rawValue: () => values.spineRange,
        feedback: '머리부터 골반까지 같은 각도로 움직여주세요'
      },
      {
        key: 'tempo',
        title: '동작 템포',
        maxScore: 10,
        weight: 0.1,
        scorer: () => scoreTempo(values.duration),
        rawValue: () => values.duration,
        feedback: '너무 급하게 하지 말고 일정한 속도로 반복해주세요'
      }
    ];
  }

  function scoreDepth(value) {
    if (!Number.isFinite(value)) return null;
    if (value <= 95) return 100;
    if (value <= 105) return interpolate(value, 95, 105, 100, 82);
    if (value <= 115) return interpolate(value, 105, 115, 82, 45);
    return 15;
  }

  function scoreLockout(value) {
    if (!Number.isFinite(value)) return null;
    if (value >= 160) return 100;
    if (value >= 150) return interpolate(value, 150, 160, 80, 100);
    if (value >= 145) return interpolate(value, 145, 150, 55, 80);
    return 20;
  }

  function scoreBodyLine(value) {
    if (!Number.isFinite(value)) return null;
    if (value >= 165) return 100;
    if (value >= 155) return interpolate(value, 155, 165, 80, 100);
    if (value >= 145) return interpolate(value, 145, 155, 45, 80);
    return 15;
  }

  function scoreSpineRange(value) {
    if (!Number.isFinite(value)) return null;
    if (value <= 8) return 100;
    if (value <= 15) return interpolate(value, 8, 15, 100, 80);
    if (value <= 25) return interpolate(value, 15, 25, 80, 45);
    return 20;
  }

  function scoreTempo(value) {
    if (!Number.isFinite(value)) return null;
    if (value >= 900 && value <= 2500) return 100;
    if (value >= 700 && value < 900) return interpolate(value, 700, 900, 70, 100);
    if (value > 2500 && value <= 3500) return interpolate(value, 2500, 3500, 100, 70);
    if (value >= 500 && value < 700) return interpolate(value, 500, 700, 35, 70);
    if (value > 3500 && value <= 5000) return interpolate(value, 3500, 5000, 70, 35);
    return 20;
  }

  function interpolate(value, inMin, inMax, outMin, outMax) {
    if (inMax === inMin) return outMax;
    const ratio = (value - inMin) / (inMax - inMin);
    return outMin + ((outMax - outMin) * ratio);
  }

  function pickFeedback({ hardFails, breakdown, confidence, minHip, spineRange }) {
    // Note: low_confidence and view_mismatch are gate-owned (spec §3.2).
    // The common quality gate handles these BEFORE exercise evaluation runs.
    if (hardFails.includes('depth_not_reached')) {
      return '가슴을 조금 더 내려주세요';
    }
    if (hardFails.includes('body_line_broken')) {
      return '엉덩이가 처지지 않게 몸을 일직선으로 유지해주세요';
    }
    if (hardFails.includes('lockout_incomplete')) {
      return '올라올 때 팔을 끝까지 펴주세요';
    }

    const worstMetric = breakdown
      .slice()
      .sort((a, b) => (a.score / (a.maxScore || 1)) - (b.score / (b.maxScore || 1)))[0];

    if (worstMetric?.feedback) {
      return worstMetric.feedback;
    }

    if (Number.isFinite(minHip) && minHip < 155) {
      return '엉덩이가 처지지 않게 몸을 일직선으로 유지해주세요';
    }
    if (Number.isFinite(spineRange) && spineRange > 15) {
      return '머리부터 골반까지 같은 각도로 움직여주세요';
    }

    return '좋아요! 같은 리듬으로 반복해보세요';
  }

  function getLivePhase(currentState, phase) {
    const isTopPhase = currentState === window.REP_STATES?.NEUTRAL ||
      phase === REP_PHASES.NEUTRAL ||
      phase === REP_PHASES.LOCKOUT;

    if (isTopPhase) return REP_PHASES.LOCKOUT;
    if (phase === REP_PHASES.DESCENT) return REP_PHASES.DESCENT;
    if (phase === REP_PHASES.BOTTOM) return REP_PHASES.BOTTOM;
    if (phase === REP_PHASES.ASCENT) return REP_PHASES.ASCENT;
    return REP_PHASES.DESCENT;
  }

  function shouldKeepLiveMetric(metricKey, phase) {
    const category = getMetricCategory(metricKey);
    if (category === 'other') return false;

    // 기본 평가는 모든 phase에 적용
    if (category === 'body' || category === 'torso') {
      return true;
    }

    // 완전히 내려갔을 때가 중요한 깊이 평가는 BOTTOM에서만 적용
    if (category === 'depth') {
      return phase === REP_PHASES.BOTTOM;
    }

    // 팔을 쭉 펴는 평가는 LOCKOUT에서만 적용
    if (category === 'lockout') {
      return phase === REP_PHASES.LOCKOUT;
    }

    return false;
  }

  function getMetricCategory(metricKey) {
    const key = (metricKey || '').toString().toLowerCase();
    if (!key) return 'other';

    if (key.includes('lockout')) return 'lockout';
    if (key.includes('depth')) return 'depth';
    if (key.includes('spine') || key.includes('torso')) return 'torso';
    if (key.includes('hip')) return 'body';
    return 'other';
  }

  function calculateLiveScore(breakdown, fallbackScore) {
    let scoreSum = 0;
    let maxScoreSum = 0;

    for (const item of breakdown) {
      if (!Number.isFinite(item?.score) || !Number.isFinite(item?.maxScore)) continue;
      scoreSum += item.score;
      maxScoreSum += item.maxScore;
    }

    return maxScoreSum > 0 ? Math.round((scoreSum / maxScoreSum) * 100) : fallbackScore;
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
        id: 'pushup_setup',
        badge: '준비 자세',
        title: '하이 플랭크 만들기',
        instruction: '손으로 바닥을 밀고 머리부터 발끝까지 길게 펴주세요.',
        hintLines: [
          '어깨 아래에 손이 오도록 먼저 위치를 맞춰주세요.',
          '엉덩이가 처지지 않게 배에 힘을 주세요.',
        ],
        holdMs: 800,
        successMessage: '좋아요. 이제 몸통 정렬을 유지하며 내려가 볼게요.',
        evaluate({ angles, scoringEngine }) {
          const elbowLockout = readMetric(scoringEngine, angles, 'elbow_lockout');
          const hipAngle = readMetric(scoringEngine, angles, 'hip_angle');
          const spineAngle = readMetric(scoringEngine, angles, 'spine_angle');

          return buildLearnEvaluation([
            createCheck('팔을 편 준비 자세예요', Number.isFinite(elbowLockout) && elbowLockout >= 150),
            createCheck('몸통이 일직선에 가까워요', Number.isFinite(hipAngle) && hipAngle >= 150),
            createCheck('상체 각도가 크게 무너지지 않았어요', Number.isFinite(spineAngle) && spineAngle >= 40 && spineAngle <= 120),
          ], '손으로 바닥을 밀고 몸통을 길게 유지해주세요');
        },
      },
      {
        id: 'pushup_descent',
        badge: '하강',
        title: '몸통을 유지하며 내려가기',
        instruction: '몸이 한 덩어리처럼 움직이도록 천천히 내려가세요.',
        hintLines: [
          '팔꿈치만 접지 말고 몸통 정렬을 함께 유지하세요.',
          '엉덩이가 먼저 떨어지지 않도록 주의하세요.',
        ],
        holdMs: 700,
        successMessage: '좋아요. 이제 바닥 가까운 최저점을 만들어볼게요.',
        evaluate({ angles, scoringEngine }) {
          const elbowAngle = readMetric(scoringEngine, angles, 'elbow_angle');
          const hipAngle = readMetric(scoringEngine, angles, 'hip_angle');
          const spineAngle = readMetric(scoringEngine, angles, 'spine_angle');

          return buildLearnEvaluation([
            createCheck('팔을 굽히며 내려가고 있어요', Number.isFinite(elbowAngle) && elbowAngle <= 145 && elbowAngle >= 100),
            createCheck('몸통 정렬을 유지하고 있어요', Number.isFinite(hipAngle) && hipAngle >= 145),
            createCheck('상체가 같이 움직이고 있어요', Number.isFinite(spineAngle) && spineAngle >= 35 && spineAngle <= 125),
          ], '몸 전체가 같이 내려간다는 느낌으로 천천히 움직여주세요');
        },
      },
      {
        id: 'pushup_bottom',
        badge: '최저점',
        title: '충분한 깊이 만들기',
        instruction: '가슴을 조금 더 낮춰 충분한 깊이를 만든 뒤 잠깐 버텨주세요.',
        hintLines: [
          '가슴이 바닥 가까이 간다는 느낌을 가져가세요.',
          '엉덩이가 처지지 않게 코어에 힘을 유지하세요.',
        ],
        holdMs: 800,
        successMessage: '좋아요. 같은 정렬을 유지하며 다시 밀어올리면 됩니다.',
        evaluate({ angles, scoringEngine }) {
          const elbowDepth = readMetric(scoringEngine, angles, 'elbow_depth');
          const hipAngle = readMetric(scoringEngine, angles, 'hip_angle');
          const spineAngle = readMetric(scoringEngine, angles, 'spine_angle');

          return buildLearnEvaluation([
            createCheck('충분히 깊게 내려왔어요', Number.isFinite(elbowDepth) && elbowDepth <= 105),
            createCheck('몸통을 일직선으로 유지했어요', Number.isFinite(hipAngle) && hipAngle >= 145),
            createCheck('상체 각도가 크게 흐트러지지 않았어요', Number.isFinite(spineAngle) && spineAngle >= 35 && spineAngle <= 125),
          ], '깊이를 만들 때도 엉덩이가 먼저 떨어지지 않게 유지해주세요');
        },
      },
      {
        id: 'pushup_finish',
        badge: '마무리',
        title: '끝까지 밀어 올리기',
        instruction: '몸통 정렬을 유지한 채 다시 끝까지 밀어 올려주세요.',
        hintLines: [
          '올라올 때 팔을 끝까지 펴주세요.',
          '머리부터 골반까지 같은 속도로 올라오세요.',
        ],
        holdMs: 800,
        successMessage: '좋아요. 푸쉬업 학습을 완료했습니다.',
        evaluate({ angles, scoringEngine }) {
          const elbowLockout = readMetric(scoringEngine, angles, 'elbow_lockout');
          const hipAngle = readMetric(scoringEngine, angles, 'hip_angle');
          const spineAngle = readMetric(scoringEngine, angles, 'spine_angle');

          return buildLearnEvaluation([
            createCheck('팔을 끝까지 다시 펴줬어요', Number.isFinite(elbowLockout) && elbowLockout >= 155),
            createCheck('몸통 정렬을 끝까지 유지했어요', Number.isFinite(hipAngle) && hipAngle >= 150),
            createCheck('상체가 함께 올라왔어요', Number.isFinite(spineAngle) && spineAngle >= 40 && spineAngle <= 120),
          ], '올라올 때도 몸통이 먼저 꺾이지 않게 유지해주세요');
        },
      },
    ];
  }

  registry.register('push_up', pushUpExercise);
  registry.register('pushup', pushUpExercise);
})();

/**
 * Normalize push-up evaluation so input-quality problems (low_confidence, view_mismatch)
 * are never reported as exercise-module failures.  Those reasons belong exclusively
 * to the common quality gate.
 *
 * NOTE: This function is kept for backward compatibility with existing tests.
 * After Task 3 refactoring, the push-up exercise no longer emits gate-owned reasons,
 * so this normalization is effectively a no-op for new code paths.
 */
function normalizePushUpEvaluation(evaluation) {
  if (!evaluation) {
    return { hardFailReason: null, softFailReasons: [] };
  }

  const GATE_ONLY_REASONS = ['low_confidence', 'view_mismatch'];

  if (GATE_ONLY_REASONS.includes(evaluation.hardFailReason)) {
    return {
      ...evaluation,
      hardFailReason: null,
      softFailReasons: (evaluation.softFailReasons || []).filter(function (reason) {
        return !GATE_ONLY_REASONS.includes(reason);
      }),
    };
  }

  return {
    ...evaluation,
    softFailReasons: (evaluation.softFailReasons || []).filter(function (reason) {
      return !GATE_ONLY_REASONS.includes(reason);
    }),
  };
}

if (typeof module !== 'undefined') {
  module.exports = {
    ...(module.exports || {}),
    normalizePushUpEvaluation,
  };
}
