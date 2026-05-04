# AI Growth Report Phase 2: Workout History Repository

> Parent roadmap: `docs/plans/2026-05-03_ai_growth_report_implementation_plan.md`
> MVP policy: on-demand only. 리포트 결과는 DB에 저장하지 않는다.

## Phase 2: Workout History Repository

**목표:** 기존 DB에서 사용자 운동 기록을 읽어 `HistoryTrendFeature` 입력 형태로 제공한다. MVP에서는 리포트 저장/cache repository를 구현하지 않는다.

### Task 7: 운동 기록 Repository 추가

**파일:**
- 생성: `backend/analysis/repository/workout-history.repository.js`
- 테스트: `test/analysis/repository/workout-history.repository.test.js`

- [ ] **단계 1: 가짜 Supabase 클라이언트로 실패하는 테스트 작성**

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const { createWorkoutHistoryRepository } = require('../../../backend/analysis/repository/workout-history.repository');

test('getRecentHistory queries user sessions, metrics, and events', async () => {
  const calls = [];
  const fakeSupabase = {
    from(table) {
      calls.push(table);
      return makeQuery(table);
    },
  };
  function makeQuery(table) {
    const chain = {
      select() { return chain; },
      eq() { return chain; },
      in() { return chain; },
      order() { return chain; },
      limit() { return Promise.resolve({ data: table === 'workout_session' ? [{ session_id: 's1', exercise: { code: 'squat', name: '스쿼트' } }] : [], error: null }); },
    };
    return chain;
  }

  const repo = createWorkoutHistoryRepository({ supabase: fakeSupabase });
  const result = await repo.getRecentHistory({ userId: 'u1', exercise: 'squat', limit: 5 });

  assert.equal(result.sessions.length, 1);
  assert.ok(calls.includes('workout_session'));
  assert.ok(calls.includes('session_snapshot_metric'));
  assert.ok(calls.includes('session_event'));
});
```

- [ ] **단계 2: 테스트 실행 — 실패 확인**

실행: `node --test test/analysis/repository/workout-history.repository.test.js`

예상: 모듈 없음 오류로 실패.

- [ ] **단계 3: Repository 구현**

```js
const { supabase: defaultSupabase } = require('../../../config/db');

function createWorkoutHistoryRepository({ supabase = defaultSupabase } = {}) {
  async function getRecentHistory({ userId, exercise = 'all', limit = 5 } = {}) {
    let sessionQuery = supabase
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

    const [{ data: metrics, error: metricError }, { data: events, error: eventError }] = await Promise.all([
      supabase.from('session_snapshot_metric').select('*').in('session_id', sessionIds),
      supabase.from('session_event').select('*').in('session_id', sessionIds),
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
```

- [ ] **단계 4: 테스트 실행**

실행: `node --test test/analysis/repository/workout-history.repository.test.js`

예상: 성공.

- [ ] **단계 5: 커밋**

```bash
git add backend/analysis/repository/workout-history.repository.js test/analysis/repository/workout-history.repository.test.js
git commit -m "feat(analysis): add workout history repository"
```

---

## Deferred Cache Persistence

- `session_event` 기반 AI 리포트 저장은 MVP 범위가 아니다.
- 캐시 저장이 필요하면 `2026-05-04_ai_growth_report_deferred-cache-persistence.md`를 먼저 보고 schema migration 결정을 확정한다.
