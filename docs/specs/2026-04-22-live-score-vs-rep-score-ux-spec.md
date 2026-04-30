# 실시간 점수와 반복 확정 점수 UX 정리 스펙

> **2026-04-30 수정본:** 운동 중 UI만 등급화하고 내부 점수/History 기능은 유지하는 방향으로 범위를 재정의했다. See [`2026-04-30-workout-score-grade-display-spec.md`](./2026-04-30-workout-score-grade-display-spec.md).

**작성일:** 2026-04-22  
**갱신일:** 2026-04-23  
**상태:** Draft  
**관련 문서:**  
- [스쿼트 폼 규칙 정렬 패치 스펙](./2026-04-22-squat-form-rule-alignment-spec.md)

---

## 1. 목적

운동 세션 화면에서 실시간 점수와 rep 확정 점수가 서로 다른 알고리즘으로 계산되면서 발생하는 문제를 정리하고, 단일 점수 체계로의 전환을 설계한다.

### 1.1 핵심 결정

- 세션 화면에서 숫자 점수를 제거하고, **상태 등급(좋음/보통/나쁨)**으로 대체한다.
- `scoreRep()`을 삭제하고, hard fail은 점수 캡이 아닌 **rep 상태 플래그**로 처리한다.
- 수치 점수는 SessionBuffer에 저장하여 **History에서만** 조회한다.
- 점수 계산은 `calculate()` 단일 알고리즘으로 통일한다.

---

## 2. 배경 문제

### 2.1 두 알고리즘의 존재

현재 세션 화면은 두 개의 독립적인 점수 계산 계층을 사용한다.

| | 실시간 점수 | rep 확정 점수 |
|---|---|---|
| 계산 시점 | 매 프레임 | rep 완료 시 |
| 알고리즘 | `scoringEngine.calculate()` | `scoringEngine.scoreRep()` |
| 평가 방식 | DB rule 기반, phase-aware 필터링 | 운동별 개별 scorer 함수 |
| hard fail | 없음 | 점수 캡 (55/65/60점) |
| 신뢰도 보정 | 없음 | confidence factor 곱 |

### 2.2 문제점

1. **점수 급변** — rep 종료 순간 두 알고리즘의 차이로 점수가 급변하여 버그처럼 느껴짐
2. **의미 혼란** — 사용자는 하나의 숫자가 이어진다고 기대하지만, 실제로는 다른 두 계산 결과를 번갈아 봄
3. **hard fail의 모순** — 깊이 도달 못함에도 55점을 부여하는 것은 운동 코칭 관점에서 부정확
4. **알고리즘 이원화** — 같은 메트릭을 두 알고리즘이 각자 다르게 평가하여 일관성 없음
5. **rep 확정 점수의 독자적 가치 한계** — hard fail 판단 외에는 실시간 점수로 대체 가능

### 2.3 rep 확정 점수의 가치 분석

| 항목 | 실시간 점수로 대체 가능? | rep 확정 점수만의 독자적 가치? |
|---|---|---|
| 깊이/상체/대칭 평가 | 가능 (phase-aware에서 이미 처리) | 없음 |
| view별 가중치 | 가능 (filterLiveFeedback에서 이미 처리) | 없음 |
| confidence 보정 | 실시간에 편입 가능 | 없음 |
| hard fail 판단 | 불가능 (rep 끝나야 판단 가능) | **유일한 독자적 가치** |

결론: hard fail만 rep 수준 판단의 유일한 독자적 가치이며, 이는 점수가 아닌 상태 플래그로 처리하는 것이 맞다.

---

## 3. 최종 설계

### 3.1 단일 점수 체계

`scoringEngine.calculate()`를 유일한 점수 알고리즘으로 채택한다.

- phase-aware, view-aware, confidence-aware 평가를 모두 이 단일 알고리즘에서 수행
- rep 진행 중 누적 평균이 "현재 rep 점수"
- rep 완료 시 누적 평균이 "최종 rep 점수" (같은 알고리즘이므로 값이 급변하지 않음)
- `scoreRep()` 삭제

### 3.2 상태 등급 표시

세션 화면의 메인 점수 영역을 숫자에서 등급으로 변경한다.

