# 런타임 중심 운동 평가 신뢰도 개선 통합 실행 스펙 v3

작성일: 2026-04-21

---

## 1. 목적

DB 스키마 변경 없이, 현재 클라이언트 런타임 파이프라인만으로 운동 평가 시스템의 신뢰도를 높인다.

목표는 3가지다.

1. **채점 가능 여부를 점수 계산보다 먼저 판정한다.**
2. **입력 품질 실패와 운동 수행 실패를 분리한다.**
3. **DB 대신 export JSON 기반으로 검증·튜닝 루프를 구축한다.**

---

## 2. 핵심 정책

### 2.1 점수와 판별 가능성을 분리한다
시스템은 항상 점수를 내지 않는다. 먼저 **지금 채점 가능한 상태인지**를 판단하고, 가능할 때만 운동 평가를 진행한다.

### 2.2 입력 품질 문제는 무조건 공통 quality gate에서 처리한다
다음은 운동 수행 실패가 아니라 **입력 품질 실패**다.

- 전신 미포함
- 핵심 관절 visibility 부족
- 잘못된 시점(view)
- landmark/tracking 불안정
- detection/tracking confidence 부족
- 안정 프레임 부족
- camera 거리 문제

이들은 절대 exercise module hard fail로 남아가지 않는다.

### 2.3 운동 모듈은 "수행 품질"만 평가한다
공통 gate를 통과한 뒤에만 운동별 hard fail / soft fail / 피드백을 적용한다.

- 스쿼트: depth, knee alignment, torso stability 등
- 푸쉬업: depth reached, lockout complete, body line maintained 등

### 2.4 저품질 입력은 저점수가 아니라 withhold다
입력 품질이 나쁘면 0점이나 저점수로 처리하지 않고, **withhold + 교정 메시지**로 본다.

---

## 3. 목표 아키텍처

`pose-engine → common quality gate → exercise module → scoring-engine → session-controller → session-buffer`

### `pose-engine.js`
- raw landmark/angle/view/visibility/stability 신호 생성

### common quality gate
- `pass` / `withhold` 판정
- withhold reason code 결정

### exercise module
- 수행 품질 평가
- hard fail / soft fail / 피드백 산출

### `scoring-engine.js`
- scored / hard_fail / soft_fail / withheld 상태 통합 처리

### `session-controller.js`
- 사용자 메시지 및 세션 상태 반영
- withhold reason → UX 문구 변환

### `session-buffer.js`
- export JSON으로 검증 가능한 결과 저장

---

## 4. 1차 구현 범위

### 포함
- `pose-engine.js`
- `session-controller.js`
- `scoring-engine.js`
- `squat-exercise.js`
- `push-up-exercise.js`
- `session-buffer.js`

### 제외
- DB 스키마 변경
- 관리자 설정 UI
- 신규 운동 추가
- 서버 저장 구조 확장
- 모델 교체

---

## 5. 공통 quality gate 상세 스펙

### 5.1 판정 결과
- `pass`
- `withhold`

### 5.2 공통 withhold reason code
- `body_not_fully_visible`
- `key_joints_not_visible`
- `view_mismatch`
- `unstable_tracking`
- `insufficient_stable_frames`
- `camera_too_close_or_far`
- `low_detection_confidence`
- `low_tracking_confidence`

### 5.3 quality gate 입력
- frame inclusion
- key joint visibility
- estimated view / selected view 적합성
- detection confidence
- tracking confidence
- recent stability window
- stable frame streak

### 5.4 핵심 규칙
1. 단일 프레임 기준이 아니라 **연속 안정 프레임 기반**으로 pass 판정
2. input quality 문제는 exercise module로 넘기지 않음
3. withhold는 점수 계산 대상이 아님
4. pass 전환은 즉시가 아니라 안정 조건 충족 후 발생

---

## 6. 운동별 규칙 스펙

### 6.1 스쿼트
허용 view: `FRONT / SIDE / DIAGONAL`

#### 수행 품질 평가 축
- depth
- hip hinge
- torso stability
- knee alignment
- balance/control

#### view별 우선 metric 원칙
스쿼트는 허용 view가 넓으므로, **view별로 신뢰도가 높은 metric과 낮은 metric을 구분**한다.

