function getDefaultSupabase() {
  return require('../../../config/db').supabase;
}

function createWorkoutHistoryRepository({ supabase } = {}) {
  const client = supabase || getDefaultSupabase();
  async function getRecentHistory({ userId, exercise = 'all', limit = 5 } = {}) {
    let sessionQuery = client
      .from('workout_session')
      .select('session_id,user_id,exercise_id,selected_view,started_at,ended_at,duration_sec,total_reps,final_score,status,summary_feedback,exercise:exercise_id(code,name)')
      .eq('user_id', userId)
      .order('ended_at', { ascending: false })
      .limit(limit * 2);

    const { data: sessions, error: sessionError } = await sessionQuery;
    if (sessionError) throw sessionError;

    const filteredSessions = (sessions || [])
      .filter((session) => exercise === 'all' || session?.exercise?.code === exercise)
      .slice(0, limit * 2)
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
      metrics: metrics || [],
      events: events || [],
    };
  }

  return { getRecentHistory };
}

module.exports = { createWorkoutHistoryRepository };
