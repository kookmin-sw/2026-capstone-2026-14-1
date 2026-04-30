# 운동 중 점수 등급 표시 UX 수정 스펙

**작성일:** 2026-04-30  
**상태:** Implemented  
**성격:** 2026-04-22 스펙 수정본  
**수정 대상 원문:** [`docs/specs/2026-04-22-live-score-vs-rep-score-ux-spec.md`](./2026-04-22-live-score-vs-rep-score-ux-spec.md)  
**관련 문서:**
- [`docs/plans/2026-04-22-live-score-vs-rep-score-ux-plan.md`](../plans/2026-04-22-live-score-vs-rep-score-ux-plan.md)
- [`docs/specs/2026-04-21-runtime-evaluation-spec-v3.md`](./2026-04-21-runtime-evaluation-spec-v3.md)
- [`docs/specs/2026-04-02_current_scoring_spec.md`](./2026-04-02_current_scoring_spec.md)

---

## 1. 목적

이 문서는 2026-04-22 작성된 `실시간 점수와 반복 확정 점수 UX 정리 스펙`의 정책을 수정한다.

4월 22일 스펙의 핵심 방향은 `세션 화면에서 숫자 점수를 제거하고 상태 등급으로 대체한다`였으나, 일부 표현이 `scoreRep()` 삭제, rep 점수 삭제, History 수치 표시 유지 여부를 혼동하게 만들 수 있었다. 4월 30일 수정본은 다음 원칙을 명확히 한다.

> **운동 중 사용자에게 보이는 점수 UI만 숫자에서 등급으로 바꾸고, 내부 점수 계산·저장·History 기능은 유지한다.**

즉, 사용자 운동 화면에서는 `85점`, `64점` 같은 숫자를 노출하지 않고 `좋음 / 보통 / 교정 필요`로 표시한다. 반면 점수 데이터 자체는 기존처럼 SessionBuffer, 결과 저장, History, 분석 기능에서 계속 사용한다.

---

## 2. 4월 22일 스펙 대비 수정 사항

| 항목 | 2026-04-22 스펙 | 2026-04-30 수정 |
|---|---|---|
| 운동 중 메인 표시 | 숫자 제거, `좋음/보통/나쁨` 등급 | 숫자 제거, `좋음/보통/교정 필요` 등급 |
| 점수 데이터 | History에서만 조회한다고 표현 | 내부 계산·SessionBuffer·결과·History 모두 유지 |
| rep 점수 | `scoreRep()` 삭제 및 rep 상태 플래그화 강조 | 별도 알고리즘 정리는 후속 과제로 두고, 이번 범위는 UI 표시 변경에 한정 |
| History 기능 | 수치 점수 유지 | 기존 History 기능을 변경하지 않음 |
| 입력 품질 문제 | `측정 불안정` 배지 언급 | 등급과 별도 상태로 명시 분리 |
| 사용자 톤 | `나쁨` | 부정적 표현 완화를 위해 `교정 필요` 사용 |

---

## 3. 최종 정책

### 3.1 운동 중 UI 표시 정책

운동 세션 화면의 점수 카드에서 사용자에게 노출되는 메인 값은 숫자가 아니라 등급 label이다.

| 내부 numeric score | 운동 중 표시 label | 의미 | 권장 색상 |
|---:|---|---|---|
| 80~100 | `좋음` | 현재 자세가 안정적임 | 초록 |
| 50~79 | `보통` | 큰 문제는 아니지만 조정 여지가 있음 | 노랑 |
| 1~49 | `교정 필요` | 자세 교정 피드백을 확인해야 함 | 빨강 |
| 0 또는 없음 | `--` | 아직 채점 가능한 점수 없음 | 회색 |

메인 카드에는 `85`, `64`, `42` 같은 숫자를 표시하지 않는다.

### 3.2 History 및 내부 데이터 정책

이번 수정은 표시 계층 변경이다. 따라서 아래 데이터 흐름은 유지한다.

- `ScoringEngine.calculate()`의 numeric score 계산
- `RepCounter.getCurrentRepScore()`의 rep 진행 중 집계값
- rep 완료 시 `repRecord.score`
- `SessionBuffer.addScore()`의 score timeline 저장
- `SessionBuffer.addRep()`의 rep record 저장
- `SessionBuffer.calculateFinalScore()`의 최종 점수 산출
- History의 session score, rep score, metric breakdown, score timeline 표시
- LLM 분석 또는 결과 페이지에서 사용하는 numeric score

즉, 숫자는 **운동 중 UI에서만 숨긴다**.

### 3.3 입력 품질 문제는 등급과 분리

4월 21일 runtime evaluation 스펙의 원칙을 따른다.

입력 품질 문제는 `교정 필요`로 표시하지 않는다. 이는 사용자의 운동 수행 문제가 아니라 채점 가능성 문제이기 때문이다.

예시:

| 상황 | UI 표시 |
|---|---|
| 전신이 화면에 없음 | `측정 불안정` + “몸 전체가 화면에 보이도록 조금 더 뒤로 가 주세요.” |
| 요구 시점과 현재 시점 불일치 | `측정 불안정` + “현재 운동은 선택한 채점 자세가 필요합니다.” |
| tracking confidence 부족 | `측정 불안정` + “카메라와 조명을 조정해 주세요.” |
| 안정 프레임 부족 | `측정 준비 중` 또는 `측정 불안정` |

`withhold` 상태에서는 score timeline에 저점수를 추가하지 않는 기존 정책을 유지한다.

---

## 4. UI 요구사항

### 4.1 점수 카드 label

기존 점수 카드 label은 숫자 점수를 전제로 한 문구였다.

현재 예시:

