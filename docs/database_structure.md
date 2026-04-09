# FitPlus 데이터베이스 구조 설명서

이 문서는 FitPlus 서비스에서 사용하는 PostgreSQL 데이터베이스 스키마를 설명합니다.

## 1. 개요 (Overview)

FitPlus 데이터베이스는 크게 다음 5개 영역으로 구성됩니다.

1. **사용자 / 공통 운영**
2. **운동 메타데이터**
3. **루틴 템플릿 및 실행 기록**
4. **운동 세션 및 스냅샷 기록**
5. **퀘스트 / 포인트 / 티어**

운동 수행 데이터는 루틴 실행 계층과 실제 채점 세션 계층으로 분리되어 있으며, 세션의 중간/최종 결과는 별도의 스냅샷 테이블에 저장됩니다.

---

## 2. 상세 테이블 구조

### 2.1 사용자 / 공통 운영

#### `app_user`
서비스 사용자 정보를 저장합니다.

- `user_id` (UUID, PK): 사용자 고유 식별자
- `login_id`: 로그인 아이디
- `password_hash`: 비밀번호 해시
- `nickname`: 사용자 닉네임
- `created_at`: 계정 생성 시각
- `last_login_at`: 마지막 로그인 시각
- `status`: 계정 상태 (`active`, `blocked`, `deleted`)

#### `user_settings`
사용자별 설정 정보를 저장합니다.

- `user_id` (UUID, PK, FK): `app_user.user_id` 참조
- `theme`: UI 테마 (`light`, `dark`, `system`)
- `updated_at`: 설정 수정 시각

---

### 2.2 운동 메타데이터

#### `exercise`
시스템에서 지원하는 운동 종목을 정의합니다.

- `exercise_id` (BIGINT, PK): 운동 고유 ID
- `code`: JS 채점 모듈과 연결되는 운동 코드
- `name`: 운동 이름
- `description`: 운동 설명
- `is_active`: 활성 여부
- `sort_order`: 정렬 순서
- `default_target_type`: 기본 목표 기준 (`REPS`, `TIME`)
- `thumbnail_url`: 대표 이미지 URL
- `created_at`: 생성 시각
- `updated_at`: 수정 시각

#### `exercise_allowed_view`
운동별 허용 자세 목록을 저장합니다.

- `exercise_id` (FK): `exercise.exercise_id` 참조
- `view_code`: 허용 자세 코드 (`FRONT`, `SIDE`, `DIAGONAL`)
- `is_default`: 기본 자세 여부
- `created_at`: 생성 시각

기본 키는 `(exercise_id, view_code)` 복합 키입니다.

---

### 2.3 루틴 템플릿

#### `routine`
사용자가 생성한 루틴 템플릿을 저장합니다.

- `routine_id` (BIGINT, PK): 루틴 고유 ID
- `user_id` (UUID, FK): 루틴 소유 사용자
- `name`: 루틴 이름
- `is_active`: 사용 여부
- `created_at`: 생성 시각
- `updated_at`: 수정 시각

#### `routine_setup`
루틴 템플릿에 포함된 운동 단계 정보를 저장합니다.

- `step_id` (BIGINT, PK): 단계 고유 ID
- `routine_id` (FK): `routine.routine_id` 참조
- `order_no`: 루틴 내 단계 순서
- `exercise_id` (FK): 수행 운동 ID
- `target_type`: 목표 기준 (`REPS`, `TIME`)
- `target_value`: 목표 횟수 또는 목표 시간
- `rest_sec`: 다음 단계 전 휴식 시간
- `sets`: 계획 세트 수
- `created_at`: 생성 시각
- `updated_at`: 수정 시각

동일 루틴 내 단계 순서 중복 방지를 위해 `(routine_id, order_no)` 유니크 제약이 있습니다.

---

### 2.4 루틴 실제 실행 계층

#### `routine_instance`
루틴 1회 실행 기록을 저장합니다.

- `routine_instance_id` (BIGINT, PK): 실행 고유 ID
- `routine_id` (FK): 어떤 루틴을 실행한 것인지
- `user_id` (UUID, FK): 실행 사용자 ID
- `started_at`: 시작 시각
- `ended_at`: 종료 시각
- `status`: 실행 상태 (`RUNNING`, `DONE`, `ABORTED`)
- `total_score`: 루틴 전체 점수
- `created_at`: 생성 시각
- `updated_at`: 수정 시각

#### `routine_step_instance`
루틴 실행 중 실제 수행된 각 운동 단계를 저장합니다.

