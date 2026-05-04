# AI Growth Report Phase 6: Verification And Docs

> Parent roadmap: `docs/plans/2026-05-03_ai_growth_report_implementation_plan.md`
> MVP policy: on-demand only. 리포트 결과는 DB에 저장하지 않는다.

## Phase 6: 검증 및 문서화

**목표:** LLM 성공에 의존하지 않고 end-to-end 동작을 입증한다.

### Task 16: End-to-End 서비스 커버리지 추가

**파일:**
- 생성: `test/analysis/ai-growth-report.integration.test.js`

- [ ] **단계 1: 가짜 Repository와 실패하는 LLM으로 통합 테스트 작성**

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const { createAiGrowthReportService } = require('../../backend/analysis/service/ai-growth-report.service');

test('AI growth report service falls back when LLM provider fails', async () => {
  const service = createAiGrowthReportService({
    historyRepo: {
      getRecentHistory: async () => ({
        sessions: [
          { session_id: 's1', final_score: 55, status: 'done', ended_at: '2026-01-01T00:00:00Z', exercise_name: '스쿼트' },
          { session_id: 's2', final_score: 70, status: 'done', ended_at: '2026-01-02T00:00:00Z', exercise_name: '스쿼트' },
        ],
        metrics: [
          { session_id: 's1', metric_key: 'depth', metric_name: '스쿼트 깊이', avg_score: 48, sample_count: 20 },
          { session_id: 's2', metric_key: 'depth', metric_name: '스쿼트 깊이', avg_score: 66, sample_count: 20 },
        ],
        events: [],
      }),
    },
    llmClient: { generateJson: async () => { throw new Error('provider down'); } },
  });

  const result = await service.getCoachReport({ userId: 'u1', period: 'recent_5', exercise: 'squat' });
  assert.equal(result.status, 'completed');
  assert.equal(result.source, 'generated');
  assert.equal(result.isFallback, true);
  assert.equal(result.fallbackReason, 'PROVIDER_ERROR');
});
```

- [ ] **단계 2: 통합 테스트 실행**

실행: `node --test test/analysis/ai-growth-report.integration.test.js`

예상: 성공.

- [ ] **단계 3: 전체 analysis 테스트 실행**

실행: `node --test test/analysis/`

예상: 모든 analysis 테스트 성공.

- [ ] **단계 4: 전체 workout/history 테스트 실행**

실행: `node --test test/workout/ test/history*.test.js test/*history*.test.js`

예상: 성공. 파일이 없는 경우 `git ls-files 'test/*history*.test.js' 'test/workout/*.test.js'`로 실제 경로만 재실행.

- [ ] **단계 5: 커밋**

```bash
git add test/analysis/ai-growth-report.integration.test.js
git commit -m "test(analysis): cover AI growth report fallback flow"
```

### Task 17: 스펙 상태 업데이트와 수동 QA 노트

**파일:**
- 수정: `docs/specs/2026-05-03_fitplus_ai_growth_report_spec.md`
- 생성: `docs/plans/2026-05-03_ai_growth_report_manual_qa.md`

- [ ] **단계 1: 스펙에 구현 상태 추가**

`docs/specs/2026-05-03_fitplus_ai_growth_report_spec.md` 상단에 추가:

```markdown
> 구현 상태: Phase 1 MVP 구현 완료 (HistoryTrendFeature, 폴백 리포트, LLM 선택 경로, Phase 0에서 확정한 캐시 정책, 히스토리/운동 UI 카드).
```

- [ ] **단계 2: 수동 QA 체크리스트 추가**

`docs/plans/2026-05-03_ai_growth_report_manual_qa.md` 생성:

```markdown
# AI 성장 리포트 수동 QA

- [ ] 일반 사용자로 로그인한다.
- [ ] 메트릭이 저장된 스쿼트 세션을 최소 2회 완료한다.
- [ ] `/history`를 열고 AI 성장 리포트 카드가 나타나는지 확인한다.
- [ ] 카드에 요약, 개선점, 약점, 미션, 신뢰도 노트가 표시되는지 확인한다.
- [ ] 스쿼트 세션을 시작하고 운동 전 오늘의 AI 미션이 나타나는지 확인한다.
- [ ] 운동을 마치고 결과 페이지에서 미션/코칭 카드가 나타나는지 확인한다.
- [ ] `OPENROUTER_API_KEY`를 임시로 제거하고 폴백 리포트가 여전히 표시되는지 확인한다.
- [ ] `OPENROUTER_API_KEY`를 복구하고 LLM 성공 시 `isFallback: false`가 응답에 포함되는지 확인한다.
- [ ] `POST /api/users/me/coach-report/rebuild`를 호출하고 `source: "generated"` 응답이 반환되는지 확인한다. (MVP에서는 저장하지 않음)
```

- [ ] **단계 3: 문서 커밋**

```bash
git add docs/specs/2026-05-03_fitplus_ai_growth_report_spec.md docs/plans/2026-05-03_ai_growth_report_manual_qa.md
git commit -m "docs(analysis): add AI growth report QA notes"
```

---

## 최종 검증

- [ ] analysis 테스트 스위트 실행:

```bash
node --test test/analysis/
```

예상: 성공.

- [ ] 기존 workout 스위트 실행:

```bash
node --test test/workout/
```

예상: 성공.

- [ ] git 상태 확인:

```bash
git status
```

예상: 최종 커밋 후 작업 트리가 깨끗함.

---

## 자체 검토

스펙 커버리지:

- DB/schema compatibility gate: Phase 0에서 커버.
- 기존 DB 히스토리 소스: Phase 2 Repository에서 커버.
- `HistoryTrendFeature`: Phase 1 분석기 Tasks에서 커버.
- 개선/약점/후퇴: Task 4에서 커버.
- 데이터 품질 및 카메라 이슈 분리: Task 5에서 커버.
- 결정론적 폴백: Task 10에서 커버.
- LLM 스키마 기반 출력: Task 9, 11에서 커버.
- 캐시 정책: Phase 0에서 on-demand로 확정. cache persistence는 deferred이며, Task 12에는 reportRepo 저장 경로가 없다.
- API 엔드포인트: Task 13에서 커버.
- 히스토리 UI와 오늘의 미션 UI: Task 14, 15에서 커버.
- 신규 DB 테이블 없음: MVP에서는 on-demand 응답만 사용. 영속성은 기존 `session_event` 확장 migration 이후 고려.

알려진 구현 결정 사항:

- Phase 0에서 현재 DB 스키마와 캐시 정책을 확정함. `session_event.session_id NOT NULL`, `user_id` 없음, `occurred_at` 없음이므로 migration 없이는 사용자 단위 리포트 캐시를 저장하지 않는다. MVP는 on-demand.
- `exercise=all`은 초기 UI에서 지원 운 동으로 정규화. API는 허용하지만 MVP UI는 혼합 메트릭 미션을 피하기 위해 특정 운 동을 요청해야 함.
- Rebuild 엔드포인트는 on-demand 계산을 강제 재실행하는 API. MVP에서는 저장하지 않으므로 `source: "generated"`만 반환.
- LLM은 선택 사항. 폴백 경로는 필수이며 provider 호출 활성화 전 반드시 통과해야 함.
