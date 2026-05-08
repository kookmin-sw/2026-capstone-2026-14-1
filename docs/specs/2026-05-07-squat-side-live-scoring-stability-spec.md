# 스쿼트 측면 Live 채점 안정화 Spec

작성일: 2026-05-07
상태: `master` 반영 완료
관련 커밋: `ba90c3d` (`Stabilize squat side live scoring`)

## 1. 목적

이 문서는 스쿼트 **측면(SIDE) 촬영**에서 발생하던 live 피드백 불안정 문제를 해결한 내용을 고정하기 위한 spec입니다.

이번 수정은 아래 두 가지 사용자 체감 문제를 해결하는 것을 목표로 합니다.

1. 정상적인 측면 스쿼트 중 `hip_angle` live 피드백이 빨강/초록으로 튀는 문제
2. 실제로는 뒤꿈치를 붙이고 있어도 `heel_contact` 점수가 과하게 낮게 나오는 문제

핵심 원칙은 다음입니다.

```text
측면에서는 양쪽 관절을 모두 강제하지 말고,
카메라에 잘 보이는 한쪽 body chain을 기준으로 평가한다.
```

즉, 측면 촬영에서 자연스럽게 가려지는 반대쪽 landmark를 자세 오류로 취급하지 않는 것이 핵심입니다.

## 2. 배경

### 2.1 측면 촬영에서는 한쪽 body chain만 안정적으로 보이는 것이 정상

측면에서는 보통 카메라에 가까운 쪽 관절이 더 잘 보입니다.

주요 visible chain은 다음과 같습니다.

```text
shoulder -> hip -> knee -> ankle -> heel/toe
```

반대쪽 어깨/골반/무릎/발/뒤꿈치는 몸에 가려지거나 MediaPipe landmark가 흔들릴 수 있습니다.

따라서 측면 채점은 정면처럼 좌우 양쪽을 모두 같은 수준으로 요구하면 안 됩니다.

### 2.2 live 점수와 final rep 점수가 충돌하면 안 됨

기존 live `hip_angle` 기준은 특정 구간만 이상적인 값으로 보고 있었습니다.

문제는 깊게 앉은 스쿼트에서는 사람에 따라 hip angle이 꽤 작아질 수 있다는 점입니다.

그런데 live 기준은 작은 hip angle을 나쁘게 보고, final rep 점수는 작은 hip angle을 좋은 깊이/힙힌지로 보는 구조였습니다.

즉, 사용자 입장에서는 아래처럼 보일 수 있었습니다.

```text
최저점 live 피드백: 빨강
rep 완료 후 final 점수: hip 항목 고득점
```

이번 수정은 이 모순을 없애기 위해 live `hip_angle` 기준을 final hip scorer와 맞추는 방향으로 정리했습니다.

## 3. 해결한 문제

## 3.1 측면 live hip angle 색상 튐

### 기존 동작

기존 live `hip_angle`은 현재 프레임의 hip angle을 정적인 ideal range로 평가했습니다.

하지만 스쿼트 중 hip angle은 자연스럽게 계속 변합니다.

```text
선 자세:        170~180도
내려가기 초반:   140~160도
내려가기 중간:   100~130도
최저점:           50~110도
올라오기:         80~150도
```

이 구조에서는 정상적인 rep 한 번에도 색상이 아래처럼 바뀔 수 있었습니다.

```text
빨강 -> 주황 -> 초록 -> 빨강 -> 초록
```

이건 사용자의 자세가 계속 틀렸다 맞았다 하는 문제가 아니라, live scoring 기준이 동작 중 관절각 변화에 맞지 않았던 문제입니다.

### 변경 후 동작

`hip_angle` live scoring은 final hip depth scorer와 같은 curve 계열을 사용합니다.

```js
hipDepth: [[110, 100], [120, 80], [140, 40], [155, 10], [170, 0]]
```

의미는 다음과 같습니다.

- `110도 이하`는 높은 품질로 판단
- 각도가 커질수록 점진적으로 감점
- 깊은 최저점에서 hip angle이 작아져도 빨강으로 처리하지 않음

구현 참조:

- `CURVES.hipDepth`: `public/js/workout/exercises/squat-exercise.js:55-63`
- live profile `hip_angle`의 `type: 'curve'` 적용: `public/js/workout/exercises/squat-exercise.js:88-102`
- curve scoring 처리: `public/js/workout/scoring-engine.js:332-343`, `public/js/workout/scoring-engine.js:386-419`

## 3.2 DESCENT 초반부터 hip live cue가 뜨던 문제

### 기존 동작

기존에는 `hip_angle` cue가 DESCENT 구간에서도 표시될 수 있었습니다.

하지만 DESCENT 초반에는 아직 내려가는 중이므로 hip angle이 큰 것이 정상입니다.

이 구간을 최저점 자세처럼 평가하면 사용자는 정상 동작 중에도 오류 피드백을 받게 됩니다.

### 변경 후 동작

`hip_angle` live feedback은 BOTTOM phase에서만 유지합니다.

이유는 다음과 같습니다.

- BOTTOM에서는 hip angle이 깊이/힙힌지 판단 지표로 의미가 있음
- DESCENT 초반/중간은 과도기라 정적인 정답 범위로 평가하기 부적절함

구현 참조:

- `shouldKeepLiveMetric()`의 hip cue BOTTOM 제한: `public/js/workout/exercises/squat-exercise.js:1558-1590`

## 3.3 측면에서 가려진 쪽 hip angle이 선택되던 문제

### 기존 동작

측면 live scoring에서 좌우 hip angle 중 더 작은 값이 선택되는 구조가 있었습니다.

측면에서는 반대쪽 hip landmark가 몸에 가려지거나 튈 수 있기 때문에, 작은 값을 무조건 선택하면 위험합니다.

예시:

```text
leftHip  = 118  // 카메라에 잘 보이는 쪽, 정상값
rightHip = 45   // 가려진 쪽 landmark 튐
selected = 45   // 기존에는 이 값이 선택될 수 있음
```

이 경우 실제 자세는 정상인데 live feedback이 빨강으로 튈 수 있습니다.

### 변경 후 동작

측면에서는 `visibleSide`가 있으면 해당 side의 hip/knee/tibia를 우선 사용합니다.

```text
visibleSide = left  -> leftHip / leftKnee 우선 사용
visibleSide = right -> rightHip / rightKnee 우선 사용
```

`visibleSide`가 없더라도 SIDE view에서 좌우 값 차이가 크게 나면, 가려진 쪽의 비정상적으로 작은 값을 무조건 선택하지 않도록 했습니다.

구현 참조:

- pose angle 계산 중 visible side 선택: `public/js/workout/pose-engine.js:240-265`
- angle payload에 `visibleSide` 포함: `public/js/workout/pose-engine.js:299-307`
- side-aware live metric picker: `public/js/workout/scoring-engine.js:138-149`
- `hip_angle` side-aware 선택: `public/js/workout/scoring-engine.js:171-179`
- RepCounter phase 판단의 visible-side hip 사용: `public/js/workout/rep-counter.js:732-749`

## 3.4 측면 heel contact가 너무 엄격하던 문제

### 기존 동작

뒤꿈치 접지는 far-side foot landmark noise에 취약했습니다.

기존 구조는 사실상 아래와 비슷했습니다.

```text
관측된 발 중 하나라도 뒤꿈치가 들렸다고 판단되면 heelContact = false
```

측면에서는 반대쪽 발이 몸에 가려지거나 landmark가 흔들릴 수 있으므로 이 기준은 너무 엄격합니다.

### 변경 후 동작

SIDE view에서는 `visibleSide`의 발을 우선 사용합니다.

```text
view === 'SIDE' && visibleSide 있음
-> visibleSide의 heel/toe pair를 우선 사용
```

선택된 visible side 발을 관측할 수 없을 때만 fallback으로 관측 가능한 발들을 확인합니다.

SIDE fallback에서는 한쪽 발이라도 정상 접지로 보이면 접지 유지로 판단할 수 있게 했습니다.

구현 참조:

- heel contact 계산에 `view`, `visibleSide` 전달: `public/js/workout/pose-engine.js:299-305`
- side-aware heel contact 로직: `public/js/workout/pose-engine.js:781-821`

## 3.5 측면 heel/toe tolerance 완화

### 기존 동작