- `step_instance_id` (BIGINT, PK): 실행 단계 고유 ID
- `routine_instance_id` (FK): `routine_instance.routine_instance_id` 참조
- `step_id` (FK): 원본 `routine_setup.step_id`
- `exercise_id` (FK): 실제 수행 운동 ID
- `order_no`: 실제 실행 순서
- `target_type_snapshot`: 실행 당시 목표 기준 스냅샷
- `target_value_snapshot`: 실행 당시 목표값 스냅샷
- `planned_sets`: 계획 세트 수
- `completed_sets`: 완료 세트 수
- `status`: 단계 상태
- `started_at`: 시작 시각
- `ended_at`: 종료 시각
- `created_at`: 생성 시각
- `updated_at`: 수정 시각

이 테이블은 루틴 템플릿의 단계 정의와 실제 수행 결과를 분리하기 위한 실행 이력 계층입니다.

---

### 2.5 세트 계층

#### `workout_set`
루틴 단계 안의 실제 세트 수행 정보를 저장합니다.

- `set_id` (BIGINT, PK): 세트 고유 ID
- `step_instance_id` (FK): `routine_step_instance.step_instance_id` 참조
- `set_no`: 단계 내 세트 번호
- `target_type`: 목표 기준 (`REPS`, `TIME`)
- `target_value`: 목표 횟수 또는 목표 시간
- `actual_value`: 실제 달성 값
- `value_unit`: 결과 단위 (`COUNT`, `SEC`)
- `result_basis`: 세트 결과 기준 (`REPS`, `DURATION`)
- `score`: 세트 대표 점수
- `is_success`: 목표 달성 여부
- `started_at`: 시작 시각
- `ended_at`: 종료 시각
- `duration_sec`: 세트 총 소요 시간
- `rest_sec_after`: 세트 종료 후 휴식 시간
- `status`: 세트 상태 (`RUNNING`, `DONE`, `ABORTED`)
- `detail`: 세트 상세 JSONB
- `created_at`: 생성 시각
- `updated_at`: 수정 시각

동일 실행 단계 내 세트 번호 중복 방지를 위해 `(step_instance_id, set_no)` 유니크 제약이 있습니다.

예시:

- 반복 운동 세트: `target_type='REPS'`, `value_unit='COUNT'`, `result_basis='REPS'`
- 버티기 운동 세트: `target_type='TIME'`, `value_unit='SEC'`, `result_basis='DURATION'`

---

### 2.6 실제 채점 세션

#### `workout_session`
실제 카메라 기반 채점 세션을 저장합니다.

- `session_id` (BIGINT, PK): 세션 고유 ID
- `user_id` (UUID, FK): 세션 수행 사용자 ID
- `exercise_id` (FK): 수행 운동 ID
- `set_id` (FK, NULL 가능): 세트 기반 루틴 세션이면 연결되는 세트 ID
- `mode`: 세션 모드 (`FREE`, `ROUTINE`, `LEARN`)
- `status`: 세션 상태 (`RUNNING`, `DONE`, `ABORTED`)
- `selected_view`: 사용자가 선택한 자세
- `result_basis`: 세션 결과 기준 (`REPS`, `DURATION`)
- `total_result_value`: 세션 대표 결과값
- `total_result_unit`: 결과 단위 (`COUNT`, `SEC`)
- `final_score`: 세션 최종 점수
- `summary_feedback`: 대표 피드백
- `started_at`: 시작 시각
- `ended_at`: 종료 시각
- `created_at`: 생성 시각
- `updated_at`: 수정 시각

루틴 운동과 자유 운동의 계층 구조는 다음과 같습니다.

```text
루틴 운동
routine_instance
  -> routine_step_instance
    -> workout_set
      -> workout_session

자유 운동 / 학습 모드
workout_session
```

즉, 루틴 기반 세션은 `set_id`를 통해 세트와 연결되고, 자유 운동이나 학습 모드는 `set_id` 없이 단독 세션으로 저장될 수 있습니다.

---

### 2.7 세션 스냅샷 저장

#### `session_snapshot`
세션의 중간 또는 최종 스냅샷 헤더를 저장합니다.

- `session_snapshot_id` (BIGINT, PK): 스냅샷 고유 ID
- `session_id` (FK): `workout_session.session_id` 참조
- `snapshot_no`: 세션 내 스냅샷 순번
- `snapshot_type`: 스냅샷 유형 (`INTERIM`, `FINAL`)
- `recorded_at`: 실제 스냅샷 기록 시각
- `created_at`: 생성 시각

동일 세션 내 스냅샷 순번 중복 방지를 위해 `(session_id, snapshot_no)` 유니크 제약이 있습니다.

#### `session_snapshot_score`
스냅샷 시점의 대표 점수 및 요약 정보를 저장합니다.