| 등급 | 기준 (0~100) | 색상 | 표시 |
|---|---|---|---|
| 좋음 | 80~100 | 초록 | `좋음` |
| 보통 | 50~79 | 노랑 | `보통` |
| 나쁨 | 0~49 | 빨강 | `나쁨` |

등급 전환 시에도 "85→55" 같은 숫자 점프 대신 "좋음→보통" 같은 자연스러운 변화만 발생한다.

### 3.3 Hard fail은 상태 플래그

`scoreRep()`의 hard fail 판단 로직은 제거하지 않되, 점수 캡이 아닌 rep 상태 플래그로 승격한다.

| 기존 (scoreRep) | 변경 후 |
|---|---|
| `depth_not_reached` → 점수 55점 캡 | `depth_not_reached` → rep 상태: `무효` 또는 `미달성` 배지 |
| `lockout_incomplete` → 점수 65점 캡 | `lockout_incomplete` → rep 상태: `불완전` 배지 + 안내 문구 |
| `low_confidence` → 점수 60점 캡 | `low_confidence` → rep 상태: `측정 불안정` 배지 |

Hard fail 판단은 `completeRep()` 이후 별도 검증 단계에서 수행하며, rep 카운트에서 제외하거나 별도 표시할지는 운동별 설정으로 결정한다.

### 3.4 수치 점수의 History 이관

`calculate()`의 프레임별 점수는 SessionBuffer에 그대로 저장하여 History 페이지에서 상세 조회 가능하게 한다.

- 세션 중: 등급만 표시
- 세션 종료 후 (History): 프레임 타임라인, rep별 수치 점수, 메트릭 breakdown 상세 표시
- 결과 페이지: 세션 종료 시점의 평균 수치 점수를 결과로 저장

---

## 4. 현재 구조에서 변경되는 것

### 4.1 삭제

- `scoringEngine.scoreRep()` — 운동별 rep 재평가 함수 전체 삭제
- `repCounter.repEvaluator` 콜백 — scoreRep 호출 경로 삭제
- 세션 중 메인 숫자 점수 표시 — 등급으로 대체
- hard fail 점수 캡 로직 — 상태 플래그로 대체

### 4.2 변경

- `updateScoreDisplay()` — 숫자 대신 등급 표시 로직으로 변경
- `handleRepComplete()` — scoreRep 호출 대신 hard fail 상태 검증 추가
- `ScoringEngine.calculate()` — confidence 보정 로직 편입 (기존 scoreRep 전용이었던 confidence factor를 calculate 내부로 이동)
- rep 카운트 로직 — hard fail rep의 카운트 포함/제외를 운동별로 판단

### 4.3 유지

- `ScoringEngine.calculate()` — 프레임별 점수 계산 (핵심 유지)
- 실시간 breakdown 축적
- alert 기반 교정 문구
- skeleton/overlay 시각 피드백
- SessionBuffer.addScore() — 프레임 점수 저장
- History 페이지 점수 표시 구조

---

## 5. 목표 UX

### 5.1 rep 시작 전

- 메인 영역: `--` (등급 없음)
- 보조 문구: `운동을 시작하세요`

### 5.2 rep 진행 중

- 메인 영역: 현재 등급 배지 (`좋음` / `보통` / `나쁨`) + 색상
- breakdown: 문제 메트릭만 요약 표시
- alert/overlay: 실시간 교정 문구 유지

### 5.3 rep 완료 직후

- 메인 영역: 완료된 rep의 최종 등급 배지 (값이 연속적이므로 급변 없음)
- hard fail 발생 시: `미달성` / `불완전` 배지를 등급과 함께 표시
- 피드백: rep-level 안내 문구 표시
- breakdown: 해당 rep의 최종 metric summary 표시

### 5.4 세션 종료 후 (History)

- 프레임 타임라인 수치 점수
- rep별 수치 점수 + 메트릭 breakdown
- hard fail 발생 rep는 별도 표시

---

## 6. 등급 임계값 설계

### 6.1 기본 임계값

| 등급 | 범위 | 의미 |
|---|---|---|
| 좋음 | 80 ≤ score ≤ 100 | 이 구간의 자세를 유지하세요 |
| 보통 | 50 ≤ score < 80 | 교정이 필요한 부분이 있습니다 |
| 나쁨 | 0 ≤ score < 50 | 자세 교정이 시급합니다 |