- `이번 rep 점수`
- `현재 자세 점수`

수정 후 권장 문구:

| 상황 | label |
|---|---|
| 횟수 기반 운동 | `이번 rep 상태` |
| 시간 기반 운동 | `현재 자세 상태` |
| 학습 모드 | 기존 `현재 step 진행률` 유지 |

학습 모드는 별도 학습 진행률 UI가 있으므로 이번 변경 범위에서 제외한다.

### 4.2 메인 표시값

`#liveScore` 요소는 유지하되 text content만 등급 label로 바꾼다.

예시:

```text
--
좋음
보통
교정 필요
측정 불안정
```

DOM id는 유지한다. CSS와 테스트 영향을 줄이기 위해 `liveScore`라는 id를 바꾸지 않는다.

### 4.3 breakdown 표시

운동 중 breakdown에는 기존처럼 메트릭별 상세 정보를 표시할 수 있다. 다만 운동 화면에서 숫자 점수를 숨기는 원칙을 엄격히 적용하려면 breakdown의 오른쪽 숫자도 등급 또는 상태로 바꿔야 한다.

권장 정책:

| 내부 metric normalized score | breakdown 표시 |
|---:|---|
| 80~100 | `좋음` |
| 50~79 | `보통` |
| 1~49 | `교정 필요` |
| 없음 | `--` |

History에서는 기존 metric numeric breakdown을 그대로 유지한다.

### 4.4 rep 완료 피드백

rep 완료 토스트/음성 피드백은 숫자를 말하지 않고 상태 중심으로 안내한다.

예시:

| rep score | 기존 가능 표현 | 수정 표현 |
|---:|---|---|
| 80 이상 | `1회 86점` | `1회 완료 · 좋음` |
| 50~79 | `1회 68점` | `1회 완료 · 보통` |
| 50 미만 | `1회 42점` | `1회 완료 · 교정 필요` |
| hard fail/no-rep | `55점` | `깊이 미달 · 다시 시도` |

현재 코드의 `showRepFeedback()`은 직접 숫자를 표시하지는 않지만 score threshold로 메시지를 고른다. 이 threshold 로직은 유지하되, 표시 메시지를 등급 label 기반으로 정리한다.

---

## 5. 점수 등급 매핑

### 5.1 기본 함수

모든 UI 표시 변경은 같은 mapping 함수를 사용해야 한다.

```js
function mapScoreToWorkoutGrade(score) {
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore) || numericScore <= 0) {
    return {
      label: '--',
      tone: 'empty',
      color: '#94a3b8',
    };
  }

  if (numericScore >= 80) {
    return {
      label: '좋음',
      tone: 'good',
      color: '#22c55e',
    };
  }

  if (numericScore >= 50) {
    return {
      label: '보통',
      tone: 'normal',
      color: '#eab308',
    };
  }

  return {
    label: '교정 필요',
    tone: 'needs-correction',
    color: '#ef4444',
  };
}
```

### 5.2 threshold 기준

초기 threshold는 단순하게 유지한다.

- `좋음`: 80 이상
- `보통`: 50 이상 80 미만
- `교정 필요`: 50 미만

4월 22일 스펙의 `나쁨` 구간은 label만 `교정 필요`로 바꾼다.

### 5.3 스무딩

이번 4월 30일 수정 범위에서는 등급 전환 스무딩을 필수 구현 범위에 넣지 않는다. 우선 숫자 노출 제거와 History 보존을 안정적으로 완료한다.

후속 개선으로 필요하면 다음을 검토한다.

- 등급 변경 최소 유지 프레임
- 이전 등급 즉시 복원 여부
- rep phase별 label 안정화

---

## 6. 구현 범위

### 포함

- 운동 세션 화면의 메인 numeric score 표시 제거
- `좋음 / 보통 / 교정 필요` 등급 label 표시
- 품질 게이트 withhold 상태는 `측정 불안정` 계열로 별도 표시
- 운동 중 breakdown 숫자 표시를 등급 label로 변경
- 점수 카드 문구를 `점수`에서 `상태` 중심으로 변경
- rep 완료 feedback의 사용자 표시 문구를 등급 중심으로 정리
- 기존 점수 계산/저장/History 기능 보존 검증

### 제외

- `scoreRep()` 삭제
- scoring algorithm 통합
- hard fail cap 정책 전면 개편
- DB schema 변경
- History 화면 리디자인
- 결과 페이지 numeric score 제거
- 학습 모드 진행률 표시 변경

---

## 7. 수용 기준

1. 운동 세션의 메인 점수 카드에 numeric score가 표시되지 않는다.
2. 운동 세션의 메인 점수 카드에는 `좋음 / 보통 / 교정 필요 / -- / 측정 불안정` 계열 상태가 표시된다.
3. 운동 세션 breakdown에서도 numeric score 대신 등급 label이 표시된다.
4. quality gate withhold는 `교정 필요`가 아니라 `측정 불안정` 계열 메시지로 표시된다.
5. `SessionBuffer.addScore()`와 `SessionBuffer.addRep()`는 기존 numeric score를 계속 저장한다.
6. History에서 사용하는 score timeline, rep records, metric result 구조는 변경하지 않는다.
7. `npm test`가 통과한다.

---

## 8. 권장 후속 작업

1. ~~4월 22일 spec 문서 상단에 이 4월 30일 수정본 링크 추가~~ ✅ 완료
2. hard fail/no-rep 상태 배지 설계 별도 문서화
3. `scoreRep()` 통합/삭제 여부는 History 영향과 운동별 scorer 의존성을 확인한 뒤 별도 계획으로 분리
4. 등급 전환 스무딩 UX 테스트