- `session_snapshot_id` (BIGINT, PK, FK): `session_snapshot.session_snapshot_id` 참조
- `score`: 해당 시점 전체 점수
- `result_basis`: 결과 기준 (`REPS`, `DURATION`)
- `result_value`: 대표 결과값
- `result_unit`: 결과 단위 (`COUNT`, `SEC`)
- `summary_feedback`: 대표 피드백
- `detail`: 상세 JSONB
- `created_at`: 생성 시각

한 스냅샷당 대표 점수 요약은 최대 1건입니다.

#### `session_snapshot_metric`
스냅샷 시점의 세부 metric 집계 정보를 저장합니다.

- `session_snapshot_metric_id` (BIGINT, PK): metric 고유 ID
- `session_snapshot_id` (FK): `session_snapshot.session_snapshot_id` 참조
- `metric_key`: 내부 metric 키
- `metric_name`: 화면 표시용 metric 이름
- `avg_score`: 평균 점수
- `avg_raw_value`: 평균 raw 값
- `min_raw_value`: 최소 raw 값
- `max_raw_value`: 최대 raw 값
- `sample_count`: 샘플 수
- `detail`: 상세 JSONB
- `created_at`: 생성 시각

이 구조를 통해 하나의 세션에 대해 여러 시점의 중간 결과와 최종 결과를 모두 저장할 수 있습니다.

---

### 2.8 세션 이벤트

#### `session_event`
운동 도중 발생하는 이벤트나 알림 로그를 저장합니다.

- `event_id` (BIGINT, PK): 이벤트 고유 ID
- `session_id` (FK): `workout_session.session_id` 참조
- `event_time`: 이벤트 발생 시각
- `type`: 이벤트 종류
- `payload`: 상세 JSONB
- `created_at`: 생성 시각

예를 들어 자세 경고, rep 완료, 세트 종료, 카메라 감지 오류 등의 이벤트를 기록할 수 있습니다.

---

### 2.9 퀘스트 / 포인트 / 티어

#### `tier_rule`
티어 기준 정보를 저장합니다.

- `tier` (INT, PK): 티어 숫자 레벨
- `min_points`: 해당 티어 최소 포인트 기준
- `name`: 티어 이름

#### `quest_template`
퀘스트 템플릿을 저장합니다.

- `quest_template_id` (BIGINT, PK): 퀘스트 템플릿 고유 ID
- `scope`: 퀘스트 주기 (`DAILY`, `WEEKLY`)
- `type`: 퀘스트 유형 (`DO`, `QUALITY`, `HABIT`, `CHALLENGE`)
- `category`: 슬롯 선발 시 사용하는 카테고리 (기본값 `GENERAL`)
- `difficulty`: 난이도 (`EASY`, `NORMAL`, `HARD`)
- `title`: 퀘스트 제목
- `condition`: 달성 조건 JSONB
- `reward_points`: 완료 시 지급 포인트
- `min_tier` (FK, NULL 가능): 허용 최소 티어, `tier_rule.tier` 참조
- `max_tier` (FK, NULL 가능): 허용 최대 티어, `tier_rule.tier` 참조
- `selection_weight`: 슬롯 내 랜덤 선발 가중치
- `cooldown_days`: 최근 선발 후 재등장 제한 일수
- `exclusive_group`: 동시에 같이 뽑히면 안 되는 그룹 키(선택)
- `is_active`: 활성 여부
- `created_at`: 생성 시각
- `updated_at`: 수정 시각

`min_tier`, `max_tier`가 모두 `NULL`이면 전체 티어 공용 퀘스트입니다.

#### `quest_assignment_rule`
슬롯 기반 퀘스트 선발 규칙을 저장합니다.

- `rule_id` (BIGINT, PK): 선발 규칙 고유 ID
- `scope`: 규칙 적용 주기 (`DAILY`, `WEEKLY`)
- `slot_no`: 슬롯 번호 (예: 1, 2, 3, 4)
- `category`: 슬롯 선발 카테고리
- `type`: 슬롯 선발 타입
- `count`: 해당 슬롯에서 선발할 퀘스트 수
- `min_tier` (FK, NULL 가능): 규칙 적용 최소 티어, `tier_rule.tier` 참조
- `max_tier` (FK, NULL 가능): 규칙 적용 최대 티어, `tier_rule.tier` 참조
- `is_active`: 활성 여부

예시 (DAILY):

- slot 1: `DO` 2개
- slot 2: `QUALITY` 1개
- slot 3: `HABIT` 1개
- slot 4: `CHALLENGE` 2개

동일한 `scope`, `slot_no`라도 `min_tier`/`max_tier` 구간이 다르면 별도 규칙으로 공존할 수 있습니다.

#### `user_quest`
사용자에게 실제 부여된 퀘스트를 저장합니다.

