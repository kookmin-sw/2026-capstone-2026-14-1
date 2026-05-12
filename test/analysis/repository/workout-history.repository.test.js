const test = require('node:test');
const assert = require('node:assert/strict');

const { createWorkoutHistoryRepository } = require('../../../backend/analysis/repository/workout-history.repository');

function createFakeSupabase({ sessions = [], snapshots = [], metrics = [], events = [] } = {}) {
  const calls = [];
  const queries = [];
  return {
    calls,
    queries,
    from(table) {
      calls.push(table);
      const chain = createQueryChain(table, { sessions, snapshots, metrics, events });
      queries.push(chain);
      return chain;
    },
  };
}

function createQueryChain(table, data) {
  const chain = {
    _table: table,
    _filters: [],
    _singleResult: null,
    select() { return chain; },
    eq(field, value) { chain._filters.push({ field, value }); return chain; },
    gte(field, value) { chain._filters.push({ field, value, operator: 'gte' }); return chain; },
    in(field, values) { chain._filters.push({ field, values }); return chain; },
    order() { return chain; },
    limit(n) { chain._limit = n; return chain; },
    maybeSingle() { chain._singleResult = true; return chain; },
    then(resolve) {
      let result;
      if (table === 'exercise') {
        result = [{ exercise_id: 'ex1' }];        // 운동 코드 조회 모의
      } else if (table === 'workout_session') {
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
      if (chain._singleResult && Array.isArray(result)) {
        result = result[0] || null;
        resolve({ data: result, error: null });
      } else {
        if (chain._limit && result) result = result.slice(0, chain._limit);
        resolve({ data: result, error: null });
      }
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

test('getRecentHistory applies endedAfter date filter to workout sessions', async () => {
  const fakeSupabase = createFakeSupabase({
    sessions: [
      { session_id: 's1', user_id: 'u1', ended_at: '2026-05-01', exercise: { code: 'squat', name: 'squat' } },
    ],
    snapshots: [],
    metrics: [],
    events: [],
  });
  const repo = createWorkoutHistoryRepository({ supabase: fakeSupabase });

  await repo.getRecentHistory({
    userId: 'u1',
    exercise: 'all',
    limit: 50,
    endedAfter: '2026-04-12T00:00:00.000Z',
  });

  const sessionQuery = fakeSupabase.queries.find((query) => query._table === 'workout_session');
  assert.ok(sessionQuery._filters.some((filter) => (
    filter.operator === 'gte'
    && filter.field === 'ended_at'
    && filter.value === '2026-04-12T00:00:00.000Z'
  )));
  assert.equal(sessionQuery._limit, 50);
});