| View | 1차 신뢰 metric | 2차 보조 metric | 낮은 신뢰 / 피드백 주의 |
|---|---|---|---|
| `FRONT` | `knee_alignment` | `depth` | `hip_hinge` 추정 불안정. depth는 추정 가중치 낮춤 |
| `SIDE` | `depth`, `hip_hinge` | `torso_stability` | `knee_alignment` 판정 불가 또는 추정 가중치 낮춤 |
| `DIAGONAL` | `depth` | `torso_stability` | `knee_alignment` 완전 불가, `hip_hinge` 추정 보정 필요 |

#### 1차 구현 규칙
- SIDE view 기준은 전통적 스쿼트 평가와 가장 잘 맞으므로 1차 기준으로 둔다.
- FRONT view일 때 `depth`는 다른 metric 대비 가중치를 낮추고, depth 판정은 `hard_fail`보다 `soft_fail` 중심으로 처리할 수 있다.
- DIAGONAL view는 `knee_alignment`를 판정 대상에서 제외하거나 완전 무시한다.
- view별로 `soft_fail` vs `hard_fail` 경계가 달라질 수 있다.

#### 규칙
- 잘못된 view는 hard fail이 아니라 gate withhold
- 수행 실패만 hard/soft fail 처리
- phase-aware feedback 유지
- view별 신뢰 metric 차등 적용

### 6.2 푸쉬업
허용 view: `SIDE`

#### 수행 품질 평가 축
- depth reached
- lockout complete
- body line maintained
- control / tempo

#### 규칙
- SIDE mismatch는 무조건 gate withhold
- `low_confidence`는 운동 모듈 reason에서 제거하고 공통 gate로 이동
- `depth_not_reached`, `lockout_incomplete`, `body_line_broken`는 수행 실패로만 처리

---

## 7. scoring-engine 상태 모델 및 전이 규칙

1차 구현에서 scoring 결과 상태를 아래처럼 명시 분리한다.

- `scored`
- `withheld`
- `hard_fail`
- `soft_fail`

### 7.1 상태 정의
| 상태 | 의미 |
|---|---|
| `scored` | 채점 가능 상태 + 운동 수행 기준 충족. 정상 점수 계산 |
| `hard_fail` | 채점 가능 상태 + 운동 수행 기준 미달. 점수 상한 제한 또는 no-rep 처리 |
| `soft_fail` | 채점 가능 상태 + 운동 수행 부분 미달. 감점 적용 + 피드백 |
| `withheld` | 입력 품질 부족으로 채점 자체를 수행하지 않음 |

### 7.2 rep 단위 상태 전이 규칙

#### 규칙 1: rep 시작 전
- gate가 `withhold` → rep 시작되지 않음
- rep는 gate가 pass 상태에서만 활성화됨

#### 규칙 2: rep 도중 gate가 withhold
- **rep를 폐기한다.** 현재 rep는 `withheld`로 기록되며 완성되지 않는다.
- 완성된 부분이라도 점수 계산에 들어가지 않는다.
- rep 카운터는 증가하지 않는다.
- withhold 종료 후 다음 pass에서 새 rep를 시작한다.

#### 규칙 3: rep 도중 hard_fail 발생
- rep는 `hard_fail`로 기록된다.
- **점수는 상한 제한 또는 0점(no-rep)**으로 처리한다.
- 이 rep는 카운트되지 않는다.
- 하위 metric 점수는 export JSON에 남긴다(원인 분석용).

#### 규칙 4: rep 도중 soft_fail 누적
- rep는 완성되며 `soft_fail` 상태로 기록된다.
- 최종 rep score는 soft_fail별 감점 규칙에 따라 **점수 상한 cap**으로 적용한다.
- 예: soft_fail 2개 → score cap 70%, soft_fail 4개 → score cap 50% (구현 시 운동별 cap matrix 정의)
- soft_fail 내역은 export JSON에 남긴다.

#### 규칙 5: pass 복귀 시
- gate가 `withhold`에서 `pass`로 돌아오면 즉시 rep를 시작하지 않는다.
- **안정 프레임 기준 충족 후**에만 다음 rep 시작 허용

