const { supabase } = require('../config/db');
const { buildQuestCardModel, refreshQuestProgressForRows } = require('./quest');

const RESULT_BASIS_CODES = ['REPS', 'DURATION'];
const RESULT_UNIT_CODES = ['COUNT', 'SEC'];
const ROUTINE_INSTANCE_STATUSES = ['RUNNING', 'DONE', 'ABORTED'];

const normalizeResultBasis = (value) => {
    const basis = String(value || '').trim().toUpperCase();
    return RESULT_BASIS_CODES.includes(basis) ? basis : null;
};

const normalizeResultUnit = (value) => {
    const unit = String(value || '').trim().toUpperCase();
    return RESULT_UNIT_CODES.includes(unit) ? unit : null;
};

const toSafeInt = (value, fallback = 0) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Math.round(parsed));
};

const clampScore = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.min(100, Math.round(parsed)));
};

const computeDurationSecFromRange = (startedAtIso, endedAtIso = new Date().toISOString()) => {
    const startMs = new Date(startedAtIso).getTime();
    const endMs = new Date(endedAtIso).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return 0;
    return Math.max(0, Math.round((endMs - startMs) / 1000));
};

const pad2 = (value) => String(value).padStart(2, '0');
const toLocalDateKey = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
const ACTIVITY_HEATMAP_DAYS = 365;

const getActivityLevel = (workoutCount) => {
    const count = toSafeInt(workoutCount, 0);
    if (count >= 6) return 4;
    if (count >= 4) return 3;
    if (count >= 2) return 2;
    if (count >= 1) return 1;
    return 0;
};

const getActivityHeatmapRange = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const start = new Date(today);
    start.setDate(start.getDate() - (ACTIVITY_HEATMAP_DAYS - 1));

    const alignedStart = new Date(start);
    alignedStart.setDate(alignedStart.getDate() - alignedStart.getDay());
    alignedStart.setHours(0, 0, 0, 0);

    return {
        start: alignedStart,
        end: today
    };
};

const buildActivityHeatmapDays = (workoutCountByDate = new Map()) => {
    const { start, end } = getActivityHeatmapRange();
    const days = [];
    const cursor = new Date(start);

    while (cursor <= end) {
        const dateKey = toLocalDateKey(cursor);
        const workoutCount = toSafeInt(workoutCountByDate.get(dateKey), 0);
        const level = getActivityLevel(workoutCount);
        days.push({
            date: dateKey,
            workoutCount,
            hasWorkout: level > 0,
            level
        });
        cursor.setDate(cursor.getDate() + 1);
    }

    return days;
};

const parseDateKey = (dateKey) => {
    const [year, month, day] = String(dateKey).split('-').map((v) => Number(v));
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
        return null;
    }
    return new Date(year, month - 1, day);
};

const getTodayRange = () => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);

    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    return { start, end };
};

const getWeekRange = () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    return { start: monday, end: sunday };
};

const normalizeSessionResult = (session) => {
    const basis = normalizeResultBasis(session?.result_basis) || 'REPS';
    const unit = normalizeResultUnit(session?.total_result_unit) || (basis === 'REPS' ? 'COUNT' : 'SEC');
    const resultValue = toSafeInt(session?.total_result_value, 0);
    const durationSec = computeDurationSecFromRange(session?.started_at, session?.ended_at || new Date().toISOString());
    const totalReps = basis === 'REPS' || unit === 'COUNT' ? resultValue : 0;
    const totalDurationResultSec = basis === 'DURATION' || unit === 'SEC' ? resultValue : 0;

    return {
        ...session,
        result_basis: basis,
        total_result_unit: unit,
        total_result_value: resultValue,
        duration_sec: durationSec,
        total_reps: totalReps,
        total_duration_result_sec: totalDurationResultSec,
        final_score: clampScore(session?.final_score)
    };
};

const aggregateSessionSummary = (sessions = []) => {
    const normalized = sessions.map((session) => normalizeSessionResult(session));
    const count = normalized.length;
    const totalMinutes = Math.round(normalized.reduce((sum, row) => sum + (row.duration_sec || 0), 0) / 60);
    const totalReps = normalized.reduce((sum, row) => sum + (row.total_reps || 0), 0);
    const totalDurationResultSec = normalized.reduce((sum, row) => sum + (row.total_duration_result_sec || 0), 0);
    const avgScore = count > 0
        ? Math.round(normalized.reduce((sum, row) => sum + (row.final_score || 0), 0) / count)
        : 0;

    return {
        count,
        totalMinutes,
        totalReps,
        totalDurationResultSec,
        avgScore
    };
};

