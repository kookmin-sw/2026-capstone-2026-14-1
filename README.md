# FitPlus

웹캠 하나로 즐기는 실시간 AI 운동 코칭 플랫폼

FitPlus는 별도의 센서 없이 노트북이나 스마트폰 카메라만으로 사용자의 운동 자세를 실시간으로 분석하고, 피드백과 점수를 제공하는 웹 기반 서비스입니다. 자유 운동부터 나만의 루틴 관리, 히스토리 분석과 퀘스트 시스템까지 운동 생활을 체계적으로 지원합니다.

---

## 목차

1. [주요 기능](#주요-기능)
2. [기술 스택](#기술-스택)
3. [프로젝트 구조](#프로젝트-구조)
4. [시작하기](#시작하기)
5. [카메라 및 개인정보 안내](#카메라-및-개인정보-안내)
6. [주요 화면](#주요-화면)
7. [관련 문서](#관련-문서)
8. [라이선스](#라이선스)

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| **실시간 AI 자세 분석** | MediaPipe Pose를 활용해 브라우저 내에서 관절 포인트를 추적하고, 운동별 자세를 실시간으로 채점합니다. |
| **다양한 운동 지원** | 스쿼트, 푸쉬업, 플랭크 등 맨몸 운동에 대한 상세 가이드와 반복/시간 기반 채점 시스템을 제공합니다. |
| **자유 운동 & 루틴 운동** | 단일 운동을 자유롭게 수행하거나, 여러 운동으로 구성된 루틴을 생성하고 단계별로 실행할 수 있습니다. |
| **히스토리 및 개선 분석** | 과거 운동 세션의 스냅샷 시계열, 정확도 포커스, 개선 포인트를 조회하여 성장을 가시화합니다. |
| **퀘스트 & 티어 시스템** | 일일/주간 퀘스트를 수행하고 포인트를 쌓아 티어를 올리는 게이미피케이션 요소를 제공합니다. |
| **관리자 기능** | 운동 메타데이터, 퀘스트 템플릿, 티어 규칙, 사용자 관리를 위한 관리자 페이지를 포함합니다. |

---

## 기술 스택

### 백엔드
- **Node.js** + **Express**
- **EJS** (Server-side Rendering) + **express-ejs-layouts**
- **JWT** 쿠키 기반 인증

### 프론트엔드
- **Vanilla JavaScript** (비 SPA, 페이지별 스크립트)
- **CSS** (정적 스타일)
- **MediaPipe Pose** (브라우저 내 실시간 포즈 추론)

### 데이터베이스
- **Supabase** (PostgreSQL)

### 기타
- **One Euro Filter** (랜드마크 떨림 감소)
- **Node.js 내장 테스트 러너** (`node --test`)

---

## 프로젝트 구조

```
FitPlus/
├── app.js                      # Express 앱 엔트리
├── config/                     # 설정 및 동기화
│   └── exerciseCatalog.js
├── controllers/                # 요청 처리 컨트롤러
│   ├── admin.js                # 관리자 기능
│   ├── history.js              # 히스토리 조회 및 분석
│   ├── home.js                 # 홈 화면 데이터
│   ├── login.js                # 로그인 처리
│   ├── quest.js                # 퀘스트 부여 및 진행
│   ├── routine.js              # 루틴 CRUD
│   ├── settings.js             # 사용자 설정
│   ├── signup.js               # 회원가입 처리
│   └── workout.js              # 운동 세션 라이프사이클
├── middleware/                 # Express 미들웨어
│   ├── auth.js                 # JWT 인증/인가
│   └── errorHandler.js         # 에러 및 404 처리
├── routes/                     # 라우터 정의
│   ├── main.js                 # 홈, 로그인, 히스토리, 퀘스트, 설정
│   ├── workout.js              # 운동 세션, 루틴
│   └── admin.js                # 관리자 API
├── views/                      # EJS 템플릿
│   ├── layouts/                # 공통 레이아웃
│   ├── admin/                  # 관리자 페이지
│   ├── history/                # 히스토리 페이지
│   ├── quest/                  # 퀘스트 페이지
│   ├── routine/                # 루틴 페이지
│   ├── settings/               # 설정 페이지
│   └── workout/                # 운동 세션 페이지
├── public/                     # 정적 자원
│   └── js/
│       ├── history-page.js     # 히스토리 화면 스크립트
│       └── workout/            # 운동 세션 클라이언트 엔진
│           ├── pose-engine.js
│           ├── rep-counter.js
│           ├── scoring-engine.js
│           ├── session-buffer.js
│           ├── session-controller.js
│           └── exercises/      # 운동별 모듈
│               ├── squat-exercise.js
│               ├── push-up-exercise.js
│               └── plank-exercise.js
├── docs/                       # 프로젝트 문서
│   ├── codebase_explanation.md
│   ├── database_structure.md
│   └── sql/                    # SQL 스크립트
└── tests/                      # 테스트 파일
```

---

## 시작하기

### 사전 요구사항

- Node.js v14 이상
- npm
- Supabase 프로젝트 및 PostgreSQL 데이터베이스

### 설치

```bash
# 저장소 클론
git clone [repository_url]
cd FitPlus

# 의존성 설치
npm install
```

### 환경 변수 설정

프로젝트 루트에 `.env` 파일을 생성하고 다음을 설정합니다.

```env
# Supabase
SUPABASE_URL="your_supabase_url"
SUPABASE_SERVICE_ROLE_KEY="your_supabase_service_role_key"

# JWT
JWT_SECRET="your_jwt_secret_key"
JWT_EXPIRES_IN="1H"

# 서버
PORT=3000
```

### 실행

```bash
node app.js
```

서버 실행 후 브라우저에서 `http://localhost:3000`으로 접속하세요.

### 테스트

```bash
npm test
```

주요 검증 대상은 phase 학습 데이터셋 정규화와 라벨 병합 로직입니다.

---

## 카메라 및 개인정보 안내

FitPlus는 브라우저에서 MediaPipe Pose로 자세를 분석합니다. 카메라 영상 원본은 서버에 저장하지 않으며, 서버에는 운동 세션 결과와 점수 요약, 메트릭 집계, 이벤트 기록만 저장됩니다.

- 카메라 권한은 운동 자세 분석을 위해서만 사용됩니다.
- 자세 추론과 실시간 채점은 사용자의 브라우저에서 수행됩니다.
- 히스토리에는 운동 종류, 세션 시간, 선택한 카메라 자세, 최종 점수, 메트릭 요약, 주요 이벤트가 저장됩니다.
- FitPlus는 운동 보조 서비스이며 의료 진단, 치료, 재활 처방을 대체하지 않습니다.

---

## 주요 화면

| 화면 | 경로 | 설명 |
|------|------|------|
| 홈 | `/` | 오늘/이번 주 운동 요약, 연속 운동 일수, 1년 출석 히트맵, 추천 루틴 및 퀘스트 |
| 자유 운동 | `/workout/free` | 단일 운동 선택 후 실시간 AI 코칭 세션 진입 |
| 루틴 운동 | `/workout/routine/:id` | 루틴 단계별 실행, 세트 완료 및 다음 단계 자동 전환 |
| 운동 결과 | `/workout/result/:sessionId` | 세션 점수, 메트릭 요약, 피드백 확인 |
| 히스토리 | `/history` | 과거 세션 목록, 상세 타임라인, 개선 포커스 분석 |
| 루틴 관리 | `/routine` | 나만의 루틴 생성, 수정, 삭제 (버전 관리) |
| 퀘스트 | `/quest` | 일일/주간 퀘스트 확인 및 보상 수령 |
| 설정 | `/settings` | 닉네임, 비밀번호, 테마 변경 |
| 관리자 | `/admin` | 운동 메타데이터, 퀘스트 템플릿, 티어, 사용자 관리 |

---

## 관련 문서

더 자세한 내용은 `docs/` 폴더 내 문서를 참고하세요.

- [코드베이스 설명서](docs/codebase_explanation.md) — 프로젝트 아키텍처, 주요 모듈, 데이터 흐름
- [데이터베이스 구조](docs/database_structure.md) — 테이블 스키마, 관계, 인덱스 설계
- [운동 정확도 평가표](docs/workout_accuracy_evaluation.md) — 운동별 검증 시나리오, 기대 피드백, 제한사항 기록
- [세션 유실 방지 강화 계획](docs/session_recovery_plan.md) — localStorage 백업 감지, 저장 실패 재시도, 복구 UX 구현 체크포인트

---

## 라이선스

ISC
