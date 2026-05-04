const test = require('node:test');
const assert = require('node:assert/strict');

const { createWorkoutHistoryRepository } = require('../../../backend/analysis/repository/workout-history.repository');

function createFakeSupabase({ sessions = [], snapshots = [], metrics = [], events = [] } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      calls.push(table);
      return createQueryChain(table, { sessions, snapshots, metrics, events });
    },
  };
}

function createQueryChain(table, data) {
  const chain = {
    _table: table,
    _filters: [],
    select() { return chain; },
    eq(field, value) { chain._filters.push({ field, value }); return chain; },
    in(field, values) { chain._filters.push({ field, values }); return chain; },
    order() { return chain; },
    limit(n) { chain._limit = n; return chain; },
    then(resolve) {
      let result;
      if (table === 'workout_session') {
        result = data.sessions;
      } else if (table === 'session_snapshot') {
        result = data.snapshots;
      } else if (table === 'session_snapshot_metric') {
        result = data.metrics;
      } else if (table === 'session_event') {
        result = data.events;
      } else {
        result = [];
      }
      if (chain._limit && result) result = result.slice(0, chain._limit);
      resolve({ data: result, error: null });
    },
  };
  return chain;
}

test('getRecentHistory queries sessions, snapshots, metrics, and events', async () => {
  const fakeSupabase = createFakeSupabase({
    sessions: [
      { session_id: 's1', user_id: 'u1', exercise_id: 'ex1', ended_at: '2026-04-01', final_score: 60, status: 'done', exercise: { code: 'squat', name: '스쿼트' } },
    ],
    snapshots: [
      { session_id: 's1', session_snapshot_id: 'snap1', snapshot_type: 'FINAL' },
    ],
    metrics: [
      { session_snapshot_id: 'snap1', metric_key: 'depth', metric_name: '스쿼트 깊이', avg_score: 65, sample_count: 12 },
    ],
    events: [
      { session_id: 's1', type: 'LOW_SCORE_HINT' },
    ],
  });

  const repo = createWorkoutHistoryRepository({ supabase: fakeSupabase });
  const result = await repo.getRecentHistory({ userId: 'u1', exercise: 'squat', limit: 5 });

  assert.equal(result.sessions.length, 1);
  assert.equal(result.sessions[0].session_id, 's1');
  assert.equal(result.sessions[0].exercise_key, 'squat');
  assert.equal(result.metrics.length, 1);
  assert.equal(result.metrics[0].metric_key, 'depth');
  assert.equal(result.metrics[0].session_id, 's1');
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].type, 'LOW_SCORE_HINT');
  assert.ok(fakeSupabase.calls.includes('workout_session'));
  assert.ok(fakeSupabase.calls.includes('session_snapshot'));
  assert.ok(fakeSupabase.calls.includes('session_snapshot_metric'));
  assert.ok(fakeSupabase.calls.includes('session_event'));
});

test('getRecentHistory returns empty arrays when no sessions found', async () => {
  const fakeSupabase = createFakeSupabase({ sessions: [] });
  const repo = createWorkoutHistoryRepository({ supabase: fakeSupabase });
  const result = await repo.getRecentHistory({ userId: 'u999', exercise: 'squat', limit: 5 });

  assert.deepEqual(result.sessions, []);
  assert.deepEqual(result.metrics, []);
  assert.deepEqual(result.events, []);
  assert.ok(!fakeSupabase.calls.includes('session_snapshot'));
});

test('getRecentHistory filters by exercise code', async () => {
  const fakeSupabase = createFakeSupabase({
    sessions: [
      { session_id: 's1', exercise_id: 'ex1', ended_at: '2026-04-01', exercise: { code: 'squat', name: '스쿼트' } },
      { session_id: 's2', exercise_id: 'ex2', ended_at: '2026-04-02', exercise: { code: 'pushup', name: '푸시업' } },
    ],
    snapshots: [],
    metrics: [],
    events: [],
  });

  const repo = createWorkoutHistoryRepository({ supabase: fakeSupabase });
  const result = await repo.getRecentHistory({ userId: 'u1', exercise: 'squat', limit: 5 });

  assert.equal(result.sessions.length, 1);
  assert.equal(result.sessions[0].exercise_key, 'squat');
});