#### 규칙 6: scoring-engine 내부 처리 순서
1. quality gate 판정 (`pass` / `withhold`)
2. `withhold` → withheld 처리, 운동 모듈 평가 진행 안 함
3. `pass` → 운동 모듈 평가 진행
4. 운동 모듈이 hard_fail 반환 → hard_fail 처리
5. 운동 모듈이 soft_fail 반환 → soft_fail 처리 + score cap 적용
6. 운동 모듈이 pass → scored 처리, 정상 점수 계산

### 7.3 rep 카운터 정책
| 상태 | rep 카운터 증가 여부 | 최종 score 적용 여부 |
|---|---|---|
| `scored` | O | O |
| `hard_fail` | X | X (상한 제한 또는 0) |
| `soft_fail` | O | O (score cap 적용) |
| `withheld` | X | X |

---

## 8. session-controller UX 규칙

### 필수 동작
- withhold 시 저점수 누적 금지
- 보류 사유별 교정 메시지 표시
- allowed/default view 기반 가이드 표시
- 동일 메시지 반복 스팸 방지
- pass 복귀 시 안정 프레임 충족 후 채점 재개

### 예시 문구
- `body_not_fully_visible` → "몸 전체가 화면에 보이도록 조금 더 뒤로 가 주세요."
- `view_mismatch` → "현재 운동은 옆면 시점이 필요합니다."
- `key_joints_not_visible` → "팔과 다리가 잘 보이도록 자세와 카메라를 조정해 주세요."

---

## Appendix A. 1차 Threshold Seed Table

아래 값은 **정답값이 아니라 초기 구현용 시드값**이다. 1차 목표는 완벽한 숫자가 아니라, 구현자 해석 분산을 막는 것이다.

| 항목 | 1차 시드값 | 메모 |
|---|---:|---|
| `minDetectionConfidence` | `0.50` | 기존 기준 유지 |
| `minTrackingConfidence` | `0.50` | 기존 기준 유지 |
| `estimatedViewConfidence` 최소 pass | `0.60` | 미만이면 `view_mismatch` 또는 보류 후보 |
| 핵심 관절 평균 visibility 최소 pass | `0.65` | 운동별 필수 관절군 평균 |
| 필수 관절 중 단일 관절 최저 허용값 | `0.40` | 이보다 낮으면 `key_joints_not_visible` 우선 |
| stable frame streak 최소값 `N` | `8` frames | 약 250~300ms 수준 시작값 |
| stability window | `12` frames | 최근 프레임 기준 요약 |
| unstable 판정 비율 | 최근 window 중 `30%` 이상 불안정 | `unstable_tracking` 후보 |
| frame inclusion 최소 비율 | `0.85` | 주요 신체 landmark 포함 비율 |
| camera too close/far 판정 | torso/hip-shoulder scale가 기준 범위 밖 | 구체 구현은 상대 비율 기반 |
| withhold 해제 조건 | pass 조건 `N` 프레임 연속 충족 | 즉시 복귀 금지 |

### 추가 원칙
- 푸쉬업은 `SIDE` 요구가 강하므로 `estimatedViewConfidence`를 더 엄격히 적용 가능
- 스쿼트는 허용 view가 넓으므로 visibility/stability 쪽 가중치를 상대적으로 더 둘 수 있음

---

## Appendix B. Reason Code Responsibility Matrix

### B.1 공통 gate 전용 reason
아래 reason은 **무조건 common quality gate 소관**이다.

| Reason Code | 소관 | 의미 |
|---|---|---|
| `body_not_fully_visible` | Gate only | 몸 전체가 프레임에 충분히 안 들어옴 |
| `key_joints_not_visible` | Gate only | 핵심 관절 visibility 부족 |
| `view_mismatch` | Gate only | 요구 view와 현재 추정 view 불일치 |
| `unstable_tracking` | Gate only | landmark/tracking 흔들림 |
| `insufficient_stable_frames` | Gate only | 연속 안정 프레임 부족 |
| `camera_too_close_or_far` | Gate only | 카메라 거리 문제 |
| `low_detection_confidence` | Gate only | detection confidence 부족 |
| `low_tracking_confidence` | Gate only | tracking confidence 부족 |