const formatKoreanDate = () => {
    const now = new Date();
    return `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;
};

const calculateStreak = async (userId) => {
    try {
        const lookback = new Date();
        lookback.setDate(lookback.getDate() - 365);

        const { data: sessions, error } = await supabase
            .from('workout_session')
            .select('started_at')
            .eq('user_id', userId)
            .eq('status', 'DONE')
            .gte('started_at', lookback.toISOString())
            .order('started_at', { ascending: false });

        if (error || !sessions?.length) return 0;

        const uniqueKeys = [];
        const seen = new Set();
        for (const session of sessions) {
            const date = new Date(session.started_at);
            if (Number.isNaN(date.getTime())) continue;
            const key = toLocalDateKey(date);
            if (seen.has(key)) continue;
            seen.add(key);
            uniqueKeys.push(key);
        }

        if (!uniqueKeys.length) return 0;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const first = uniqueKeys[0];
        const firstDate = parseDateKey(first);
        if (!firstDate) return 0;
        if (toLocalDateKey(firstDate) !== toLocalDateKey(today) && toLocalDateKey(firstDate) !== toLocalDateKey(yesterday)) {
            return 0;
        }

        let streak = 1;
        for (let i = 1; i < uniqueKeys.length; i += 1) {
            const prevDate = parseDateKey(uniqueKeys[i - 1]);
            const currDate = parseDateKey(uniqueKeys[i]);
            if (!prevDate || !currDate) break;

            const diffDays = Math.round((prevDate - currDate) / 86400000);
            if (diffDays === 1) {
                streak += 1;
            } else {
                break;
            }
        }

        return streak;
    } catch (error) {
        console.error('Streak calculation error:', error);
        return 0;
    }
};

const getYearActivityHeatmap = async (userId) => {
    try {
        const { start, end } = getActivityHeatmapRange();
        const endExclusive = new Date(end);
        endExclusive.setDate(endExclusive.getDate() + 1);

        const { data: sessions, error } = await supabase
            .from('workout_session')
            .select('started_at')
            .eq('user_id', userId)
            .eq('status', 'DONE')
            .gte('started_at', start.toISOString())
            .lt('started_at', endExclusive.toISOString());
        if (error) throw error;

        const countByDate = new Map();
        (sessions || []).forEach((session) => {
            const startedAt = new Date(session.started_at);
            if (Number.isNaN(startedAt.getTime())) return;
            const dateKey = toLocalDateKey(startedAt);
            const currentCount = toSafeInt(countByDate.get(dateKey), 0);
            countByDate.set(dateKey, currentCount + 1);
        });

        return buildActivityHeatmapDays(countByDate);
    } catch (error) {
        console.error('Activity fetch error:', error);
        return buildActivityHeatmapDays();
    }
};

const buildRoutineStatsById = (instances = [], routineIds = []) => {
    const statsById = new Map(
        routineIds.map((routineId) => [routineId, {
            total_runs: 0,
            done_runs: 0,
            aborted_runs: 0,
            running_runs: 0,
            avg_score: null,
            best_score: null,
            last_run_at: null,
            last_status: null
        }])
    );

    for (const instance of instances) {
        const routineId = instance.routine_id;
        if (!statsById.has(routineId)) continue;

        const stats = statsById.get(routineId);
        const status = String(instance.status || '').toUpperCase();
        const score = Number(instance.total_score);
        const runAt = instance.ended_at || instance.started_at || null;

        stats.total_runs += 1;
        if (status === 'DONE') stats.done_runs += 1;
        if (status === 'ABORTED') stats.aborted_runs += 1;
        if (status === 'RUNNING') stats.running_runs += 1;

        if (runAt) {
            const currentLast = stats.last_run_at ? new Date(stats.last_run_at).getTime() : 0;
            const incoming = new Date(runAt).getTime();
            if (!Number.isNaN(incoming) && incoming > currentLast) {
                stats.last_run_at = runAt;
                stats.last_status = status;
            }
        }

        if (status === 'DONE' && Number.isFinite(score)) {
            if (!Array.isArray(stats._scores)) stats._scores = [];
            stats._scores.push(score);
            stats.best_score = stats.best_score == null ? score : Math.max(stats.best_score, score);
        }
    }

    for (const stats of statsById.values()) {
        const scores = Array.isArray(stats._scores) ? stats._scores : [];
        stats.avg_score = scores.length > 0
            ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 100) / 100
            : null;
        delete stats._scores;
    }

    return statsById;
};

const enrichQuickRoutines = async (userId, routines = []) => {
    const routineIds = routines.map((routine) => routine.routine_id);
    if (!routineIds.length) return [];

    const { data: instances, error } = await supabase
        .from('routine_instance')
        .select('routine_instance_id, routine_id, status, started_at, ended_at, total_score')
        .eq('user_id', userId)
        .in('routine_id', routineIds)
        .in('status', ROUTINE_INSTANCE_STATUSES)
        .order('started_at', { ascending: false });
    if (error) throw error;

    const statsById = buildRoutineStatsById(instances || [], routineIds);

    return routines.map((routine) => ({
        ...routine,
        step_count: Array.isArray(routine.routine_setup) ? routine.routine_setup.length : 0,
        runtime_stats: statsById.get(routine.routine_id) || {
            total_runs: 0,
            done_runs: 0,
            aborted_runs: 0,
            running_runs: 0,
            avg_score: null,
            best_score: null,
            last_run_at: null,
            last_status: null
        }
    }));
};

const getTierInfo = (pointsRows = [], tierRulesRows = []) => {
    const totalPoints = (pointsRows || []).reduce((sum, row) => sum + (Number(row.points) || 0), 0);

    const fallbackTiers = [
        { tier: 1, min_points: 0, name: '브론즈', emoji: '🥉' },
        { tier: 2, min_points: 300, name: '실버', emoji: '🥈' },
        { tier: 3, min_points: 1000, name: '골드', emoji: '🥇' },
        { tier: 4, min_points: 3000, name: '플래티넘', emoji: '💎' },
        { tier: 5, min_points: 10000, name: '다이아몬드', emoji: '👑' }
    ];

    const emojiByName = {
        브론즈: '🥉',
        실버: '🥈',
        골드: '🥇',
        플래티넘: '💎',
        다이아몬드: '👑'
    };

    const effectiveRules = (tierRulesRows || []).length > 0
        ? tierRulesRows.map((rule) => ({
            ...rule,
            emoji: emojiByName[rule.name] || '🏆'
        }))
        : fallbackTiers;

    let currentTier = effectiveRules[0];
    let nextTier = null;

    for (let i = effectiveRules.length - 1; i >= 0; i -= 1) {
        if (totalPoints >= (Number(effectiveRules[i].min_points) || 0)) {
            currentTier = effectiveRules[i];
            nextTier = i < effectiveRules.length - 1 ? effectiveRules[i + 1] : null;
            break;
        }
    }

    const currentMin = Number(currentTier.min_points) || 0;
    const nextMin = nextTier ? Number(nextTier.min_points) || currentMin : currentMin;
    const progress = nextTier
        ? Math.min(100, Math.round(((totalPoints - currentMin) / Math.max(1, nextMin - currentMin)) * 100))
        : 100;

    return {
        name: currentTier.name,
        emoji: currentTier.emoji || '🏆',
        points: totalPoints,
        nextTierName: nextTier?.name || null,
        pointsToNext: nextTier ? Math.max(0, nextMin - totalPoints) : 0,
        progress
    };
};

const getExerciseEmoji = (code) => {
    const normalized = String(code || '').trim().toLowerCase();
    const map = {
        squat: '🏋️',
        push_up: '💪',
        pushup: '💪',
        lunge: '🦵',
        plank: '🧘',
        burpee: '🔥',
        deadlift: '🏋️',
        shoulder_press: '🏐',
        bicep_curl: '💪'
    };
    return map[normalized] || '🎯';
};

const sortQuestCardsForHome = (cards = []) => {
    const list = Array.isArray(cards) ? [...cards] : [];

    const completionRank = (quest) => {
        const status = String(quest?.status || '').toUpperCase();
        const isCompleted = status === 'DONE';
        return isCompleted ? 1 : 0;
    };

    const progressRatio = (quest) => {
        const progress = toSafeInt(quest?.progress, 0);
        const target = Math.max(1, toSafeInt(quest?.target, 1));
        return Math.min(1, progress / target);
    };

    return list.sort((a, b) => {
        const completionDiff = completionRank(a) - completionRank(b);
        if (completionDiff !== 0) return completionDiff;

        // 미완료 그룹에서는 달성률이 높은 퀘스트를 먼저 보여준다.
        const ratioDiff = progressRatio(b) - progressRatio(a);
        if (ratioDiff !== 0) return ratioDiff;

        return toSafeInt(b?.reward, 0) - toSafeInt(a?.reward, 0);
    });
};

// 홈페이지 렌더링 (로그인 사용자용)
const getHomePage = async (req, res, next) => {
    try {
        const isAuthenticated = res.locals.isAuthenticated;
        const user = res.locals.user;

        if (!isAuthenticated || !user) {
            return res.render('home', {
                title: 'Home',
                today: formatKoreanDate(),
                activeTab: 'home',
                streak: 0,
                todaySummary: { count: 0, totalMinutes: 0, totalReps: 0, totalDurationResultSec: 0, avgScore: 0 },
                weekSummary: { count: 0, totalMinutes: 0, totalReps: 0, totalDurationResultSec: 0, avgScore: 0 },
                dailyQuests: [],
                weeklyQuests: [],
                activityDays: buildActivityHeatmapDays(),
                quickRoutines: [],
                routines: [],
                exercises: [],
                recentSessions: [],
                tierInfo: null
            });
        }

        const userId = user.user_id;

        const todayRange = getTodayRange();
        const weekRange = getWeekRange();
        const todayYmd = toLocalDateKey(todayRange.start);
        const weekStartYmd = toLocalDateKey(weekRange.start);
        const weekEndYmd = toLocalDateKey(weekRange.end);

        const [
            streak,
            activityDays,
            todaySessionsResult,
            weekSessionsResult,
            dailyQuestsResult,
            weeklyQuestsResult
        ] = await Promise.all([
            calculateStreak(userId),
            getYearActivityHeatmap(userId),
            supabase
                .from('workout_session')
                .select('session_id, started_at, ended_at, final_score, result_basis, total_result_value, total_result_unit')
                .eq('user_id', userId)
                .eq('status', 'DONE')
                .gte('started_at', todayRange.start.toISOString())
                .lte('started_at', todayRange.end.toISOString()),
            supabase
                .from('workout_session')
                .select('session_id, started_at, ended_at, final_score, result_basis, total_result_value, total_result_unit')
                .eq('user_id', userId)
                .eq('status', 'DONE')
                .gte('started_at', weekRange.start.toISOString())
                .lte('started_at', weekRange.end.toISOString()),
            supabase
                .from('user_quest')
                .select(`
                    user_quest_id,
                    progress,
                    status,
                    period_start,
                    period_end,
                    quest_template:quest_template_id (
                        quest_template_id,
                        title,
                        scope,
                        type,
                        condition,
                        reward_points
                    )
                `)
                .eq('user_id', userId)
                .in('status', ['ACTIVE', 'DONE'])
                .lte('period_start', todayYmd)
                .gte('period_end', todayYmd),
            supabase
                .from('user_quest')
                .select(`
                    user_quest_id,
                    progress,
                    status,
                    period_start,
                    period_end,
                    quest_template:quest_template_id (
                        quest_template_id,
                        title,
                        scope,
                        type,
                        condition,
                        reward_points
                    )
                `)
                .eq('user_id', userId)
                .in('status', ['ACTIVE', 'DONE'])
                .lte('period_start', weekEndYmd)
                .gte('period_end', weekStartYmd)
        ]);

        if (todaySessionsResult.error) throw todaySessionsResult.error;
        if (weekSessionsResult.error) throw weekSessionsResult.error;
        if (dailyQuestsResult.error) throw dailyQuestsResult.error;
        if (weeklyQuestsResult.error) throw weeklyQuestsResult.error;

        const dailyQuestRows = (dailyQuestsResult.data || [])
            .filter((quest) => quest.quest_template?.scope === 'DAILY');
        const weeklyQuestRows = (weeklyQuestsResult.data || [])
            .filter((quest) => quest.quest_template?.scope === 'WEEKLY');

        const activeQuestRows = [...dailyQuestRows, ...weeklyQuestRows]
            .filter((quest) => String(quest.status || '').toUpperCase() === 'ACTIVE');

        let refreshedProgressMap = new Map();
        if (activeQuestRows.length > 0) {
            try {
                refreshedProgressMap = await refreshQuestProgressForRows(userId, activeQuestRows);
            } catch (questSyncError) {
                console.error('Home quest progress sync error:', questSyncError);
            }
        }

        const applyLatestProgress = (quest) => {
            const latestProgress = refreshedProgressMap.get(quest.user_quest_id);
            if (!latestProgress) return quest;
            return { ...quest, progress: latestProgress };
        };

        // 최신 퀘스트 구조(JSONB progress)를 카드 모델로 변환 후,
        // 홈에서는 미완료 퀘스트가 먼저 보이도록 정렬한다.
        const dailyQuests = sortQuestCardsForHome(
            dailyQuestRows.map(applyLatestProgress).map(buildQuestCardModel)
        );

        const weeklyQuests = sortQuestCardsForHome(
            weeklyQuestRows.map(applyLatestProgress).map(buildQuestCardModel)
        );

        const todaySummary = aggregateSessionSummary(todaySessionsResult.data || []);
        const weekSummary = aggregateSessionSummary(weekSessionsResult.data || []);

        return res.render('home', {
            title: 'Home',
            today: formatKoreanDate(),
            activeTab: 'home',
            streak,
            todaySummary,
            weekSummary,
            dailyQuests,
            weeklyQuests,
            activityDays,
            quickRoutines: [],
            routines: [],
            exercises: [],
            recentSessions: [],
            tierInfo: null
        });
    } catch (error) {
        console.error('Home page error:', error);
        next(error);
    }
};

module.exports = {
    getHomePage,
    formatKoreanDate
};
