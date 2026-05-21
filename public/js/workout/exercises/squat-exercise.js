/* EXERCISE_MANIFEST
{
  "code": "SQUAT",
  "name": "스쿼트",
  "description": "하체운동의 기본 스쿼트",
  "default_target_type": "REPS",
  "allowed_views": ["FRONT", "SIDE", "DIAGONAL"],
  "default_view": "FRONT",
  "sort_order": 10
}
*/
/**
 * 스쿼트 전용 운동 모듈 — rep 페이즈 추적, 프레임 스냅샷/robust 통계, rep 단위 `scoreRep`, 라이브 breakdown 필터.
 * manifest 주석의 EXERCISE_MANIFEST JSON은 빌드/메타용입니다.
 */
(function registerSquatExerciseModule() {
  const registry = typeof window !== 'undefined' ? window.WorkoutExerciseRegistry : null;
  if (!registry) return;

  const REP_PHASES = {
    NEUTRAL: 'NEUTRAL',
    DESCENT: 'DESCENT',
    BOTTOM: 'BOTTOM',
    ASCENT: 'ASCENT',
    LOCKOUT: 'LOCKOUT'
  };
  const SCORING_PHASES = [REP_PHASES.DESCENT, REP_PHASES.BOTTOM, REP_PHASES.ASCENT];
  const MAX_SERIES_SAMPLES = 300;
  const MAX_PHASE_SAMPLES = {
    DESCENT: 120,
    BOTTOM: 90,
    ASCENT: 120,
    LOCKOUT: 90,
    NEUTRAL: 90,
    overall: MAX_SERIES_SAMPLES
  };
  const SQUAT_SCORING_CONFIG = {
    FRONT: {
      metrics: [
        { key: 'knee_valgus', weight: 0.30, scorer: 'kneeValgus' },
        { key: 'knee_symmetry', weight: 0.30, scorer: 'symmetry' },
        { key: 'knee_alignment', weight: 0.20, scorer: 'alignment' },
        { key: 'depth', weight: 0.10, scorer: 'kneeDepth' },
        { key: 'trunk_stability', weight: 0.10, scorer: 'trunkLean' }
      ]
    },
    SIDE: {
      metrics: [
        { key: 'depth', weight: 0.34, scorer: 'kneeDepth' },
        { key: 'trunk_tibia_angle', weight: 0.26, scorer: 'angleDiff' },
        { key: 'hip_angle', weight: 0.16, scorer: 'hipDepth' },
        { key: 'trunk_stability', weight: 0.14, scorer: 'trunkLean' },
        { key: 'heel_contact', weight: 0.10, scorer: 'heelContact' }
      ]
    }
  };
  const CURVES = {
    kneeDepth: [[85, 100], [95, 95], [100, 85], [110, 60], [120, 25], [130, 0]],
    kneeValgus: [[0.015, 100], [0.025, 85], [0.04, 60], [0.06, 30], [0.08, 10], [0.10, 0]],
    trunkLean: [[15, 100], [25, 85], [35, 60], [45, 30], [60, 0]],
    hipDepth: [[110, 100], [120, 80], [140, 40], [155, 10], [170, 0]],
    symmetry: [[4, 100], [8, 85], [15, 60], [25, 25], [35, 0]],
    angleDiff: [[10, 100], [15, 75], [25, 35], [35, 10], [50, 0]],
    alignment: [[0.03, 100], [0.05, 75], [0.08, 30], [0.12, 5], [0.16, 0]],
    heelContact: [[0.90, 100], [0.80, 70], [0.65, 35], [0.50, 10], [0, 0]]
  };
  const KNEE_VALGUS_THRESHOLDS = {
    soft: { avg: 0.04, p90: 0.04, badRatio: 0.20 },
    severe: { avg: 0.08, p90: 0.08, badRatio: 0.35 }
  };

  const squatExercise = {
    code: 'squat',

    getDefaultProfileMetrics() {
      return [
        {
          weight: 0.35,
          max_score: 35,
          required: true,
          rule: {
            type: 'curve',
            curve: CURVES.kneeDepth,
            feedback_low: '더 깊이 앉아주세요',
            feedback_high: '더 깊이 앉아주세요'
          },
          metric: {
            metric_id: 'squat_depth',
            key: 'depth',
            title: '스쿼트 깊이',
            unit: 'DEG'
          }
        },
        {
          weight: 0.2,
          max_score: 20,
          rule: {
            type: 'curve',
            curve: CURVES.hipDepth,
            feedback_high: '엉덩이를 뒤로 보내며 앉아주세요'
          },
          metric: {
            metric_id: 'squat_hip_angle',
            key: 'hip_angle',
            title: '힙 힌지',
            unit: 'DEG'
          }
        },
        {
          weight: 0.2,
          max_score: 20,
          rule: {
            ideal_min: 0,
            ideal_max: 30,
            acceptable_min: 0,
            acceptable_max: 50,
            feedback_low: '가슴을 들고 등을 곧게 펴주세요',
            feedback_high: '상체가 너무 기울어졌어요'
          },
          metric: {
            metric_id: 'squat_spine_angle',
            key: 'spine_angle',
            title: '상체 안정성',
            unit: 'DEG'
          }
        },
        {
          weight: 0.15,
          max_score: 15,
          rule: {
            ideal_min: 0,
            ideal_max: 10,
            acceptable_min: 0,
            acceptable_max: 20,
            feedback_low: '상체와 다리가 평행하도록 자세를 유지해주세요',
            // feedback_high: '상체가 너무 누워있습니다' // 추후 상체 과도 기울기 피드백 재활성화 시 사용
          },
          metric: {
            metric_id: 'squat_trunk_tibia',
            key: 'trunk_tibia_angle',
            title: '상체-다리 평행도',
            unit: 'DEG'
          }
        },
        {
          weight: 0.1,
          max_score: 10,
          rule: {
            type: 'curve',
            curve: CURVES.alignment,
            feedback_low: '무릎이 발끝 방향을 유지하도록 해주세요',
            feedback_high: '무릎이 발끝 방향을 유지하도록 해주세요'
          },
          metric: {
            metric_id: 'squat_knee_alignment',
            key: 'knee_alignment',
            title: '무릎 정렬',
            unit: 'SCORE'
          }
        },
        {
          weight: 0.10,
          max_score: 10,
          rule: {
            type: 'boolean'
          },
          metric: {
            metric_id: 'squat_heel_contact',
            key: 'heel_contact',
            title: '뒤꿈치 접지',
            unit: 'BOOL'
          }
        },
        {
          weight: 0.10,
          max_score: 10,
          required: true,
          rule: {
            ideal_min: 0,
            ideal_max: 0.03,
            acceptable_min: 0,
            acceptable_max: 0.08,
            feedback_low: '무릎이 안쪽으로 무너지지 않도록 바깥쪽 힘으로 밀어주세요',
            feedback_high: '무릎이 지나치게 바깥으로 벌어졌습니다'
          },
          metric: {
            metric_id: 'squat_knee_valgus',
            key: 'knee_valgus',
            title: '무릎 안쪽 무너짐',
            unit: 'RATIO'
          }
        },
        {
          weight: 0.15,
          max_score: 15,
          rule: {
            type: 'symmetry',
            max_diff: 18,
            feedback: '양쪽 무릎 각도를 맞춰주세요'
          },
          metric: {
            metric_id: 'squat_knee_symmetry',
            key: 'knee_symmetry',
            title: '좌우 무릎 대칭',
            unit: 'DEG'
          }
        }
      ];
    },

    getLearnSteps(options = {}) {
      const selectedView = normalizeLearnView(options?.selectedView);
      return selectedView === 'FRONT'
        ? createFrontLearnSteps()
        : createSideLearnSteps(selectedView);
    },

    getRepPattern() {
      return {
        primaryAngle: 'knee_angle',
        thresholds: {
          neutral: 160,
          active: 100
        },
        direction: 'decrease',
        minDuration: 800,
        minActiveTime: 200
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
      // 프레임 드랍 시 큰 delta로 통계가 망가지지 않도록 상한 120ms
      const deltaMs = repCounter.repLastFrameTime != null
        ? Math.max(0, Math.min(now - repCounter.repLastFrameTime, 120))
        : 0;

      repCounter.repLastFrameTime = now;
      repCounter.currentPhase = phase;

      const snapshot = getSnapshot(repCounter, angles, primaryAngle);
      recordFrame(repCounter, phase, deltaMs, snapshot);

      // 하강~상승 등 채점 페이즈에서만 movement 버퍼에 점수 쌓음 — finalize 시 robust 통계 입력
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
      const dominantView = summary.dominantView || 'UNKNOWN';
      const confidence = summary.confidence || { score: 0, level: 'LOW', factor: 0.7 };
      const viewConfidence =
        typeof confidence.score === 'number' && Number.isFinite(confidence.score) ? confidence.score : 0;

      // 게이트 통과 후에도 운동 모듈이 "촬영 각도"로 최종 보류할 수 있음(대각·측면 불일치)
      if (requestedView === 'DIAGONAL' || dominantView === 'DIAGONAL') {
        return buildHoldRepResult(repRecord, summary, {
          status: 'HOLD_CAMERA',
          reason: 'camera_angle_diagonal',
          feedback: '정면 또는 측면에서 촬영해주세요.',
          view: 'DIAGONAL',
          confidence,
          rawMetrics: { confidence: confidence.level }
        });
      }

      if (requestedView === 'SIDE' && dominantView !== 'SIDE') {
        return buildHoldRepResult(repRecord, summary, {
          status: 'HOLD_CAMERA',
          reason: 'view_mismatch',
          feedback: '측면이 잘 보이도록 카메라 위치를 조정해주세요.',
          view: dominantView !== 'UNKNOWN' ? dominantView : 'FRONT',
          confidence,
          rawMetrics: {
            confidence: confidence.level,
            requestedView,
            dominantView
          }
        });
      }

      const view = requestedView
        ? requestedView
        : dominantView;

      const robustSources = getRobustScoringSources(summary);
      const fallbackBottomKnee = scoringEngine.pickMetric(summary, ['BOTTOM', 'DESCENT', 'ASCENT'], 'kneeAngle', 'min');
      const fallbackBottomHip = scoringEngine.pickMetric(summary, ['BOTTOM', 'DESCENT'], 'hipAngle', 'min');
      const fallbackMaxSpine = scoringEngine.pickMetric(summary, ['DESCENT', 'BOTTOM', 'ASCENT'], 'spineAngle', 'max');
      const fallbackKneeSymmetry = scoringEngine.pickMetric(summary, ['BOTTOM', 'ASCENT', 'DESCENT'], 'kneeSymmetry', 'avg');
      const fallbackKneeAlignment = view === 'FRONT'
        ? scoringEngine.pickPhaseMetric(summary, ['BOTTOM', 'ASCENT'], 'kneeAlignment', 'avg')
        : scoringEngine.pickMetric(summary, ['BOTTOM', 'ASCENT', 'DESCENT'], 'kneeAlignment', 'avg');
      const lockoutKnee = scoringEngine.pickMetric(summary, ['LOCKOUT', 'ASCENT'], 'kneeAngle', 'max');
      const lockoutHip = scoringEngine.pickMetric(summary, ['LOCKOUT', 'ASCENT'], 'hipAngle', 'max');

      const fallbackMaxTrunkTibia = scoringEngine.pickMetric(summary, ['DESCENT', 'BOTTOM', 'ASCENT'], 'trunkTibiaAngle', 'max');
      const fallbackAvgHeelContact = scoringEngine.pickMetric(summary, ['DESCENT', 'BOTTOM', 'ASCENT'], 'heelContact', 'avg');
      const fallbackBottomHipBelowKnee = scoringEngine.pickMetric(summary, ['BOTTOM'], 'hipBelowKnee', 'min');
      const fallbackAvgKneeValgus = scoringEngine.pickMetric(summary, ['BOTTOM', 'ASCENT', 'DESCENT'], 'kneeValgus', 'avg');

      const phases = summary.phases || {};
      const bottomRobust = phases.BOTTOM?.robust;
      const kneeN = bottomRobust?.sampleCounts?.kneeAngle;
      const bottomKnee = firstFinite(
        bottomRobust?.bottomKneeMedian,
        bottomRobust?.bottomKneeLow10Avg,
        fallbackBottomKnee
      );

      const bottomHip = firstFinite(
        bottomRobust?.bottomHipLow10Avg,
        bottomRobust?.bottomHipMedian,
        scoringEngine.pickMetric(summary, ['BOTTOM'], 'hipAngle', 'min'),
        scoringEngine.pickMetric(summary, ['DESCENT'], 'hipAngle', 'min'),
        fallbackBottomHip
      );

      const maxSpine = firstFinite(
        maxFiniteAcrossPhases(
          summary,
          (r) => r?.trunkLeanP90
        ),
        robustSources.overall?.trunkLeanP90,
        fallbackMaxSpine
      );
      const kneeSymmetry = fallbackKneeSymmetry;
      const kneeAlignment = fallbackKneeAlignment;
      const maxTrunkTibia = firstFinite(
        maxFiniteAcrossPhases(
          summary,
          (r) => r?.trunkTibiaAbsP90
        ),
        robustSources.overall?.trunkTibiaAbsP90,
        fallbackMaxTrunkTibia
      );

      const bottomHeel = phases.BOTTOM?.robust?.heelContactAvg;
      const ascentHeel = phases.ASCENT?.robust?.heelContactAvg;
      const sideHeelContact = weightedAverageFinite([
        [bottomHeel, 0.7],
        [ascentHeel, 0.3]
      ]);
      const avgHeelContact = view === 'SIDE'
        ? firstFinite(
          sideHeelContact,
          robustSources.scoring?.heelContactAvg,
          robustSources.overall?.heelContactAvg,
          fallbackAvgHeelContact
        )
        : firstFinite(robustSources.scoring?.heelContactAvg, robustSources.overall?.heelContactAvg, fallbackAvgHeelContact);

      const heelContactBreakFrames = maxFinite(
        phases.DESCENT?.robust?.heelContactBreakFrames,
        phases.BOTTOM?.robust?.heelContactBreakFrames,
        phases.ASCENT?.robust?.heelContactBreakFrames
      );
      const bottomHipBelowKnee = firstFinite(robustSources.bottom?.hipBelowKnee, fallbackBottomHipBelowKnee);
      const bottomHipNearKnee = robustSources.bottom?.hipNearKnee ?? null;
      const depthGoodRatio = bottomRobust?.depthGoodRatio ?? null;
      const depthPartialRatio = bottomRobust?.depthPartialRatio ?? null;
      const avgKneeValgus = firstFinite(robustSources.scoring?.valgusAvg, robustSources.overall?.valgusAvg, fallbackAvgKneeValgus);
      const kneeValgusP90 = firstFinite(
        maxFiniteAcrossPhases(summary, (r) => r?.valgusP90),
        robustSources.overall?.valgusP90
      ) ?? null;
      const kneeValgusBadRatio = firstFinite(
        maxFiniteAcrossPhases(summary, (r) => r?.valgusBadRatio),
        robustSources.overall?.valgusBadRatio
      ) ?? null;
      const kneeValgusScoreValue = maxFinite(avgKneeValgus, kneeValgusP90);

      const depthClass = classifyDepth(bottomKnee, bottomHipBelowKnee, bottomHipNearKnee);
      const rawMetrics = buildRawMetrics({
        bottomKnee,
        bottomHip,
        maxSpine,
        kneeSymmetry,
        kneeAlignment,
        maxTrunkTibia,
        avgHeelContact,
        heelContactBreakFrames,
        bottomHipBelowKnee,
        bottomHipNearKnee,
        depthGoodRatio,
        depthPartialRatio,
        depthClass,
        avgKneeValgus,
        kneeValgusP90,
        kneeValgusBadRatio,
        kneeValgusScoreValue,
        lockoutKnee,
        lockoutHip,
        confidence
      });
      const lowerBodyVisibility = getLowerBodyVisibility(summary);
      if (confidence.level === 'LOW' && Number.isFinite(lowerBodyVisibility) && lowerBodyVisibility < 0.4) {
        return buildHoldRepResult(repRecord, summary, {
          status: 'HOLD_VISIBILITY',
          reason: 'body_not_visible',
          feedback: '카메라에 하체가 보이도록 거리를 조정해주세요.',
          view,
          confidence,
          rawMetrics
        });
      }

      if (view === 'SIDE' && viewConfidence < 0.7) {
        return buildHoldRepResult(repRecord, summary, {
          status: 'HOLD_CAMERA',
          reason: 'side_low_confidence',
          feedback: '측면이 안정적으로 인식되도록 조명과 거리를 맞춰주세요.',
          view: 'SIDE',
          confidence,
          rawMetrics
        });
      }

      const hardFails = [];
      if (depthClass === 'depth_fail') {
        hardFails.push('depth_not_reached');
      }
      if (bottomRobust && Number.isFinite(kneeN) && (kneeN < 8 || (Number.isFinite(depthGoodRatio) && depthGoodRatio < 0.4))) {
        hardFails.push('depth_not_held');
      }
      if (!isLockoutComplete(summary, lockoutKnee, lockoutHip)) {
        hardFails.push('lockout_incomplete');
      }
      if (view === 'FRONT' && isKneeValgusSevere(avgKneeValgus, kneeValgusP90, kneeValgusBadRatio)) {
        hardFails.push('severe_knee_valgus');
      }
      const metricPlan = getMetricPlan(view, {
        bottomKnee,
        bottomHip,
        maxSpine,
        maxTrunkTibia,
        avgHeelContact,
        bottomHipBelowKnee,
        bottomHipNearKnee,
        depthClass,
        avgKneeValgus,
        kneeValgusScoreValue,
        kneeSymmetry,
        kneeAlignment
      });
      let breakdown = [];
      let weightedScore = 0;
      let totalWeight = 0;

      const scoringWeightSum = metricPlan.reduce((sum, item) => sum + item.weight, 0) || 1;
      for (const item of metricPlan) {
        const normalizedScore = item.scorer(scoringEngine);
        if (!Number.isFinite(normalizedScore)) continue;

        const metric = scoringEngine.getProfileMetricConfig(item.key, item.title);
        const normalizedWeight = item.weight / scoringWeightSum;
        const dynamicMaxScore = Math.round(normalizedWeight * 100);
        const score = Math.round((normalizedScore / 100) * dynamicMaxScore);
        breakdown.push({
          metric_id: metric.metric_id,
          key: item.key,
          title: metric.title,
          rawValue: item.rawValue(),
          score,
          normalizedScore: Math.round(normalizedScore * 100) / 100,
          maxScore: dynamicMaxScore,
          weight: normalizedWeight,
          configuredWeight: item.weight,
          feedback: normalizedScore < 85 ? item.feedback : null
        });

        weightedScore += normalizedScore * normalizedWeight;
        totalWeight += normalizedWeight;
      }

      const baseScore = totalWeight > 0 ? (weightedScore / totalWeight) : (repRecord.score || 0);
      let finalScore = baseScore;

      finalScore = applyDepthCap(finalScore, bottomKnee, bottomHipBelowKnee, bottomHipNearKnee);
      if (hardFails.includes('lockout_incomplete')) {
        finalScore = Math.min(finalScore, 65);
      }
      if (hardFails.includes('severe_knee_valgus')) {
        finalScore = Math.min(finalScore, 50);
      }
      if (hardFails.includes('depth_not_held')) {
        finalScore = Math.min(finalScore, 55);
      }

      let softFails = breakdown
        .filter((item) => item.maxScore > 0 && (item.score / item.maxScore) < 0.7)
        .map((item) => item.key);

      if (view === 'SIDE' && Number.isFinite(heelContactBreakFrames) && heelContactBreakFrames >= 3) {
        if (!softFails.includes('heel_contact')) {
          softFails = [...softFails, 'heel_contact'];
        }
      }
      if (view === 'FRONT' && hasKneeValgusIssue(avgKneeValgus, kneeValgusP90, kneeValgusBadRatio)) {
        if (!softFails.includes('knee_valgus')) {
          softFails = [...softFails, 'knee_valgus'];
        }
      }

      if (view === 'SIDE' && Number.isFinite(heelContactBreakFrames)) {
        if (heelContactBreakFrames >= 5) {
          finalScore = Math.min(finalScore, 70);
        } else if (heelContactBreakFrames >= 3) {
          finalScore = Math.min(finalScore, 80);
        }
      }

      finalScore = applySoftFailCap(finalScore, softFails.length);
      finalScore = Math.max(0, Math.min(100, Math.round(finalScore)));
      breakdown = applyMetricIssueCaps(breakdown, { hardFails, softFails });

      const feedback = pickFeedback({
        hardFails,
        breakdown,
        view,
        confidence,
        bottomHip,
        maxSpine,
        maxTrunkTibia,
        avgHeelContact,
        avgKneeValgus,
        heelContactBreakFrames
      });

      console.log('[ScoringEngine][Squat] Rep evaluation:', {
        repNumber: repRecord.repNumber,
        scoreBeforeRepScoring: repRecord.score,
        finalScore,
        view,
        confidenceLevel: confidence.level,
        confidenceScore: confidence.score,
        bottomKnee,
        bottomHip,
        maxSpine,
        kneeSymmetry,
        kneeAlignment,
        lockoutKnee,
        lockoutHip,
        depthGoodRatio,
        depthPartialRatio,
        kneeValgusP90,
        kneeValgusBadRatio,
        kneeValgusScoreValue,
        hardFails,
        softFails,
        depthClass,
        feedback
      });

      const status = resolveRepStatus(hardFails, confidence, finalScore);
      const primaryFeedback = feedback;
      const metricScores = Object.fromEntries(
        breakdown.map((item) => [item.key, item.normalizedScore])
      );

      return {
        ...repRecord,
        score: finalScore,
        status,
        breakdown,
        feedback,
        primaryFeedback,
        hardFails,
        softFails,
        issues: softFails,
        metricScores,
        rawMetrics,
        view,
        confidence,
        summary: {
          ...summary,
          finalScore,
          status,
          feedback,
          primaryFeedback,
          hardFails,
          softFails,
          issues: softFails,
          metricScores,
          rawMetrics,
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
      const view = runtime?.angles?.view || 'UNKNOWN';
      const livePhase = getLivePhase(currentState, phase);
      const breakdown = scoreResult.breakdown.filter((item) =>
        shouldKeepLiveMetric(item.key, livePhase, view)
      );

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
    const nearBottom = primaryAngle <= ((repCounter.pattern.thresholds.active || 100) + 8);
    const nearLockout = primaryAngle >= ((repCounter.pattern.thresholds.neutral || 160) - 10) &&
      (hipAngle == null || hipAngle >= 145);
    const movingDown = delta <= -1.5;
    const movingUp = delta >= 1.5;

    if (repCounter.currentState === 'NEUTRAL') {
      return (repCounter.bottomReached || repCounter.ascentStarted) ? REP_PHASES.LOCKOUT : REP_PHASES.NEUTRAL;
    }

    if (!repCounter.bottomReached) {
      if (nearBottom) {
        repCounter.bottomStableFrames = Math.abs(delta) <= 2 ? repCounter.bottomStableFrames + 1 : 1;
        if (repCounter.bottomStableFrames >= 2 || (!movingDown && repCounter.currentState === 'ACTIVE')) {
          repCounter.bottomReached = true;
          return REP_PHASES.BOTTOM;
        }
      } else {
        repCounter.bottomStableFrames = 0;
      }

      return REP_PHASES.DESCENT;
    }

    if (!repCounter.ascentStarted) {
      if (movingUp || repCounter.currentState !== 'ACTIVE') {
        repCounter.ascentStarted = true;
        return nearLockout ? REP_PHASES.LOCKOUT : REP_PHASES.ASCENT;
      }

      return REP_PHASES.BOTTOM;
    }

    if (nearLockout && repCounter.currentState === 'NEUTRAL') {
      return REP_PHASES.LOCKOUT;
    }

    return REP_PHASES.ASCENT;
  }

  function createRepSummary(repCounter, startedAt) {
    return {
      exerciseCode: 'squat',
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
      overall: createPhaseSummary(repCounter, 'overall'),
      phases: {
        DESCENT: createPhaseSummary(repCounter, REP_PHASES.DESCENT),
        BOTTOM: createPhaseSummary(repCounter, REP_PHASES.BOTTOM),
        ASCENT: createPhaseSummary(repCounter, REP_PHASES.ASCENT),
        LOCKOUT: createPhaseSummary(repCounter, REP_PHASES.LOCKOUT)
      }
    };
  }

  function createPhaseSummary(repCounter, phase = null) {
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
        kneeAngle: repCounter.createMetricStats(),
        hipAngle: repCounter.createMetricStats(),
        spineAngle: repCounter.createMetricStats(),
        kneeSymmetry: repCounter.createMetricStats(),
        kneeAlignment: repCounter.createMetricStats(),
        qualityScore: repCounter.createMetricStats(),
        tibiaAngle: repCounter.createMetricStats(),
        trunkTibiaAngle: repCounter.createMetricStats(),
        heelContact: repCounter.createMetricStats(),
        hipBelowKnee: repCounter.createMetricStats(),
        kneeValgus: repCounter.createMetricStats()
      },
      _series: createPhaseSeries(phase)
    };
  }

  function createPhaseSeries(phase = null) {
    return {
      maxSamples: MAX_PHASE_SAMPLES[phase] || MAX_SERIES_SAMPLES,
      kneeAngle: [],
      hipAngle: [],
      spineAngle: [],
      trunkTibiaAngle: [],
      signedTrunkTibia: [],
      kneeValgus: [],
      heelContact: [],
      hipY: [],
      kneeY: [],
      torsoLength: [],
      kneeSymmetry: [],
      kneeAlignment: [],
      confidence: {
        depth: [],
        hip_angle: [],
        trunk_stability: [],
        trunk_tibia_angle: [],
        knee_valgus: [],
        knee_symmetry: [],
        heel_contact: [],
        knee_alignment: []
      }
    };
  }

  function getSnapshot(repCounter, angles, primaryAngle) {
    const leftKnee = Number.isFinite(angles.leftKnee) ? angles.leftKnee : null;
    const rightKnee = Number.isFinite(angles.rightKnee) ? angles.rightKnee : null;
    const kneeSymmetry = leftKnee != null && rightKnee != null ? Math.abs(leftKnee - rightKnee) : null;
    const hasKneeTrackingProxy = angles.kneeAlignment &&
      Number.isFinite(angles.kneeAlignment.left) &&
      Number.isFinite(angles.kneeAlignment.right);
    const kneeAlignment = hasKneeTrackingProxy
      ? (Math.abs(angles.kneeAlignment.left) + Math.abs(angles.kneeAlignment.right)) / 2
      : null;
    const qualityScore = Number.isFinite(angles.quality?.score) ? angles.quality.score : null;

    const tibiaAngle = Number.isFinite(angles.tibiaAngle)
      ? angles.tibiaAngle
      : (Number.isFinite(angles.tibia)
         ? angles.tibia
         : repCounter.getAngleValue(angles, 'tibia_angle'));
    const spineAngle = repCounter.getAngleValue(angles, 'spine_angle');
    const trunkTibiaSigned = Number.isFinite(spineAngle) && Number.isFinite(tibiaAngle)
      ? spineAngle - tibiaAngle
      : null;
    const trunkTibiaAngle = angles.trunkTibiaAngle != null
      ? angles.trunkTibiaAngle
      : (Number.isFinite(trunkTibiaSigned) ? Math.abs(trunkTibiaSigned) : null);

      const heelContact = angles.heelContact != null
        ? (angles.heelContact ? 1 : 0)
        : (Number.isFinite(angles.heelY) && Number.isFinite(angles.toeY)
         ? (angles.heelY >= angles.toeY - 0.02 ? 1 : 0)
         : null);

      const hipBelowKnee = angles.hipBelowKnee != null
        ? (angles.hipBelowKnee ? 1 : 0)
        : (Number.isFinite(angles.hipY) && Number.isFinite(angles.kneeY)
         ? (angles.hipY > angles.kneeY ? 1 : 0)
         : null);

    const kneeValgus = angles.kneeValgus != null
      ? angles.kneeValgus
      : (hasKneeTrackingProxy
         ? (Math.abs(angles.kneeAlignment.left) + Math.abs(angles.kneeAlignment.right)) / 2
         : null);

    const hipAngle = repCounter.getAngleValue(angles, 'hip_angle');

    return {
      kneeAngle: primaryAngle,
      hipAngle,
      spineAngle,
      kneeSymmetry,
      kneeAlignment,
      qualityScore,
      view: angles.view || 'UNKNOWN',
      qualityLevel: angles.quality?.level || 'UNKNOWN',
      tibiaAngle,
      trunkTibiaAngle,
      signedTrunkTibia: Number.isFinite(trunkTibiaSigned) ? trunkTibiaSigned : null,
      heelContact,
      hipBelowKnee,
      kneeValgus,
      hipY: Number.isFinite(angles.hipY) ? angles.hipY : null,
      kneeY: Number.isFinite(angles.kneeY) ? angles.kneeY : null,
      torsoLength: Number.isFinite(angles.torsoLength) ? angles.torsoLength : null,
      metricConfidence: getSnapshotMetricConfidence(angles, {
        kneeAngle: primaryAngle,
        hipAngle,
        spineAngle,
        trunkTibiaAngle,
        kneeValgus,
        kneeSymmetry,
        heelContact,
        kneeAlignment
      })
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

    repCounter.updateMetricStats(target.metrics.kneeAngle, snapshot.kneeAngle);
    repCounter.updateMetricStats(target.metrics.hipAngle, snapshot.hipAngle);
    repCounter.updateMetricStats(target.metrics.spineAngle, snapshot.spineAngle);
    repCounter.updateMetricStats(target.metrics.kneeSymmetry, snapshot.kneeSymmetry);
    repCounter.updateMetricStats(target.metrics.kneeAlignment, snapshot.kneeAlignment);
    repCounter.updateMetricStats(target.metrics.qualityScore, snapshot.qualityScore);
    repCounter.updateMetricStats(target.metrics.tibiaAngle, snapshot.tibiaAngle);
    repCounter.updateMetricStats(target.metrics.trunkTibiaAngle, snapshot.trunkTibiaAngle);
    repCounter.updateMetricStats(target.metrics.heelContact, snapshot.heelContact);
    repCounter.updateMetricStats(target.metrics.hipBelowKnee, snapshot.hipBelowKnee);
    repCounter.updateMetricStats(target.metrics.kneeValgus, snapshot.kneeValgus);
    recordPhaseSeries(target._series, snapshot);
  }

  function recordPhaseSeries(series, snapshot) {
    if (!series || !snapshot) return;
    const maxSamples = Number.isFinite(series.maxSamples) ? series.maxSamples : MAX_SERIES_SAMPLES;
    pushFiniteLimited(series.kneeAngle, snapshot.kneeAngle, maxSamples);
    pushFiniteLimited(series.hipAngle, snapshot.hipAngle, maxSamples);
    pushFiniteLimited(series.spineAngle, snapshot.spineAngle, maxSamples);
    pushFiniteLimited(series.trunkTibiaAngle, snapshot.trunkTibiaAngle, maxSamples);
    pushFiniteLimited(series.signedTrunkTibia, snapshot.signedTrunkTibia, maxSamples);
    pushFiniteLimited(series.kneeValgus, snapshot.kneeValgus, maxSamples);
    pushFiniteLimited(series.heelContact, snapshot.heelContact, maxSamples);
    pushFiniteLimited(series.hipY, snapshot.hipY, maxSamples);
    pushFiniteLimited(series.kneeY, snapshot.kneeY, maxSamples);
    pushFiniteLimited(series.torsoLength, snapshot.torsoLength, maxSamples);
    pushFiniteLimited(series.kneeSymmetry, snapshot.kneeSymmetry, maxSamples);
    pushFiniteLimited(series.kneeAlignment, snapshot.kneeAlignment, maxSamples);

    const confidence = snapshot.metricConfidence || {};
    for (const key of Object.keys(series.confidence || {})) {
      pushFiniteLimited(series.confidence[key], confidence[key], maxSamples);
    }
  }

  function pushFiniteLimited(arr, value, maxSamples = MAX_SERIES_SAMPLES) {
    if (!Array.isArray(arr) || !Number.isFinite(value)) return;
    arr.push(value);
    while (arr.length > maxSamples) arr.shift();
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
    const robust = buildRobustSummary(summary._series, summary.metrics);
    const robustConfidence = buildRobustConfidence(summary._series);

    return {
      samples: summary.samples,
      durationMs: Math.round(summary.durationMs),
      views: summary.views,
      qualityLevels: summary.qualityLevels,
      metrics: Object.fromEntries(
        Object.entries(summary.metrics).map(([key, stats]) => [key, repCounter.finalizeMetricStats(stats)])
      ),
      robust,
      robustConfidence
    };
  }

  function buildRobustSummary(series, metrics = {}) {
    const kneeAngles = series?.kneeAngle || [];
    const hipAngles = series?.hipAngle || [];
    const hipYValues = series?.hipY || [];
    const kneeYValues = series?.kneeY || [];
    const torsoLengths = series?.torsoLength || [];
    const hipY = median(hipYValues);
    const kneeY = median(kneeYValues);
    const torsoLength = median(torsoLengths);
    const fallbackHipBelowKnee = metrics?.hipBelowKnee?.max === 1 || metrics?.hipBelowKnee?.min === 1 ? 1 : null;

    return {
      bottomKneeMedian: median(kneeAngles),
      bottomKneeLow10Avg: lowPercentileAverage(kneeAngles, 0.10),
      depthGoodRatio: goodFrameRatio(kneeAngles, (value) => value <= 92),
      depthPartialRatio: goodFrameRatio(kneeAngles, (value) => value <= 108),
      bottomHipMedian: median(hipAngles),
      bottomHipLow10Avg: lowPercentileAverage(hipAngles, 0.10),
      sampleCounts: {
        kneeAngle: finiteValues(kneeAngles).length,
        hipAngle: finiteValues(hipAngles).length
      },
      hipBelowKnee: Number.isFinite(hipY) && Number.isFinite(kneeY)
        ? (hipY > kneeY ? 1 : 0)
        : fallbackHipBelowKnee,
      hipNearKnee: computeHipNearKnee(hipY, kneeY, torsoLength),
      trunkLeanP90: percentile(series?.spineAngle || [], 0.9),
      trunkTibiaAbsP90: percentile(series?.trunkTibiaAngle || [], 0.9),
      signedTrunkTibiaP90: percentile(series?.signedTrunkTibia || [], 0.9),
      valgusAvg: average(series?.kneeValgus || []),
      valgusP90: percentile(series?.kneeValgus || [], 0.9),
      valgusBadRatio: badFrameRatio(series?.kneeValgus || [], (value) => value > 0.08),
      heelContactAvg: average(series?.heelContact || []),
      heelContactBreakFrames: maxConsecutive(series?.heelContact || [], (value) => value === 0)
    };
  }

  function buildRobustConfidence(series) {
    const confidence = series?.confidence || {};
    return {
      depth: confidenceValue(confidence.depth, series?.kneeAngle),
      hip_angle: confidenceValue(confidence.hip_angle, series?.hipAngle),
      trunk_stability: confidenceValue(confidence.trunk_stability, series?.spineAngle),
      trunk_tibia_angle: confidenceValue(confidence.trunk_tibia_angle, series?.trunkTibiaAngle),
      knee_valgus: confidenceValue(confidence.knee_valgus, series?.kneeValgus),
      knee_symmetry: confidenceValue(confidence.knee_symmetry, series?.kneeSymmetry),
      heel_contact: confidenceValue(confidence.heel_contact, series?.heelContact),
      knee_alignment: confidenceValue(confidence.knee_alignment, series?.kneeAlignment)
    };
  }

  function getSnapshotMetricConfidence(angles, values) {
    const qualityScore = Number.isFinite(angles?.quality?.score) ? angles.quality.score : null;
    const sampleConfidence = (value) => Number.isFinite(value) ? 1 : 0;
    const withQuality = (value) => {
      const sample = sampleConfidence(value);
      return Number.isFinite(qualityScore) ? Math.min(sample, qualityScore) : sample;
    };

    return {
      depth: withQuality(values.kneeAngle),
      hip_angle: withQuality(values.hipAngle),
      trunk_stability: withQuality(values.spineAngle),
      trunk_tibia_angle: withQuality(values.trunkTibiaAngle),
      knee_valgus: withQuality(values.kneeValgus),
      knee_symmetry: withQuality(values.kneeSymmetry),
      heel_contact: withQuality(values.heelContact),
      knee_alignment: withQuality(values.kneeAlignment)
    };
  }

  function percentile(values, p) {
    const arr = finiteValues(values).sort((a, b) => a - b);
    if (!arr.length) return null;
    const idx = Math.floor((arr.length - 1) * p);
    return roundMetric(arr[idx], 3);
  }

  function median(values) {
    const arr = finiteValues(values).sort((a, b) => a - b);
    if (!arr.length) return null;
    const mid = Math.floor(arr.length / 2);
    if (arr.length % 2 === 1) return roundMetric(arr[mid]);
    return roundMetric((arr[mid - 1] + arr[mid]) / 2);
  }

  function lowPercentileAverage(values, percentileCutoff) {
    const arr = finiteValues(values).sort((a, b) => a - b);
    if (!arr.length) return null;
    const count = Math.max(1, Math.ceil(arr.length * percentileCutoff));
    return roundMetric(arr.slice(0, count).reduce((sum, value) => sum + value, 0) / count);
  }

  function average(values) {
    const arr = finiteValues(values);
    if (!arr.length) return null;
    return roundMetric(arr.reduce((sum, value) => sum + value, 0) / arr.length);
  }

  function badFrameRatio(values, predicate) {
    const arr = finiteValues(values);
    if (!arr.length) return null;
    return roundMetric(arr.filter(predicate).length / arr.length, 3);
  }

  function goodFrameRatio(values, predicate) {
    const arr = finiteValues(values);
    if (!arr.length) return null;
    return roundMetric(arr.filter(predicate).length / arr.length, 3);
  }

  function maxConsecutive(values, predicate) {
    let maxRun = 0;
    let currentRun = 0;
    for (const value of values || []) {
      if (!Number.isFinite(value)) continue;
      if (predicate(value)) {
        currentRun++;
        maxRun = Math.max(maxRun, currentRun);
      } else {
        currentRun = 0;
      }
    }
    return maxRun;
  }

  function confidenceValue(confidenceValues, sampleValues) {
    const explicit = average(confidenceValues || []);
    const samples = sampleValues || [];
    const validSamples = finiteValues(samples).length;
    const sampleRatio = samples.length > 0 ? validSamples / samples.length : null;
    if (Number.isFinite(explicit) && Number.isFinite(sampleRatio)) {
      return roundMetric(Math.min(explicit, sampleRatio), 3);
    }
    if (Number.isFinite(explicit)) return roundMetric(explicit, 3);
    if (Number.isFinite(sampleRatio)) return roundMetric(sampleRatio, 3);
    return null;
  }

  function finiteValues(values) {
    return (values || []).filter(Number.isFinite);
  }

  function roundMetric(value, digits = 1) {
    if (!Number.isFinite(value)) return null;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  function computeHipNearKnee(hipY, kneeY, torsoLength) {
    if (!Number.isFinite(hipY) || !Number.isFinite(kneeY) || !Number.isFinite(torsoLength)) return null;
    const tolerance = torsoLength * 0.08;
    return Math.abs(hipY - kneeY) <= tolerance ? 1 : 0;
  }

  function weightedAverageFinite(weightedValues) {
    let weightedSum = 0;
    let weightSum = 0;
    (weightedValues || []).forEach(([value, weight]) => {
      if (Number.isFinite(value) && Number.isFinite(weight) && weight > 0) {
        weightedSum += value * weight;
        weightSum += weight;
      }
    });
    return weightSum > 0 ? weightedSum / weightSum : null;
  }

  function getRobustScoringSources(summary) {
    const phases = summary?.phases || {};
    return {
      bottom: phases.BOTTOM?.robust || null,
      overall: summary?.overall?.robust || null,
      scoring: mergeRobustSummaries(
        phases.DESCENT?.robust,
        phases.BOTTOM?.robust,
        phases.ASCENT?.robust,
        summary?.overall?.robust
      )
    };
  }

  function mergeRobustSummaries(...summaries) {
    const keys = [
      'trunkLeanP90',
      'trunkTibiaAbsP90',
      'signedTrunkTibiaP90',
      'valgusAvg',
      'valgusP90',
      'valgusBadRatio',
      'heelContactAvg',
      'heelContactBreakFrames'
    ];
    const merged = {};
    for (const key of keys) {
      for (const summary of summaries) {
        const value = summary?.[key];
        if (Number.isFinite(value)) {
          merged[key] = value;
          break;
        }
      }
    }
    return merged;
  }

  function getMetricPlan(view, values) {
    const metricDefinitions = {
      depth: {
        title: '스쿼트 깊이',
        scorer: () => scoreDepth(values.bottomKnee),
        rawValue: () => values.bottomKnee,
        feedback: '조금 더 깊이 앉아주세요'
      },
      hip_angle: {
        title: '힙 힌지',
        scorer: () => scoreHip(values.bottomHip),
        rawValue: () => values.bottomHip,
        feedback: '엉덩이를 뒤로 보내며 앉아주세요'
      },
      trunk_stability: {
        title: '상체 안정성',
        scorer: () => scoreSpine(values.maxSpine),
        rawValue: () => values.maxSpine,
        feedback: '가슴을 들고 상체를 더 안정적으로 유지해주세요'
      },
      knee_symmetry: {
        title: '좌우 무릎 대칭',
        scorer: () => scoreSymmetry(values.kneeSymmetry),
        rawValue: () => values.kneeSymmetry,
        feedback: '양쪽 무릎 높이와 각도를 비슷하게 맞춰주세요'
      },
      knee_alignment: {
        title: '무릎 정렬',
        scorer: () => scoreAlignment(values.kneeAlignment),
        rawValue: () => values.kneeAlignment,
        feedback: '무릎이 발끝 방향을 유지하도록 해주세요'
      },
      trunk_tibia_angle: {
        title: '상체-다리 평행도',
        scorer: () => scoreTrunkTibia(values.maxTrunkTibia),
        rawValue: () => values.maxTrunkTibia,
        feedback: '상체와 다리가 평행하도록 자세를 유지해주세요'
      },
      heel_contact: {
        title: '뒤꿈치 접지',
        scorer: () => scoreHeelContact(values.avgHeelContact),
        rawValue: () => values.avgHeelContact,
        feedback: '뒤꿈치가 떨어지지 않도록 유지해주세요'
      },
      knee_valgus: {
        title: '무릎 안쪽 무너짐',
        scorer: () => scoreKneeValgus(firstFinite(values.kneeValgusScoreValue, values.avgKneeValgus)),
        rawValue: () => firstFinite(values.kneeValgusScoreValue, values.avgKneeValgus),
        feedback: '무릎이 안쪽으로 무너지지 않도록 바깥쪽 힘으로 밀어주세요'
      }
    };

    const config = SQUAT_SCORING_CONFIG[['SIDE', 'FRONT'].includes(view) ? view : 'FRONT'];
    return config.metrics
      .map((metric) => {
        const definition = metricDefinitions[metric.key];
        if (!definition) return null;
        return {
          ...definition,
          key: metric.key,
          scorerName: metric.scorer,
          weight: metric.weight
        };
      })
      .filter(Boolean);
  }

  function scoreDepth(value) {
    return scoreCurve(value, CURVES.kneeDepth);
  }

  function scoreHip(value) {
    return scoreCurve(value, CURVES.hipDepth);
  }

  function scoreSpine(value) {
    return scoreCurve(value, CURVES.trunkLean);
  }

  function scoreSymmetry(value) {
    return scoreCurve(value, CURVES.symmetry);
  }

  function scoreAlignment(value) {
    return scoreCurve(value, CURVES.alignment);
  }

  function scoreTrunkTibia(value) {
    return scoreCurve(value, CURVES.angleDiff);
  }

  function scoreHeelContact(value) {
    return scoreCurve(value, CURVES.heelContact);
  }

  function scoreKneeValgus(value) {
    return scoreCurve(value, CURVES.kneeValgus);
  }

  function isKneeValgusSevere(avg, p90, badRatio) {
    const thresholds = KNEE_VALGUS_THRESHOLDS.severe;
    return (Number.isFinite(avg) && avg >= thresholds.avg) ||
      (Number.isFinite(p90) && p90 >= thresholds.p90) ||
      (Number.isFinite(badRatio) && badRatio >= thresholds.badRatio);
  }

  function hasKneeValgusIssue(avg, p90, badRatio) {
    const thresholds = KNEE_VALGUS_THRESHOLDS.soft;
    return (Number.isFinite(avg) && avg >= thresholds.avg) ||
      (Number.isFinite(p90) && p90 >= thresholds.p90) ||
      (Number.isFinite(badRatio) && badRatio >= thresholds.badRatio);
  }

  function applySoftFailCap(score, softFailCount) {
    if (!Number.isFinite(score)) return score;
    if (softFailCount >= 3) return Math.min(score, 50);
    if (softFailCount >= 2) return Math.min(score, 65);
    if (softFailCount >= 1) return Math.min(score, 80);
    return score;
  }

  function scoreCurve(value, curve) {
    if (!Number.isFinite(value) || !Array.isArray(curve) || curve.length === 0) return null;
    const points = curve.slice().sort((a, b) => a[0] - b[0]);
    if (value <= points[0][0]) return points[0][1];
    const lastPoint = points[points.length - 1];
    if (value >= lastPoint[0]) return lastPoint[1];

    for (let i = 1; i < points.length; i += 1) {
      const [prevValue, prevScore] = points[i - 1];
      const [nextValue, nextScore] = points[i];
      if (value <= nextValue) {
        return interpolate(value, prevValue, nextValue, prevScore, nextScore);
      }
    }
    return lastPoint[1];
  }

  function interpolate(value, inMin, inMax, outMin, outMax) {
    if (inMax === inMin) return outMax;
    const ratio = (value - inMin) / (inMax - inMin);
    return outMin + ((outMax - outMin) * ratio);
  }

  function applyDepthCap(score, bottomKnee, hipBelowKnee, hipNearKnee) {
    if (!Number.isFinite(score)) return score;
    if (!Number.isFinite(bottomKnee)) return score;
    if (isDepthGood(bottomKnee, hipBelowKnee)) return score;
    if (bottomKnee <= 108 || hipNearKnee === 1) {
      return Math.min(score, 80);
    }
    return Math.min(score, 55);
  }

  function applyMetricIssueCaps(breakdown, { hardFails = [], softFails = [] } = {}) {
    let capped = Array.isArray(breakdown) ? breakdown : [];

    if (hardFails.includes('depth_not_reached')) {
      capped = capMetricScore(capped, 'depth', 55, '조금 더 깊이 앉아주세요');
    }
    if (hardFails.includes('depth_not_held')) {
      capped = capMetricScore(capped, 'depth', 55, '조금 더 깊이 앉아주세요');
    }
    if (softFails.includes('depth')) {
      capped = capMetricScore(capped, 'depth', 80, '조금 더 깊이 앉아주세요');
    }
    if (hardFails.includes('severe_knee_valgus')) {
      capped = capMetricScore(capped, 'knee_valgus', 50, '무릎이 안쪽으로 무너지지 않도록 바깥쪽 힘으로 밀어주세요');
    }
    if (softFails.includes('knee_valgus')) {
      capped = capMetricScore(capped, 'knee_valgus', 80, '무릎이 안쪽으로 무너지지 않도록 바깥쪽 힘으로 밀어주세요');
    }

    return capped;
  }

  function capMetricScore(breakdown, key, cap, feedback) {
    return breakdown.map((item) => {
      if (item.key !== key || !Number.isFinite(item.normalizedScore)) {
        return item;
      }

      const normalizedScore = Math.min(item.normalizedScore, cap);
      const maxScore = Number(item.maxScore);
      return {
        ...item,
        normalizedScore: Math.round(normalizedScore * 100) / 100,
        score: Number.isFinite(maxScore) && maxScore > 0
          ? Math.round((normalizedScore / 100) * maxScore)
          : item.score,
        feedback: item.feedback || feedback || null
      };
    });
  }

  function classifyDepth(bottomKnee, hipBelowKnee, hipNearKnee) {
    if (isDepthGood(bottomKnee, hipBelowKnee)) return 'depth_good';
    if (Number.isFinite(bottomKnee) && bottomKnee <= 108) return 'depth_partial';
    if (hipNearKnee === 1) return 'depth_partial';
    return 'depth_fail';
  }

  function isDepthGood(bottomKnee, hipBelowKnee) {
    return Number.isFinite(bottomKnee) && (
      bottomKnee <= 92 ||
      (bottomKnee <= 95 && hipBelowKnee === 1)
    );
  }

  function resolveRepStatus(hardFails, confidence, finalScore) {
    if (
      hardFails.includes('depth_not_reached') ||
      hardFails.includes('depth_not_held') ||
      hardFails.includes('lockout_incomplete') ||
      hardFails.includes('severe_knee_valgus')
    ) {
      return 'PARTIAL_REP';
    }
    if (confidence?.level === 'LOW' && finalScore <= 60) {
      return 'PARTIAL_REP';
    }
    return 'VALID_REP';
  }

  function buildRawMetrics({
    bottomKnee,
    bottomHip,
    maxSpine,
    kneeSymmetry,
    kneeAlignment,
    maxTrunkTibia,
    avgHeelContact,
    heelContactBreakFrames,
    bottomHipBelowKnee,
    bottomHipNearKnee,
    depthGoodRatio,
    depthPartialRatio,
    depthClass,
    avgKneeValgus,
    kneeValgusP90,
    kneeValgusBadRatio,
    kneeValgusScoreValue,
    lockoutKnee,
    lockoutHip,
    confidence
  }) {
    return {
      bottomKnee,
      bottomHip,
      maxSpine,
      kneeSymmetry,
      kneeAlignment,
      maxTrunkTibia,
      avgHeelContact,
      heelContactBreakFrames: Number.isFinite(heelContactBreakFrames) ? heelContactBreakFrames : null,
      bottomHipBelowKnee,
      bottomHipNearKnee,
      depthGoodRatio,
      depthPartialRatio,
      depthClass,
      avgKneeValgus,
      kneeValgusP90,
      kneeValgusBadRatio,
      kneeValgusScoreValue,
      lockoutKnee,
      lockoutHip,
      confidence: confidence?.level || null
    };
  }

  function isLockoutComplete(summary, lockoutKnee, lockoutHip) {
    if (!summary?.flags?.lockoutReached) return false;

    const baseline = getStandingLockoutBaseline(summary);
    if (baseline) {
      const kneeOk = Number.isFinite(lockoutKnee) && lockoutKnee >= baseline.knee - 15;
      const hipOk = Number.isFinite(lockoutHip) && lockoutHip >= baseline.hip - 20;
      return kneeOk && hipOk;
    }

    if (!Number.isFinite(lockoutKnee)) return true;
    return lockoutKnee >= 150;
  }

  function getStandingLockoutBaseline(summary) {
    const sources = [
      summary?.lockoutBaseline,
      summary?.standingBaseline,
      summary?.baseline?.lockout,
      summary?.baseline?.standing,
      summary?.baseline
    ];

    for (const source of sources) {
      if (!source || typeof source !== 'object') continue;

      const knee = firstFinite(
        source.standingKneeBaseline,
        source.kneeBaseline,
        source.kneeAngle,
        source.knee
      );
      const hip = firstFinite(
        source.standingHipBaseline,
        source.hipBaseline,
        source.hipAngle,
        source.hip
      );

      if (Number.isFinite(knee) && Number.isFinite(hip)) {
        return { knee, hip };
      }
    }

    return null;
  }

  function firstFinite(...values) {
    return values.find(Number.isFinite);
  }

  function maxFinite(...values) {
    const nums = values.filter(Number.isFinite);
    return nums.length ? Math.max(...nums) : null;
  }

  function minFinite(a, b) {
    if (!Number.isFinite(a)) return Number.isFinite(b) ? b : null;
    if (!Number.isFinite(b)) return a;
    return Math.min(a, b);
  }

  function maxFiniteAcrossPhases(summary, pickFromRobust) {
    const phases = summary?.phases || {};
    return maxFinite(
      pickFromRobust(phases.DESCENT?.robust),
      pickFromRobust(phases.BOTTOM?.robust),
      pickFromRobust(phases.ASCENT?.robust),
      pickFromRobust(summary?.overall?.robust)
    );
  }

  function buildHoldRepResult(repRecord, summary, { status, reason, feedback, view, confidence, rawMetrics }) {
    return {
      ...repRecord,
      score: null,
      status,
      reason,
      breakdown: [],
      feedback,
      primaryFeedback: feedback,
      hardFails: [],
      softFails: [],
      issues: [reason],
      metricScores: {},
      rawMetrics: rawMetrics || {},
      view,
      confidence,
      summary: {
        ...summary,
        finalScore: null,
        status,
        reason,
        feedback,
        primaryFeedback: feedback,
        hardFails: [],
        softFails: [],
        issues: [reason],
        metricScores: {},
        rawMetrics: rawMetrics || {},
        dominantView: view,
        confidence
      }
    };
  }

  function getLowerBodyVisibility(summary) {
    const visibility = summary?.visibility || summary?.landmarkVisibility || summary?.landmarkConfidence;
    if (!visibility || typeof visibility !== 'object') return null;

    const candidates = [
      visibility.lowerBody,
      visibility.lower_body,
      visibility.legs,
      visibility.knees,
      visibility.ankles
    ].filter(Number.isFinite);

    if (!candidates.length) return null;
    return Math.min(...candidates);
  }

  function sideFeedbackFromNormalizedScores(breakdown) {
    const byKey = Object.fromEntries(breakdown.map((b) => [b.key, b.normalizedScore]));
    const checks = [
      ['trunk_tibia_angle', '상체와 다리가 평행하도록 자세를 유지해주세요'],
      ['hip_angle', '엉덩이를 뒤로 보내며 앉아주세요'],
      ['heel_contact', '뒤꿈치가 떨어지지 않도록 유지해주세요'],
      ['trunk_stability', '가슴을 들고 상체를 더 안정적으로 유지해주세요'],
      ['depth', '조금 더 깊이 앉아주세요']
    ];
    for (const [key, msg] of checks) {
      const s = byKey[key];
      if (Number.isFinite(s) && s < 70) return msg;
    }
    return null;
  }

  function pickFeedback({
    hardFails,
    breakdown,
    view,
    confidence,
    bottomHip,
    maxSpine,
    maxTrunkTibia,
    avgHeelContact,
    avgKneeValgus,
    heelContactBreakFrames
  }) {
    if (hardFails.includes('low_confidence') || confidence.level === 'LOW') {
      return '카메라에 전신이 잘 보이도록 위치를 다시 맞춰주세요';
    }
    if (hardFails.includes('depth_not_reached') || hardFails.includes('depth_not_held')) {
      return '조금 더 깊이 앉아주세요';
    }
    if (hardFails.includes('lockout_incomplete')) {
      return '올라올 때 무릎과 엉덩이를 끝까지 펴주세요';
    }

    if (view === 'SIDE' && Number.isFinite(heelContactBreakFrames) && heelContactBreakFrames >= 3) {
      return '뒤꿈치가 떨어지지 않도록 유지해주세요';
    }

    if (view === 'SIDE') {
      const metricMsg = sideFeedbackFromNormalizedScores(breakdown);
      if (metricMsg) return metricMsg;
    }

    const worstMetric = breakdown
      .slice()
      .sort((a, b) => (a.score / (a.maxScore || 1)) - (b.score / (b.maxScore || 1)))[0];

    if (worstMetric?.feedback) {
      return worstMetric.feedback;
    }

    if (view === 'SIDE' && Number.isFinite(bottomHip) && bottomHip > 140) {
      return '엉덩이를 뒤로 보내며 앉아주세요';
    }
    if (view === 'SIDE' && Number.isFinite(maxSpine) && maxSpine > 40) {
      return '가슴을 들고 상체를 더 안정적으로 유지해주세요';
    }
    if (view === 'SIDE' && Number.isFinite(maxTrunkTibia) && maxTrunkTibia > 25) {
      return '상체와 다리가 평행하도록 자세를 유지해주세요';
    }
    if (view === 'SIDE' && Number.isFinite(avgHeelContact) && avgHeelContact < 0.7) {
      return '뒤꿈치가 떨어지지 않도록 유지해주세요';
    }
    if (view === 'FRONT' && Number.isFinite(avgKneeValgus) && avgKneeValgus > 0.08) {
      return '무릎이 안쪽으로 물어지지 않도록 바깥쪽 힘으로 밀어주세요';
    }

    return '좋아요! 같은 흐름으로 반복해보세요';
  }

  function getLivePhase(currentState, phase) {
    const isStandingPhase = currentState === window.REP_STATES?.NEUTRAL ||
      phase === REP_PHASES.NEUTRAL ||
      phase === REP_PHASES.LOCKOUT;

    if (isStandingPhase) return REP_PHASES.LOCKOUT;
    if (phase === REP_PHASES.DESCENT) return REP_PHASES.DESCENT;
    if (phase === REP_PHASES.BOTTOM) return REP_PHASES.BOTTOM;
    if (phase === REP_PHASES.ASCENT) return REP_PHASES.ASCENT;
    return REP_PHASES.DESCENT;
  }

  function shouldKeepLiveMetric(metricKey, phase, view) {
    const category = getMetricCategory(metricKey);
    if (category === 'other') return false;

    // 시점(View)에 따른 유효성 필터링: 화면 각도상 정확한 측정이 불가능한 항목 제외
    if (view === 'FRONT' && category === 'hip') return false;
    if (view === 'SIDE' && category === 'symmetry') return false;
    if (view === 'SIDE' && metricKey === 'knee_valgus') return false;
    if (view === 'SIDE' && metricKey === 'knee_alignment') return false;
    if (metricKey === 'heel_contact') {
      return view === 'SIDE' &&
        (phase === REP_PHASES.BOTTOM || phase === REP_PHASES.ASCENT);
    }

    // 상체는 모든 phase에서 평가
    if (category === 'torso') {
      return true;
    }

    // 무릎 정렬은 실제 동작 중(DESCENT, BOTTOM, ASCENT)에서만 평가
    if (category === 'alignment') {
      return phase === REP_PHASES.DESCENT ||
             phase === REP_PHASES.BOTTOM ||
             phase === REP_PHASES.ASCENT;
    }

    // 대칭은 최저점(BOTTOM)과 올라오는 구간(ASCENT)에서만 평가
    if (category === 'symmetry') {
      return phase === REP_PHASES.BOTTOM || phase === REP_PHASES.ASCENT;
    }

    // 힙 힌지는 최저점에서만 live 평가한다.
    // DESCENT 초반/중간의 자연스러운 큰 각도 변화나 깊은 BOTTOM의 작은 각도가
    // 최종 rep hip scorer와 충돌해 빨강/초록으로 깜빡이는 것을 막는다.
    if (category === 'hip') {
      return phase === REP_PHASES.BOTTOM;
    }
    // 깊이(다리 각도) 평가는 완전히 내려갔을 때(BOTTOM)만 적용
    if (category === 'depth') {
      return phase === REP_PHASES.BOTTOM;
    }

    return false;
  }

  function getMetricCategory(metricKey) {
    const key = (metricKey || '').toString().toLowerCase();
    if (!key) return 'other';

    if (key.includes('spine') || key.includes('torso') || key.includes('back') || key.includes('trunk_tibia') || key.includes('lumbar')) {
      return 'torso';
    }
    if (key.includes('hip')) {
      return 'hip';
    }
    if (key.includes('symmetry')) {
      return 'symmetry';
    }
    if (key === 'knee_alignment' || key === 'knee_over_toe' || key === 'heel_contact' || key === 'knee_valgus') {
      return 'alignment';
    }
    if (key === 'depth' || key === 'knee_angle' || key === 'knee_depth' || key === 'left_knee_angle' || key === 'right_knee_angle') {
      return 'depth';
    }

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

  function normalizeLearnView(view) {
    const normalized = (view || '').toString().trim().toUpperCase();
    return ['FRONT', 'SIDE', 'DIAGONAL'].includes(normalized) ? normalized : 'FRONT';
  }

  function readMetric(scoringEngine, angles, metricKey) {
    if (!scoringEngine?.getMetricValue) return null;
    return scoringEngine.getMetricValue(angles, metricKey);
  }

  function createCheck(label, passed, progress = null) {
    return {
      label,
      passed: passed === true,
      progress: Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : (passed ? 1 : 0),
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

  function createFrontLearnSteps() {
    return [
      {
        id: 'front_setup',
        badge: '정면 준비',
        title: '기본 준비 자세',
        instruction: '발을 어깨너비로 두고 무릎과 발끝 방향을 맞춰주세요.',
        hintLines: [
          '전신이 화면 안에 들어오게 서세요.',
          '상체를 곧게 세우고 편하게 호흡하세요.',
        ],
        holdMs: 800,
        successMessage: '좋아요. 이제 천천히 내려가 볼게요.',
        evaluate({ angles, scoringEngine }) {
          const kneeAngle = readMetric(scoringEngine, angles, 'knee_angle');
          const spineAngle = readMetric(scoringEngine, angles, 'spine_angle');
          const kneeValgus = readMetric(scoringEngine, angles, 'knee_valgus');

          return buildLearnEvaluation([
            createCheck('상체를 안정적으로 세웠어요', Number.isFinite(spineAngle) && spineAngle <= 28),
            createCheck('무릎을 편하게 편 상태예요', Number.isFinite(kneeAngle) && kneeAngle >= 150),
            createCheck('무릎이 안쪽으로 무너지지 않아요', Number.isFinite(kneeValgus) && kneeValgus <= 0.09),
          ], '무릎과 발끝 방향을 나란히 맞춰주세요');
        },
      },
      {
        id: 'front_descent',
        badge: '하강 연습',
        title: '무릎 정렬을 유지하며 내려가기',
        instruction: '무릎이 안쪽으로 모이지 않게 하면서 천천히 앉아보세요.',
        hintLines: [
          '무릎은 발끝 방향과 비슷하게 유지하세요.',
          '상체가 급하게 숙여지지 않도록 조절하세요.',
        ],
        holdMs: 700,
        successMessage: '좋아요. 이제 더 낮은 자세를 만들어볼게요.',
        evaluate({ angles, scoringEngine }) {
          const kneeAngle = readMetric(scoringEngine, angles, 'knee_angle');
          const spineAngle = readMetric(scoringEngine, angles, 'spine_angle');
          const kneeValgus = readMetric(scoringEngine, angles, 'knee_valgus');

          return buildLearnEvaluation([
            createCheck('무릎을 굽히며 내려가고 있어요', Number.isFinite(kneeAngle) && kneeAngle <= 145 && kneeAngle >= 115),
            createCheck('무릎 정렬을 유지하고 있어요', Number.isFinite(kneeValgus) && kneeValgus <= 0.09),
            createCheck('상체를 크게 무너뜨리지 않았어요', Number.isFinite(spineAngle) && spineAngle <= 38),
          ], '무릎이 안쪽으로 말리지 않게 힘을 바깥쪽으로 주세요');
        },
      },
      {
        id: 'front_bottom',
        badge: '최저점',
        title: '충분한 깊이 만들기',
        instruction: '무릎 정렬을 유지한 채 더 깊이 앉아 최저점을 만들어주세요.',
        hintLines: [
          '너무 급하게 내려가지 말고 자세를 유지하세요.',
          '발 전체로 바닥을 누른다는 느낌을 가져가세요.',
        ],
        holdMs: 900,
        successMessage: '좋아요. 이제 같은 정렬을 유지하며 일어나면 됩니다.',
        evaluate({ angles, scoringEngine }) {
          const kneeAngle = readMetric(scoringEngine, angles, 'knee_angle');
          const kneeValgus = readMetric(scoringEngine, angles, 'knee_valgus');
          const heelContact = readMetric(scoringEngine, angles, 'heel_contact');

          return buildLearnEvaluation([
            createCheck('충분히 깊이 앉았어요', Number.isFinite(kneeAngle) && kneeAngle <= 118),
            createCheck('무릎 정렬을 계속 유지하고 있어요', Number.isFinite(kneeValgus) && kneeValgus <= 0.1),
            createCheck('발바닥 접지를 유지하고 있어요', heelContact == null || heelContact >= 100),
          ], '뒤꿈치가 뜨지 않게 바닥을 눌러주세요');
        },
      },
      {
        id: 'front_finish',
        badge: '마무리',
        title: '정렬을 유지한 채 일어서기',
        instruction: '무릎 정렬을 유지한 채 다시 편하게 일어서 보세요.',
        hintLines: [
          '올라올 때 무릎과 엉덩이가 함께 펴지게 해주세요.',
          '상체를 과하게 흔들지 마세요.',
        ],
        holdMs: 800,
        successMessage: '좋아요. 정면 스쿼트 학습을 완료했습니다.',
        evaluate({ angles, scoringEngine }) {
          const kneeAngle = readMetric(scoringEngine, angles, 'knee_angle');
          const spineAngle = readMetric(scoringEngine, angles, 'spine_angle');
          const kneeValgus = readMetric(scoringEngine, angles, 'knee_valgus');

          return buildLearnEvaluation([
            createCheck('다시 안정적으로 일어섰어요', Number.isFinite(kneeAngle) && kneeAngle >= 150),
            createCheck('무릎 정렬을 끝까지 유지했어요', Number.isFinite(kneeValgus) && kneeValgus <= 0.09),
            createCheck('상체를 곧게 세웠어요', Number.isFinite(spineAngle) && spineAngle <= 30),
          ], '일어날 때도 무릎이 안쪽으로 무너지지 않게 해주세요');
        },
      },
    ];
  }

  function createSideLearnSteps(selectedView) {
    const viewLabel = selectedView === 'DIAGONAL' ? '측면/대각선 준비' : '측면 준비';

    return [
      {
        id: 'side_setup',
        badge: viewLabel,
        title: '기본 준비 자세',
        instruction: '측면에서 전신이 보이게 서고 발 전체로 바닥을 눌러주세요.',
        hintLines: [
          '몸 전체가 옆에서 잘 보이도록 서세요.',
          '상체를 길게 세우고 시선을 편하게 유지하세요.',
        ],
        holdMs: 800,
        successMessage: '좋아요. 이제 엉덩이를 뒤로 보내며 내려가 볼게요.',
        evaluate({ angles, scoringEngine }) {
          const kneeAngle = readMetric(scoringEngine, angles, 'knee_angle');
          const hipAngle = readMetric(scoringEngine, angles, 'hip_angle');
          const spineAngle = readMetric(scoringEngine, angles, 'spine_angle');

          return buildLearnEvaluation([
            createCheck('무릎을 편하게 편 상태예요', Number.isFinite(kneeAngle) && kneeAngle >= 152),
            createCheck('골반이 안정적인 시작 자세예요', Number.isFinite(hipAngle) && hipAngle >= 145),
            createCheck('상체를 곧게 세웠어요', Number.isFinite(spineAngle) && spineAngle <= 25),
          ], '전신이 측면에서 잘 보이도록 위치를 맞춰주세요');
        },
      },
      {
        id: 'side_hinge',
        badge: '힙 힌지',
        title: '엉덩이를 뒤로 보내며 내려가기',
        instruction: '엉덩이를 뒤로 빼면서 천천히 내려가기 시작해보세요.',
        hintLines: [
          '상체를 접는 것이 아니라 엉덩이를 뒤로 보내는 느낌을 가져가세요.',
          '무릎만 먼저 앞으로 나가지 않게 주의하세요.',
        ],
        holdMs: 700,
        successMessage: '좋아요. 이제 더 낮은 자세를 만들면 됩니다.',
        evaluate({ angles, scoringEngine }) {
          const kneeAngle = readMetric(scoringEngine, angles, 'knee_angle');
          const hipAngle = readMetric(scoringEngine, angles, 'hip_angle');
          const trunkTibia = readMetric(scoringEngine, angles, 'trunk_tibia_angle');

          return buildLearnEvaluation([
            createCheck('무릎을 굽히며 내려가고 있어요', Number.isFinite(kneeAngle) && kneeAngle <= 145 && kneeAngle >= 115),
            createCheck('엉덩이를 뒤로 보내고 있어요', Number.isFinite(hipAngle) && hipAngle <= 130),
            createCheck('상체와 정강이 균형이 크게 무너지지 않았어요', Number.isFinite(trunkTibia) && trunkTibia <= 28),
          ], '엉덩이를 뒤로 빼며 앉는 느낌을 더 가져가세요');
        },
      },
      {
        id: 'side_bottom',
        badge: '최저점',
        title: '깊이와 접지 유지하기',
        instruction: '깊이를 만든 상태에서 뒤꿈치를 유지하며 잠시 버텨보세요.',
        hintLines: [
          '가능한 범위 안에서 허벅지가 충분히 내려오게 해주세요.',
          '뒤꿈치가 바닥에서 뜨지 않게 유지하세요.',
        ],
        holdMs: 900,
        successMessage: '좋아요. 이제 끝까지 일어나며 마무리할게요.',
        evaluate({ angles, scoringEngine }) {
          const kneeAngle = readMetric(scoringEngine, angles, 'knee_angle');
          const hipBelowKnee = readMetric(scoringEngine, angles, 'hip_below_knee');
          const heelContact = readMetric(scoringEngine, angles, 'heel_contact');

          return buildLearnEvaluation([
            createCheck('충분한 깊이를 만들었어요', Number.isFinite(kneeAngle) && kneeAngle <= 120),
            createCheck('엉덩이가 무릎 높이까지 내려왔어요', hipBelowKnee == null || hipBelowKnee >= 100),
            createCheck('뒤꿈치 접지를 유지했어요', heelContact == null || heelContact >= 100),
          ], '뒤꿈치가 뜨지 않게 바닥을 눌러주세요');
        },
      },
      {
        id: 'side_finish',
        badge: '마무리',
        title: '끝까지 일어나기',
        instruction: '상체를 안정적으로 유지하며 다시 끝까지 일어서주세요.',
        hintLines: [
          '무릎과 엉덩이가 함께 펴지도록 올라오세요.',
          '상체가 과하게 숙여진 채로 끝나지 않게 해주세요.',
        ],
        holdMs: 800,
        successMessage: '좋아요. 측면 스쿼트 학습을 완료했습니다.',
        evaluate({ angles, scoringEngine }) {
          const kneeAngle = readMetric(scoringEngine, angles, 'knee_angle');
          const hipAngle = readMetric(scoringEngine, angles, 'hip_angle');
          const spineAngle = readMetric(scoringEngine, angles, 'spine_angle');

          return buildLearnEvaluation([
            createCheck('다시 안정적으로 일어섰어요', Number.isFinite(kneeAngle) && kneeAngle >= 152),
            createCheck('골반을 끝까지 펴줬어요', Number.isFinite(hipAngle) && hipAngle >= 145),
            createCheck('상체를 안정적으로 세웠어요', Number.isFinite(spineAngle) && spineAngle <= 28),
          ], '마지막까지 상체를 곧게 세우며 일어나세요');
        },
      },
    ];
  }

  registry.register('squat', squatExercise);
})();

/**
 * view별 스쿼트 채점 metric 우선순위 반환
 * - FRONT: knee_alignment 1차, depth 2차 / hip_hinge는 hard-fail 불가
 * - SIDE: depth + hip_hinge 1차, torso_stability 2차 / knee_alignment는 hard-fail 불가
 * - DIAGONAL (기본): depth 1차, torso_stability 2차 / knee_alignment는 hard-fail 불가
 */
function getSquatMetricPriority(view) {
  if (view === 'FRONT') {
    return {
      primary: ['knee_alignment'],
      secondary: ['depth'],
      disallowedHardFailMetrics: ['hip_hinge'],
    };
  }
  if (view === 'SIDE') {
    return {
      primary: ['depth', 'hip_hinge'],
      secondary: ['torso_stability'],
      disallowedHardFailMetrics: ['knee_alignment'],
    };
  }
  // DIAGONAL and unknown views
  return {
    primary: ['depth'],
    secondary: ['torso_stability'],
    disallowedHardFailMetrics: ['knee_alignment'],
  };
}

if (typeof module !== 'undefined') {
  module.exports = {
    ...(module.exports || {}),
    getSquatMetricPriority,
  };
}