### B.2 운동 모듈 전용 reason
아래 reason은 **운동 수행 품질 실패**에만 사용한다.

#### Squat
- `depth_not_reached`
- `knee_alignment_broken`
- `torso_unstable`
- `hip_hinge_insufficient`
- `balance_lost`

#### Push-up
- `depth_not_reached`
- `lockout_incomplete`
- `body_line_broken`
- `tempo_uncontrolled`

### B.3 금지 규칙
아래는 금지한다.

- `low_confidence`를 push-up hard fail reason으로 사용
- `view_mismatch`를 운동 모듈 hard fail로 사용
- visibility 부족을 rep failure로 취급

즉:

> **입력 품질 문제 = Gate**  
> **동작 수행 문제 = Exercise Module**

---

## Appendix C. Export JSON MVP vs Extended

### C.1 1차 구현 MVP 필드
처음부터 모든 레벨을 다 넣지 않고, **rep 레벨 + withhold 이벤트 레벨**을 우선한다.

#### Session level
- `session_id`
- `exercise_type`
- `selected_view`
- `allowed_views`
- `default_view`
- `final_score`
- `withhold_count`
- `withhold_reason_counts`

#### Withhold event level
- `timestamp`
- `gate_result`
- `withhold_reason`
- `estimated_view`
- `estimated_view_confidence`
- `stable_frame_count`

#### Rep level
- `rep_index`
- `rep_result` (`scored|hard_fail|soft_fail|withheld`)
- `rep_score`
- `hard_fail_reason`
- `soft_fail_reasons`
- `score_cap_applied`
- `quality_summary`

### C.2 후순위 extended 필드
2차 이후 필요 시 추가한다.

- frame-level visibility summary
- frame-level stability summary
- raw landmark-derived gate inputs
- phase-by-phase metric traces
- per-frame scoring state timeline
- detailed interim snapshots expansion

### 원칙
1. MVP는 튜닝 가능한 최소 로그만 남긴다
2. 구현 복잡도가 높은 frame-level full dump는 후순위다
3. threshold 조정에 직접 필요한 필드부터 저장한다

---

## Appendix D. 검증용 영상 라벨 템플릿

threshold 튜닝과 결과 비교를 위해, 영상별 정답 메모를 아래 형식으로 남긴다.

### D.1 템플릿

```md
# Validation Video Label

- video_id:
- file_name:
- exercise_type: squat | push-up
- expected_view:
- actual_view_note:
- expected_gate_result: pass | withhold
- expected_withhold_reason:
- expected_rep_result_summary:
- major_observed_issues:
- notes:
```

### D.2 작성 예시

```md
# Validation Video Label

- video_id: PU_003
- file_name: pushup_side_partial_arm.mp4
- exercise_type: push-up
- expected_view: SIDE
- actual_view_note: side angle is mostly correct but right arm visibility drops intermittently
- expected_gate_result: withhold
- expected_withhold_reason: key_joints_not_visible
- expected_rep_result_summary: no reliable scoring should occur
- major_observed_issues: elbow/wrist visibility unstable, partial truncation
- notes: should not be treated as low-score push-up attempt
```

### D.3 최소 라벨 기준
모든 검증 영상은 최소 아래를 가져야 한다.

- 운동 종류
- 기대 view
- 채점 가능 여부 정답
- 보류 정답 사유 또는 정상 채점 기대
- 주요 관찰 문제

---

## 9. 완료 기준

1. 입력 품질 실패와 수행 실패가 분리된다
2. common gate reason과 exercise reason이 섞이지 않는다
3. withhold가 저점수로 환산되지 않는다
4. push-up의 low confidence가 gate 소관으로 이동한다
5. export JSON MVP만으로 튜닝 루프가 가능하다
6. 검증 영상별 라벨 기준이 존재한다

---

## 10. 최종 결론

이번 작업의 본질은 점수 공식을 복잡하게 만드는 게 아니라:

> **"채점 가능한 입력인가?"를 먼저 판정하고, 그 다음에만 운동 수행 품질을 평가하는 구조로 고정하는 것**

이다.

이 v3는 바로 구현 착수가 가능한 실행 스펙 수준이다.
