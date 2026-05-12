function getDefaultSupabase() {
  return require('../../../config/db').supabase;
}

function createWorkoutHistoryRepository({ supabase } = {}) {
  const client = supabase || getDefaultSupabase();
  async function getRecentHistory({ userId, exercise = 'all', limit = 5, endedAfter = null } = {}) {
    // 운동 코드가 지정된 경우 exercise_id를 먼저 조회하여 DB에서 필터링
    let exerciseIdFilter = null;
    if (exercise !== 'all') {
      const { data: exerciseData } = await client
        .from('exercise')
        .select('exercise_id')
        .eq('code', exercise.toUpperCase())
        .maybeSingle();
      if (exerciseData) {
        exerciseIdFilter = exerciseData.exercise_id;
      }
    }

    let sessionQuery = client
      .from('workout_session')
      .select('session_id,user_id,exercise_id,selected_view,started_at,ended_at,final_score,status,summary_feedback,exercise:exercise_id(code,name)')
      .eq('user_id', userId);

    if (exerciseIdFilter) {
      sessionQuery = sessionQuery.eq('exercise_id', exerciseIdFilter);
    }

    if (endedAfter) {
      sessionQuery = sessionQuery.gte('ended_at', endedAfter);
    }

    sessionQuery = sessionQuery
      .order('ended_at', { ascending: false })
      .limit(limit);

    const { data: sessions, error: sessionError } = await sessionQuery;
    if (sessionError) throw sessionError;

    const filteredSessions = (sessions || [])
      .filter((session) => exercise === 'all' || session?.exercise?.code?.toLowerCase() === exercise.toLowerCase())
      .slice(0, limit)
      .reverse();
    const sessionIds = filteredSessions.map((session) => session.session_id).filter(Boolean);

    if (sessionIds.length === 0) {
      return { sessions: [], metrics: [], events: [] };
    }

    const { data: snapshots, error: snapshotError } = await client
      .from('session_snapshot')
      .select('session_id, session_snapshot_id, snapshot_type')
      .in('session_id', sessionIds)
      .eq('snapshot_type', 'FINAL');
    if (snapshotError) throw snapshotError;

    const snapshotIds = (snapshots || []).map((s) => s.session_snapshot_id).filter(Boolean);
    const sessionIdBySnapshotId = new Map((snapshots || []).map((s) => [s.session_snapshot_id, s.session_id]));

    const [{ data: metrics, error: metricError }, { data: events, error: eventError }] = await Promise.all([
      snapshotIds.length > 0
        ? client.from('session_snapshot_metric').select('session_snapshot_id,metric_key,metric_name,avg_score,sample_count').in('session_snapshot_id', snapshotIds)
        : Promise.resolve({ data: [], error: null }),
      client.from('session_event').select('session_id,type,event_time').in('session_id', sessionIds),
    ]);
    if (metricError) throw metricError;
    if (eventError) throw eventError;

    return {
      sessions: filteredSessions.map((session) => ({
        ...session,
        exercise_key: session?.exercise?.code,
        exercise_name: session?.exercise?.name,
      })),
      metrics: (metrics || []).map((metric) => ({
        ...metric,
        session_id: sessionIdBySnapshotId.get(metric.session_snapshot_id),
      })),
      events: events || [],
    };
  }

  return { getRecentHistory };
}

module.exports = { createWorkoutHistoryRepository };