heel contact는 heel과 toe의 y좌표 차이를 고정 tolerance로 판단했습니다.

```text
0.02
```

측면에서는 foot landmark가 더 흔들릴 수 있어 이 기준이 빡빡했습니다.

### 변경 후 동작

tolerance를 view별로 분리했습니다.

```text
FRONT/default: 0.02
SIDE:          0.035
```

구현 참조:

- `contactTolerance`: `public/js/workout/pose-engine.js:781-786`

## 3.6 final side heel score가 noisy ASCENT에 과하게 흔들리던 문제

### 기존 동작

측면 final heel 대표값은 BOTTOM과 ASCENT 중 더 낮은 값을 사용했습니다.

이 구조에서는 ASCENT 구간에서 발 landmark가 잠깐 흔들려도 전체 heel score가 크게 떨어질 수 있었습니다.

예시:

```text
BOTTOM heelContactAvg = 1.00
ASCENT heelContactAvg = 0.55
대표값                 = 0.55
```

### 변경 후 동작

측면 final heel 대표값은 BOTTOM을 더 중요하게 보는 가중 평균으로 변경했습니다.

```text
0.7 * bottomHeel + 0.3 * ascentHeel
```

이유는 다음과 같습니다.

- 최저점에서 뒤꿈치가 붙어 있는지가 가장 중요함
- ASCENT도 보되, landmark noise가 전체 점수를 지배하지 않게 해야 함

구현 참조:

- side heel 대표값 계산: `public/js/workout/exercises/squat-exercise.js:377-390`
- weighted average helper: `public/js/workout/exercises/squat-exercise.js:1108-1118`

## 3.7 heel contact scoring curve 완화

### 기존 curve

```js
heelContact: [[0.90, 100], [0.80, 75], [0.65, 45], [0.50, 15], [0, 0]]
```

### 변경 후 curve

```js
heelContact: [[0.85, 100], [0.70, 75], [0.55, 45], [0.40, 15], [0, 0]]
```

완화 이유는 다음과 같습니다.

- 측면 발 landmark는 false negative가 섞일 수 있음
- 몇 프레임의 오검출 때문에 점수가 급락하면 안 됨
- 실제로 반복적인 뒤꿈치 들림은 여전히 감점됨

구현 참조:

- `CURVES.heelContact`: `public/js/workout/exercises/squat-exercise.js:55-63`

## 4. 현재 측면 채점 계약

## 4.1 hip live scoring 계약

스쿼트 SIDE view에서 `hip_angle`은 다음 계약을 따릅니다.

1. live hip metric은 ideal range가 아니라 curve scoring을 사용한다.
2. `hip_angle <= 110`은 high quality로 본다.
3. 깊은 BOTTOM에서 hip angle이 작아져도 빨강으로 처리하지 않는다.
4. hip live cue는 전체 DESCENT가 아니라 BOTTOM 중심으로 보여준다.
5. `visibleSide`가 있으면 해당 side의 hip 값을 우선 사용한다.

## 4.2 heel contact live/final scoring 계약

스쿼트 SIDE view에서 `heel_contact`는 다음 계약을 따릅니다.

1. visible side foot을 primary heel contact source로 사용한다.
2. far-side foot occlusion만으로 heel contact를 실패 처리하지 않는다.
3. SIDE tolerance는 FRONT/default보다 더 널널하다.
4. final side heel 대표값은 ASCENT보다 BOTTOM을 더 크게 반영한다.
5. heel curve는 소수 false negative frame을 견딜 수 있어야 한다.

## 4.3 side-view angle consistency 계약

SIDE view이고 `visibleSide`가 있으면 hip/knee/tibia/foot은 가능한 같은 visible chain에서 가져와야 합니다.

피해야 할 구조:

```text
left hip + right knee + averaged tibia
```

의도한 구조:

```text
visible side hip + visible side knee + visible side tibia + visible side foot
```

## 5. 테스트 커버리지

이번 변경은 아래 회귀 테스트로 고정합니다.

### 5.1 heel contact visible side 테스트

SIDE view에서 visible side foot을 우선 사용하고, hidden side의 noisy heel/toe 값 때문에 실패하지 않는지 검증합니다.

참조:

- `test/workout/squat-form-alignment.test.js:78-89`

### 5.2 noisy ASCENT가 있어도 final heel score가 급락하지 않는지 검증

BOTTOM heel contact가 좋고 ASCENT만 noisy한 경우, final heel score가 과하게 낮아지지 않는지 검증합니다.

참조:

- `test/workout/squat-form-alignment.test.js:211-261`

### 5.3 hip cue BOTTOM only 테스트

SIDE view에서 hip live cue가 DESCENT에서는 제거되고 BOTTOM에서는 유지되는지 검증합니다.

참조:

- `test/workout/squat-form-alignment.test.js:441-468`

### 5.4 깊은 bottom hip angle green 테스트

깊은 bottom hip angle이 final hip curve 기준으로 live에서도 high quality 처리되는지 검증합니다.

참조:

- `test/workout/squat-form-alignment.test.js:470-489`

### 5.5 occluded-side hip 무시 테스트

SIDE view에서 visible side가 알려진 경우, 가려진 쪽의 작은 hip angle이 선택되지 않는지 검증합니다.

참조:

- `test/workout/squat-form-alignment.test.js:491-511`

### 5.6 RepCounter visible-side hip 테스트

SIDE view phase 판단에서도 visible side hip angle을 사용하는지 검증합니다.

참조:

- `test/workout/squat-form-alignment.test.js:513-522`

## 6. 수용 기준

아래 조건을 만족하면 이 spec을 충족한 것으로 봅니다.

1. 정상적인 깊은 측면 스쿼트에서 hip angle이 70도 미만이라는 이유만으로 BOTTOM live feedback이 빨강이 되지 않는다.
2. DESCENT 초반/중간의 과도기 동작을 hip 자세 오류처럼 표시하지 않는다.
3. 한쪽 side가 잘 보이고 반대쪽이 가려졌을 때, hip/knee/tibia는 visible side를 우선 사용한다.
4. 반대쪽 foot landmark가 noisy하거나 hidden이라는 이유만으로 heel contact가 실패하지 않는다.
5. final side heel score에서 BOTTOM heel contact가 ASCENT noise보다 더 크게 반영된다.
6. 전체 workout test suite가 통과한다.

## 7. 검증 명령

이번 구현은 아래 명령으로 검증했습니다.

```bash
node --test test/workout/squat-form-alignment.test.js test/workout/squat-scoring-robustness.test.js test/workout/quality-gate.test.js
npm test
```

현재 spec 기준 기대 결과:

```text
226 tests passing, 0 failing
```

## 8. 이번 범위에서 제외한 것

이 spec은 아래 항목을 아직 구현 범위로 보지 않습니다.

1. 3~5프레임 live color hysteresis
2. 모든 metric에 대한 live/final shared config 통합
3. selected side, raw hip angle, heel contact source를 보여주는 UI debug overlay
4. 별도 camera calibration flow

위 항목들은 여전히 유효한 후속 개선이지만, 이번 변경은 측면 hip/heel live scoring 불안정성을 즉시 완화하는 데 집중합니다.

## 9. 후속 개선 추천

실제 영상에서 side-view live feedback이 여전히 깜빡이면 아래 순서로 개선합니다.

1. live color hysteresis 추가
   - green 진입: `score >= 80`
   - green 유지: `score >= 72`
   - orange 진입: `score >= 60`
   - orange 유지: `score >= 52`
2. 디버그 로그 추가
   - `visibleSide`
   - `leftHip`, `rightHip`, selected hip
   - `leftHeel/toe`, `rightHeel/toe`, selected heel contact
   - current phase
3. `rawMetrics`에 visible-side confidence 저장
4. UI/debug 표시로 현재 어떤 side chain을 쓰는지 노출

## 10. 요약

이번 side-view 스쿼트 채점 수정은 기존 모델을 아래에서:

```text
양쪽 landmark를 모두 보고, 가려진 쪽 noise까지 자세 오류로 감점
```

아래로 바꾼 것입니다.

```text
측면에서는 visible side chain을 우선 사용하고,
live feedback이 final scoring과 충돌하지 않도록 정렬
```

그 결과 측면 스쿼트에서 hip live feedback과 heel contact 점수가 더 안정적으로 동작합니다.
