# 스쿼트 측면 knee_valgus·knee_alignment 제외 Spec

작성일: 2026-05-12
상태: 구현 완료, 테스트 통과

## 1. 목적

이 문서는 스쿼트 **측면(SIDE) 촬영**에서 `knee_valgus`와 `knee_alignment`가 잘못된 값을 산출하여 **정상 자세에서도 빨간색 스켈레톤 경고**가 표시되는 문제를 해결한 내용을 고정합니다.

대표 증상:

```text
정상적인 측면 스쿼트 자세인데 무릎 관절·연결선이 빨간색으로 표시됨
"무릎이 지나치게 바깥으로 벌어졌습니다" 경고가 뜸
```

## 2. 근본 원인

### 2.1 `getKneeValgus()`는 X좌표(가로축) 기반 측정이다

`pose-engine.js`의 `getKneeValgus()`는 아래 로직으로 valgus를 산출합니다.

```text
midX = (hip.x + ankle.x) / 2
valgus = |knee.x - midX|
```

- **정면(FRONT)**: X축 = 좌우 → 무릎이 엉덩이-발목 라인에서 좌우로 벗어나는 정도 → valgus 측정에 적합
- **측면(SIDE)**: X축 = 앞뒤 → 스쿼트 시 무릎이 자연스럽게 앞으로 나감 → **정상 자세에서도 큰 valgus 값이 나옴**

즉, 측면에서 스쿼트를 하면 무릎이 발목과 엉덩이의 X좌표 중간점보다 **앞으로 돌출**되는 것이 물리적으로 정상인데, 이것이 "높은 valgus"로 잘못 감지됩니다.

### 2.2 `getKneeAlignment()`도 동일한 문제

`getKneeAlignment()`도 X좌표 기반으로 무릎-발 정렬을 판단합니다.

```text
diff = knee.x - footLineX
isAligned = |diff| < 0.05
```

측면에서는 이 값이 앞뒤 오프셋을 측정하게 되어 정면용 정렬 판단으로 부적절합니다.

### 2.3 라이브 피드백 필터가 SIDE 뷰에서 이 두 메트릭을 제외하지 않았음

`shouldKeepLiveMetric()` 함수에서:

- `knee_symmetry`는 `view === 'SIDE' && category === 'symmetry'` 조건으로 SIDE에서 제외됨 ✓
- `knee_valgus`는 category가 `'alignment'`인데, SIDE 뷰에서 alignment 카테고리를 제외하는 조건이 **없었음** ✗
- `knee_alignment`은 `view === 'FRONT'` 조건만 있어서 SIDE에서 제외되지 않았음 ✗

### 2.4 잘못된 점수가 스켈레톤 색상으로 전파되는 경로

```text
ScoringEngine.calculate()  →  기본 프로필 메트릭(knee_valgus 포함)으로 채점
→ filterLiveFeedback()     →  shouldKeepLiveMetric에서 knee_valgus 통과 (필터 누락)
→ poseEngine.setVisualFeedback(breakdown)  →  낮은 점수 메트릭을 관절에 매핑
→ getVisualMappingForMetric('knee_valgus') →  key에 'knee' 포함 → getKneeVisualMap()
→ 양쪽 무릎 관절·hip-knee-ankle 연결선에 severity 2 (빨강) 적용
```

## 3. 수정 내용

### 3.1 `shouldKeepLiveMetric`에서 SIDE 뷰 제외 추가

**파일**: `public/js/workout/exercises/squat-exercise.js`

```javascript
// 기존
if (view === 'FRONT' && metricKey === 'knee_alignment') return false;

// 추가
if (view === 'SIDE' && metricKey === 'knee_valgus') return false;
if (view === 'SIDE' && metricKey === 'knee_alignment') return false;
```

SIDE 뷰에서 이 두 메트릭이 라이브 breakdown에 포함되지 않으므로:

- `poseEngine.setVisualFeedback()`에 전달되지 않음 → 빨간 스켈레톤 원인 제거
- `checkFeedback()`에서 저점 피드백 후보에 올라가지 않음 → 오경고 제거

### 3.2 `calculateAllAngles`에서 SIDE 뷰일 때 null 반환

**파일**: `public/js/workout/pose-engine.js`

```javascript
// 기존
kneeAlignment: this.getKneeAlignment(landmarks),
kneeValgus: this.getKneeValgus(landmarks),

// 변경
kneeAlignment: view === 'SIDE' ? null : this.getKneeAlignment(landmarks),
kneeValgus: view === 'SIDE' ? null : this.getKneeValgus(landmarks),
```

소스 레벨에서 물리적으로 무의미한 값 자체를 생성하지 않습니다.
이로써 rep 스냅샷 기록(`getSnapshot`)이나 다른 경로에서도 잘못된 값이 전파되지 않습니다.

## 4. 영향 범위

### 4.1 영향받는 코드 경로

| 경로 | 변경 전 | 변경 후 |
|------|---------|---------|
| SIDE 라이브 breakdown에 knee_valgus 포함 | O | X |
| SIDE 라이브 breakdown에 knee_alignment 포함 | O | X |
| SIDE 스켈레톤에 valgus 기반 빨간색 표시 | O | X |
| SIDE rep 최종 채점(scoreRep)에 knee_valgus 사용 | X (기존에도 SIDE config에 미포함) | X |
| FRONT 라이브/rep 채점에 knee_valgus 사용 | O | O (변경 없음) |
| rep 스냅샷의 kneeValgus 기록 | SIDE에서도 잘못된 값 기록 | SIDE에서 null |

### 4.2 영향받지 않는 코드 경로

- FRONT 뷰의 모든 채점 로직 (변경 없음)
- SIDE 뷰의 최종 rep 채점 (`SQUAT_SCORING_CONFIG.SIDE`에 knee_valgus 미포함이므로 기존에도 정상)
- 학습 모드 (`createSideLearnSteps`는 kneeValgus를 사용하지 않음)

## 5. 설계 원칙

```text
측면(SIDE) 촬영에서는 X좌표 기반 정면 전용 메트릭을 사용하지 않는다.
```

정면 전용 메트릭 목록:

| 메트릭 | 이유 |
|--------|------|
| `knee_valgus` | X좌표 기반 좌우 편차 → 측면에서는 앞뒤 돌출로 오해석 |
| `knee_alignment` | X좌표 기반 무릎-발 정렬 → 측면에서는 무의미 |
| `knee_symmetry` | 양쪽 무릎 비교 → 측면에서 한쪽이 가려짐 (기존에 이미 제외됨) |

측면 전용 메트릭 목록 (`SQUAT_SCORING_CONFIG.SIDE`):

| 메트릭 | 가중치 |
|--------|--------|
| `depth` (무릎 굽힘 깊이) | 0.36 |
| `trunk_tibia_angle` (상체-경골 평행) | 0.22 |
| `hip_angle` (힙 힌지) | 0.18 |
| `trunk_stability` (상체 안정성) | 0.16 |
| `heel_contact` (뒤꿈치 접지) | 0.08 |

## 6. 테스트 검증

- 스쿼트 채점 robustness 테스트 70개 전체 통과
- 채점 상태 머신 테스트 9개 전체 통과
- 기존 FRONT 뷰 테스트에 영향 없음