### 6.2 등급 전환의 스무딩

프레임 단위 점수는 변동이 크므로, 등급 전환에 최소 유지 시간을 적용한다.

- 등급 변경 후 **10프레임** 동안 새 등급이 유지되어야 화면에 반영
- 이전 등급으로 돌아가면 즉시 복원
- 이 스무딩은 화면 표시에만 적용, SessionBuffer에는 원본 점수 저장

---

## 7. Hard fail 검증 로직

### 7.1 검증 시점

rep 완료(`completeRep()`) 이후, 별도 검증 단계에서 수행한다.

### 7.2 검증 항목 (스쿼트 기준, 운동별 확장 가능)

| 조건 | 판정 | UI 표시 | rep 카운트 |
|---|---|---|---|
| 무릎 각도 ≤ 130° 또는 hipBelowKnee | 깊이 도달 | 정상 등급 | 포함 |
| 무릎 각도 > 130° && hipBelowKnee 없음 | 깊이 미달 | `미달성` 배지 | 제외 또는 별도 표시 |
| lockoutKnee ≥ 150° | lockout 완료 | 정상 등급 | 포함 |
| lockoutKnee < 150° | lockout 불완전 | `불완전` 배지 | 포함 (감점 반영) |
| confidence level = LOW | 측정 불안정 | `측정 불안정` 배지 | 포함 (안내만) |

### 7.3 검증 결과 저장

hard fail 상태는 SessionBuffer의 rep 기록에 `repStatus` 필드로 저장한다.

```
repStatus: 'scored' | 'depth_not_reached' | 'lockout_incomplete' | 'low_confidence'
```

---

## 8. Confidence 보정의 calculate() 편입

기존 `scoreRep()`에서 수행하던 confidence factor 곱을 `calculate()` 내부로 이동한다.

### 8.1 편입 방식

- `calculate()` 결과에 pose quality factor를 직접 곱하여 보정
- 보정 계수: HIGH=1.0, MEDIUM=0.8, LOW=0.5
- 보정은 최종 점수 산출 후 적용 (breakdown의 개별 메트릭 점수에는 적용하지 않음)

### 8.2 근거

confidence 보정이 실시간 점수에 반영되면, 사용자는 품질이 낮은 구간에서 등급이 자연스럽게 하향하는 것을 볼 수 있다. 이는 rep 종료 후 급변하는 것보다 직관적이다.

---

## 9. 범위

### 포함

- 세션 페이지 점수 표시: 숫자 → 등급 변경
- `scoreRep()` 삭제
- `calculate()`에 confidence 보정 편입
- hard fail 검증을 상태 플래그로 승격
- SessionBuffer에 repStatus 필드 추가
- 등급 임계값 및 스무딩 로직

### 제외

- DB 저장 구조 변경 (repStatus는 SessionBuffer 필드 추가로만 대응)
- History 페이지 리디자인 (기존 구조에서 수치 점수 표시 유지)
- 운동별 metric rule 변경
- 모바일 전용 레이아웃 리디자인
- 결과 페이지 점수 체계 변경

---

## 10. 수용 기준

1. 세션 중 메인 영역에 숫자 점수가 표시되지 않는다.
2. 등급 배지가 3단계(좋음/보통/나쁨)로 표시된다.
3. rep 완료 시 점수 급변이 발생하지 않는다.
4. hard fail 발생 시 등급이 아닌 상태 배지로 표시된다.
5. `scoreRep()`이 코드에서 제거되었다.
6. `calculate()`에 confidence 보정이 편입되었다.
7. 프레임별 수치 점수가 SessionBuffer에 저장되어 History에서 조회 가능하다.
8. 기존 History/결과 페이지의 점수 표시가 정상 동작한다.

---

## 11. 권장 후속 작업

1. `scoreRep()` 삭제 및 `calculate()` confidence 편입 구현
2. 세션 페이지 등급 UI 컴포넌트 구현
3. hard fail 검증 단계 구현 (completeRep 이후)
4. SessionBuffer repStatus 필드 추가
5. 등급 스무딩 로직 구현
6. 기존 `updateScoreDisplay()` 리팩토링 (숫자 → 등급 전환)
7. 통합 테스트: 진행 중 / 완료 후 / hard fail 시나리오
