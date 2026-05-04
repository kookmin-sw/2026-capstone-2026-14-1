# AI Growth Report Phase 0: Schema Compatibility

> Parent roadmap: `docs/plans/2026-05-03_ai_growth_report_implementation_plan.md`
> MVP policy: on-demand only. 리포트 결과는 DB에 저장하지 않는다.

## Phase 0: DB/schema compatibility spike

**목표:** 구현 전에 현재 DB 스키마와 계획의 저장/조회 가정이 맞는지 확정한다. 이 Phase가 끝나기 전에는 Phase 2 Repository, Phase 4 Service/API, Phase 5 UI를 구현하지 않는다.

### Task 0: DB/schema compatibility spike

**파일:**
- 수정: `docs/specs/2026-05-03_fitplus_ai_growth_report_spec.md`
- 수정: `docs/plans/2026-05-03_ai_growth_report_implementation_plan.md`
- 생성: `test/analysis/compat/ai-growth-report-query-shape.test.js`

- [x] **단계 1: 현재 DB 스키마 확인**

실행:

```bash
sed -n '229,238p' docs/sql/DB_init.sql
sed -n '250,270p' docs/database_structure.md
rg -n "session_event|session_snapshot_metric|session_snapshot_score" controllers docs/sql docs/database_structure.md
```

예상 확인 사항:

```text
session_event:
- session_id BIGINT NOT NULL
- event_time TIMESTAMPTZ
- type VARCHAR(50)
- payload JSONB
- user_id 컬럼 없음
- occurred_at 컬럼 없음

session_snapshot_metric:
- session_id가 아니라 session_snapshot_id 기준으로 저장/조회
- workout_session -> session_snapshot -> session_snapshot_metric 순서로 조회해야 함
```

- [x] **단계 2: 캐시 저장 정책 확정**

현재 스키마가 위 예상과 같다면 MVP에서는 `session_event` 캐시를 바로 구현하지 않는다. `session_event`는 세션 종속 이벤트 테이블이라 `session_id = null`, `user_id`, `occurred_at` 기반 사용자 리포트 캐시에 맞지 않는다.

현재 스키마가 그대로라면 이 계획에서 다음 결정을 적용한다:

```text
MVP cache policy:
- GET /api/users/me/coach-report 는 on-demand로 계산한다.
- POST /api/users/me/coach-report/rebuild 는 동일하게 forceRebuild=true로 계산하되 저장하지 않는다.
- 응답 source는 "generated"로 둔다.
- cache persistence는 구현하지 않고 deferred 문서로만 남긴다.
- Task 12에는 reportRepo 저장 의존성을 두지 않는다.

> **Phase 0 결론:** 현재 `session_event` 스키마 (`session_id BIGINT NOT NULL`, `user_id` 없음, `occurred_at` 없음)는 사용자 단위 리포트 캐시용으로 부적합하다. 따라서 on-demand MVP로 구현하며, 캐시 필요 시 Phase 0의 migration SQL을 먼저 적용해야 한다.
```

캐시를 반드시 구현하려면 Phase 0에서 먼저 별도 DB 결정을 추가한다:

```sql
-- 선택지 A: session_event를 사용자 리포트 캐시에 맞게 확장
ALTER TABLE session_event
  ALTER COLUMN session_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_user(user_id),
  ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_session_event_user_type_occurred
  ON session_event (user_id, type, occurred_at DESC);
```

이 migration을 선택한 경우에만 `session_event` 캐시 구현 계획을 새로 작성한다. migration을 선택하지 않으면 cache persistence는 deferred 문서 작업으로만 처리한다.

- [x] **단계 3: `session_snapshot_metric` 조회 경로 테스트 작성**

`test/analysis/compat/ai-growth-report-query-shape.test.js` 생성:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.join(__dirname, '..', '..', '..');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('current session_event schema is session-scoped, not user-scoped report cache', () => {
  const schema = readRepoFile('docs/sql/DB_init.sql');
  const sessionEventBlock = schema.match(/CREATE TABLE session_event \([\s\S]*?\n\);/)?.[0] || '';

  assert.match(sessionEventBlock, /session_id BIGINT NOT NULL/);
  assert.match(sessionEventBlock, /event_time TIMESTAMPTZ/);
  assert.doesNotMatch(sessionEventBlock, /\buser_id\b/);
  assert.doesNotMatch(sessionEventBlock, /\boccurred_at\b/);
});

test('existing history code reads metrics through session_snapshot_id', () => {
  const historyController = readRepoFile('controllers/history.js');

  assert.match(historyController, /\.from\('session_snapshot'\)/);
  assert.match(historyController, /\.from\('session_snapshot_metric'\)/);
  assert.match(historyController, /\.in\('session_snapshot_id',/);
  assert.doesNotMatch(historyController, /\.from\('session_snapshot_metric'\)[\s\S]{0,160}\.in\('session_id',/);
});
```

- [x] **단계 4: 테스트 실행**

실행:

```bash
node --test test/analysis/compat/ai-growth-report-query-shape.test.js
```

예상: 성공.

- [x] **단계 5: 계획과 스펙에 결정 반영**

`docs/specs/2026-05-03_fitplus_ai_growth_report_spec.md`의 캐시 정책 섹션에 현재 결정 사항을 추가한다.

현재 스키마 그대로 on-demand MVP를 선택한 경우:

```markdown
> Phase 1 MVP 결정: 현재 `session_event`는 `session_id NOT NULL`이며 사용자 단위 캐시용 `user_id`, `occurred_at` 컬럼이 없다. 따라서 MVP에서는 리포트를 저장하지 않는 on-demand 생성으로 구현하고, 사용자 단위 캐시는 별도 migration 이후 활성화한다.
```

migration 기반 캐시를 선택한 경우:

```markdown
> Phase 1 MVP 결정: `session_event`를 사용자 단위 리포트 캐시에 사용할 수 있도록 `session_id` nullable, `user_id`, `occurred_at`, `(user_id, type, occurred_at)` index migration을 먼저 적용한다.
```

이 계획 문서의 cache persistence deferred 항목과 Task 12도 같은 결정에 맞춰 수정한다.

- [ ] **단계 6: 커밋**

```bash
git add docs/specs/2026-05-03_fitplus_ai_growth_report_spec.md docs/plans/2026-05-03_ai_growth_report_implementation_plan.md test/analysis/compat/ai-growth-report-query-shape.test.js
git commit -m "docs(analysis): add AI growth report schema compatibility gate"
```

---