- `user_quest_id` (BIGINT, PK): 사용자 퀘스트 고유 ID
- `user_id` (UUID, FK): 퀘스트를 부여받은 사용자 ID
- `quest_template_id` (FK): 어떤 템플릿 기반인지
- `period_start`: 퀘스트 유효 시작일
- `period_end`: 퀘스트 유효 종료일
- `status`: 진행 상태 (`ACTIVE`, `DONE`, `EXPIRED`)
- `progress`: 현재 진행 상황 JSONB
- `created_at`: 생성 시각
- `updated_at`: 수정 시각

중복 퀘스트 부여 방지를 위해 `(user_id, quest_template_id, period_start, period_end)` 유니크 제약이 있습니다.

#### `point_ledger`
포인트 증감 이력을 저장하는 원장 테이블입니다.

- `ledger_id` (BIGINT, PK): 포인트 원장 고유 ID
- `user_id` (UUID, FK): 포인트 변화가 발생한 사용자 ID
- `source_type`: 포인트 발생 원인 유형 (`QUEST`, `BONUS`, `TUTORIAL`, `ADJUSTMENT`)
- `source_id`: 원인 객체의 ID
- `points`: 증감 포인트 값
- `note`: 관리용 메모
- `created_at`: 포인트 반영 시각

이 테이블은 부분 유니크 인덱스를 사용하여 중복 적립을 방지합니다.

- `source_id`가 있는 경우: `(user_id, source_type, source_id)` 유니크
- `source_id`가 없는 경우: `(user_id, source_type)` 유니크

---

## 3. 주요 관계 요약

- 한 명의 사용자(`app_user`)는 여러 루틴(`routine`)을 가질 수 있습니다.
- 한 개의 루틴은 여러 단계(`routine_setup`)를 가질 수 있습니다.
- 한 번의 루틴 실행(`routine_instance`)은 여러 실행 단계(`routine_step_instance`)를 가질 수 있습니다.
- 한 실행 단계는 여러 세트(`workout_set`)를 가질 수 있습니다.
- 한 세트는 하나 이상의 실제 채점 세션(`workout_session`)과 연결될 수 있도록 설계되었습니다.
- 한 세션은 여러 스냅샷(`session_snapshot`)을 가질 수 있습니다.
- 한 스냅샷은 하나의 대표 점수(`session_snapshot_score`)와 여러 metric(`session_snapshot_metric`)을 가질 수 있습니다.
- 퀘스트 선발 규칙(`quest_assignment_rule`)은 주기/슬롯/티어별 선발 구성을 정의합니다.
- 한 사용자는 여러 퀘스트(`user_quest`)를 부여받을 수 있습니다.
- 한 사용자는 여러 포인트 이력(`point_ledger`)을 가질 수 있습니다.

---

## 4. 인덱스 및 조회 최적화

주요 조회 성능 향상을 위해 다음과 같은 인덱스가 정의되어 있습니다.

- `routine(user_id)`
- `routine_setup(exercise_id)`
- `routine_instance(user_id)`
- `routine_step_instance(routine_instance_id)`
- `routine_step_instance(exercise_id)`
- `workout_set(step_instance_id)`
- `workout_session(user_id)`
- `workout_session(exercise_id)`
- `workout_session(set_id)`
- `session_snapshot(session_id)`
- `session_snapshot(recorded_at)`
- `session_snapshot_metric(session_snapshot_id)`
- `session_event(session_id, event_time)`
- `quest_template(scope, is_active)`
- `quest_template(scope, category, type, is_active)`
- `quest_template(min_tier, max_tier)`
- `quest_assignment_rule(scope, is_active, slot_no)`
- `quest_assignment_rule(min_tier, max_tier)`
- `quest_assignment_rule(scope, slot_no, coalesce(min_tier, -1), coalesce(max_tier, -1))` (unique)
- `user_quest(user_id, period_start, period_end)`
- `user_quest(user_id, quest_template_id, period_start)`
- `point_ledger(user_id, created_at)`

---

## 5. 정리

FitPlus 데이터베이스는 운동 메타데이터, 루틴 템플릿, 실제 운동 수행 기록, 중간/최종 채점 스냅샷, 그리고 퀘스트/포인트 시스템을 분리하여 관리하도록 설계되어 있습니다.

특히 운동 수행 기록은 다음과 같이 계층적으로 구성됩니다.

- 루틴 정의: `routine`, `routine_setup`
- 루틴 실행: `routine_instance`, `routine_step_instance`, `workout_set`
- 실제 채점 세션: `workout_session`
- 세션 결과 저장: `session_snapshot`, `session_snapshot_score`, `session_snapshot_metric`
- 부가 로그: `session_event`

이 구조를 통해 자유 운동, 루틴 운동, 학습 모드, 중간 점수 저장, 최종 결과 저장을 모두 유연하게 처리할 수 있습니다.
