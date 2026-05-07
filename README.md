# FitPlus

**웹캠 기반 실시간 AI 운동 코칭 웹 애플리케이션**

FitPlus는 별도 센서 없이 브라우저 카메라만으로 사용자의 운동 자세를 분석하고, 반복 횟수·운동 시간·자세 품질·피드백을 제공하는 웹 서비스입니다. 브라우저에서 MediaPipe Pose로 포즈를 추론하고, 서버는 인증·화면 렌더링·운동 기록·루틴·퀘스트·히스토리 분석을 담당합니다.

---

## 목차

- [주요 기능](#주요-기능)
- [지원 운동](#지원-운동)
- [기술 스택](#기술-스택)
- [아키텍처 개요](#아키텍처-개요)
- [프로젝트 구조](#프로젝트-구조)
- [시작하기](#시작하기)
- [환경 변수](#환경-변수)
- [주요 라우트](#주요-라우트)
- [테스트](#테스트)
- [카메라 및 데이터 처리 안내](#카메라-및-데이터-처리-안내)
- [문서](#문서)
- [개발 메모](#개발-메모)
- [라이선스](#라이선스)

---

## 주요 기능

| 기능 | 설명 |
|---|---|
| 실시간 자세 분석 | MediaPipe Pose를 사용해 브라우저에서 관절 landmark를 추적하고 운동 자세를 분석합니다. |
| 운동별 채점 로직 | 스쿼트, 푸쉬업, 플랭크별 rep/time 판정, 품질 게이트, 자세 점수, 피드백을 분리된 운동 모듈에서 처리합니다. |
| 자유 운동 | 단일 운동을 선택해 즉시 실시간 코칭 세션을 시작할 수 있습니다. |
| 운동 배우기 | 운동별 단계형 가이드와 코칭 흐름을 제공합니다. |
| 루틴 운동 | 여러 운동을 묶어 루틴을 만들고 단계별로 실행할 수 있습니다. |
| 세션 결과 저장 | 운동 세트, 점수, 메트릭 요약, 세션 이벤트를 서버에 저장합니다. |
| 히스토리 분석 | 과거 운동 기록, 세션 상세, 루틴 기록, 통계, 개선 포인트를 조회합니다. |
| AI 성장 리포트 | 운동 기록 기반으로 개선점·약점·다음 목표를 요약하는 코치 리포트를 제공합니다. |
| 퀘스트/티어 | 일일·주간 퀘스트, 보상 수령, 티어 규칙 기반 성장 요소를 제공합니다. |
| 관리자 페이지 | 운동 메타데이터, 퀘스트 템플릿, 티어, 사용자 상태를 관리합니다. |
| 음성 코칭 | OpenRouter TTS API를 통해 운동 중 음성 피드백을 제공할 수 있습니다. |

---

## 지원 운동

| 운동 | 코드 | 기본 방식 | 지원 시점 |
|---|---|---|---|
| 스쿼트 | `SQUAT` | 반복 기반 | `FRONT`, `SIDE`, `DIAGONAL` |
| 푸쉬업 | `PUSH_UP` | 반복 기반 | `SIDE` |
| 플랭크 | `PLANK` | 시간 기반 | `SIDE` |

운동 정의는 `public/js/workout/exercises/*-exercise.js`의 `EXERCISE_MANIFEST`를 기준으로 서버 시작 시 Supabase의 운동 카탈로그와 동기화됩니다.

---

## 기술 스택

### Backend

- Node.js
- Express 5
- EJS + express-ejs-layouts
- cookie-parser
- JWT 기반 쿠키 인증
- Supabase JavaScript Client
- Argon2 비밀번호 해싱

### Frontend

- EJS server-side rendering
- Vanilla JavaScript
- CSS
- MediaPipe Pose
- One Euro Filter 기반 landmark smoothing

### Data / AI

- Supabase PostgreSQL
- OpenRouter API
  - TTS 음성 생성
  - AI 성장 리포트용 LLM 호출

### Test

- Node.js 내장 테스트 러너
- 실행 명령: `npm test`

---

## 아키텍처 개요

```text
Browser
  ├─ Camera / MediaPipe Pose
  ├─ PoseEngine
  ├─ RepCounter
  ├─ ScoringEngine
  ├─ Exercise Modules
  └─ SessionController
        │
        │ HTTP / JSON
        ▼
Express Server
  ├─ Routes
  ├─ Controllers
  ├─ Auth Middleware
  ├─ Workout Session APIs
  ├─ History / Quest / Routine APIs
  └─ AI Growth Report / TTS APIs
        │
        ▼
Supabase PostgreSQL
```

### 클라이언트 운동 런타임

운동 중 실시간 처리는 대부분 브라우저에서 수행됩니다.

| 파일 | 역할 |
|---|---|
| `public/js/workout/session-controller.js` | 운동 세션 전체 흐름 제어 |
| `public/js/workout/session-camera.js` | 카메라 스트림과 canvas overlay 관리 |
| `public/js/workout/pose-engine.js` | MediaPipe landmark 기반 관절각·품질·보조 metric 계산 |
| `public/js/workout/quality-gate-session.js` | 세션 중 품질 게이트 입력값 관리 |
| `public/js/workout/rep-counter.js` | rep/time 상태 전이와 운동 phase 추적 |
| `public/js/workout/scoring-engine.js` | live metric 점수화와 feedback breakdown 생성 |
| `public/js/workout/session-buffer.js` | 세션 데이터 버퍼링 및 저장 안정화 |
| `public/js/workout/session-ui.js` | 운동 UI 상태 업데이트 |
| `public/js/workout/session-voice.js` | 음성 피드백 재생 |
| `public/js/workout/exercises/*.js` | 운동별 규칙, phase, rep score, feedback 처리 |

### 서버 역할

서버는 실시간 pose inference를 직접 수행하지 않습니다. 대신 다음을 담당합니다.

- EJS 페이지 렌더링
- 로그인/회원가입/JWT 인증
- 운동·루틴·퀘스트·히스토리 API
- 운동 세션 시작/종료/중단/세트 저장/이벤트 저장
- Supabase 기반 데이터 저장 및 조회
- AI 성장 리포트 생성
- TTS API proxy
- 관리자 기능

---

## 프로젝트 구조

```text
.
├── app.js                         # Express 앱 엔트리
├── package.json                   # npm scripts 및 의존성
├── config/
│   ├── db.js                      # Supabase client 설정
│   └── exerciseCatalog.js         # 운동 manifest 탐색 및 DB 동기화
├── controllers/                   # 라우트별 요청 처리
│   ├── admin.js
│   ├── history.js
│   ├── home.js
│   ├── login.js
│   ├── quest.js
│   ├── routine.js
│   ├── settings.js
│   ├── signup.js
│   ├── tts.js
│   └── workout.js
├── middleware/
│   ├── auth.js                    # JWT 인증, 게스트/사용자/관리자 guard
│   └── errorHandler.js            # 404 및 전역 에러 처리
├── routes/
│   ├── main.js                    # 홈, 인증, 퀘스트, 히스토리, 설정, AI 리포트
│   ├── workout.js                 # 자유 운동, 배우기, 루틴 운동, 세션 API
│   ├── admin.js                   # 관리자 화면/API
│   └── tts.js                     # TTS 모델/생성 API
├── backend/analysis/              # AI 성장 리포트 및 히스토리 분석 도메인
│   ├── controller/
│   ├── service/
│   ├── repository/
│   ├── llm-coach/
│   ├── history-trend/
│   ├── metric-guides/
│   └── coaching-skills/
├── public/
│   ├── css/                       # 정적 스타일
│   ├── images/                    # 이미지 리소스
│   └── js/
│       ├── history-page.js
│       └── workout/               # 브라우저 운동 런타임
├── views/                         # EJS 템플릿
│   ├── layouts/
│   ├── admin/
│   ├── history/
│   ├── learn/
│   ├── quest/
│   ├── routine/
│   ├── settings/
│   └── workout/
├── test/                          # Node test runner 기반 테스트
└── docs/                          # 설계 문서, spec, 검증 문서, DB 문서
```

---

## 시작하기

### 1. 요구 사항

- Node.js 18 이상 권장
  - 서버 코드에서 `fetch` 기반 외부 API 호출을 사용합니다.
- npm
- Supabase 프로젝트
- 카메라 사용이 가능한 브라우저

### 2. 의존성 설치

```bash
npm install
```

### 3. 환경 변수 설정

프로젝트 루트에 `.env` 파일을 생성한 뒤, 아래 [환경 변수](#환경-변수) 섹션을 참고해 값을 채웁니다.

### 4. 서버 실행

```bash
npm start
```

또는:

```bash
node app.js
```

기본 포트는 `3000`입니다.

```text
http://localhost:3000
```

---

## 환경 변수

### 필수

| 변수 | 설명 |
|---|---|
| `SUPABASE_URL` | Supabase 프로젝트 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `JWT_SECRET` | JWT 서명에 사용할 secret |
| `JWT_EXPIRES_IN` | JWT 만료 시간. 예: `1h`, `7d` |
| `PORT` | Express 서버 포트. 미설정 시 `3000` |

예시:

```env
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
JWT_SECRET="replace-with-a-long-random-secret"
JWT_EXPIRES_IN="7d"
PORT=3000
```

### 선택

| 변수 | 설명 |
|---|---|
| `BODY_LIMIT` | Express JSON/urlencoded body limit. 미설정 시 `5mb` |
| `OPENROUTER_API_KEY` | TTS 및 AI 코치 리포트 기능에 사용할 OpenRouter API key |
| `OPENROUTER_LLM_MODEL` | AI 성장 리포트용 LLM 모델. 미설정 시 기본 모델 사용 |

예시:

```env
BODY_LIMIT="5mb"
OPENROUTER_API_KEY="your-openrouter-api-key"
OPENROUTER_LLM_MODEL="openai/gpt-4o-mini"
```

---

## 주요 라우트

### 사용자 화면

| 경로 | 설명 |
|---|---|
| `/` | 홈 대시보드 |
| `/login` | 로그인 |
| `/signup` | 회원가입 |
| `/quest` | 퀘스트 |
| `/history` | 운동 히스토리 |
| `/settings` | 사용자 설정 |
| `/routine` | 루틴 목록 |
| `/routine/new` | 새 루틴 생성 |
| `/routine/:routineId/edit` | 루틴 수정 |
| `/workout/free` | 자유 운동 선택 |
| `/workout/free/:exerciseCode` | 자유 운동 세션 |
| `/learn` | 운동 배우기 목록 |
| `/learn/:exerciseCode` | 운동 배우기 세션 |
| `/workout/routine/:routineId` | 루틴 운동 세션 |
| `/workout/result/:sessionId` | 운동 결과 |

### API

| 경로 | 설명 |
|---|---|
| `GET /api/exercises` | 운동 목록 조회 |
| `POST /api/workout/session` | 운동 세션 시작 |
| `PUT /api/workout/session/:sessionId/end` | 운동 세션 종료 |
| `POST /api/workout/session/:sessionId/abort` | 운동 세션 중단 |
| `POST /api/workout/session/:sessionId/set` | 운동 세트 기록 |
| `POST /api/workout/session/:sessionId/event` | 운동 세션 이벤트 기록 |
| `GET /api/history/stats` | 히스토리 통계 조회 |
| `GET /api/history/:sessionId` | 세션 상세 조회 |
| `DELETE /api/history/:sessionId` | 세션 삭제 |
| `GET /api/users/me/coach-report` | AI 성장 리포트 조회 |
| `POST /api/users/me/coach-report/rebuild` | AI 성장 리포트 재생성 |
| `GET /api/tts/models` | TTS 모델 목록 조회 |
| `POST /api/tts` | TTS 음성 생성 |

### 관리자

| 경로 | 설명 |
|---|---|
| `/admin` | 관리자 대시보드 |
| `/admin/exercises` | 운동 관리 |
| `/admin/users` | 사용자 관리 |
| `/admin/quests` | 퀘스트 템플릿 및 부여 규칙 관리 |
| `/admin/tiers` | 티어 규칙 관리 |

관리자 페이지는 관리자 권한이 있는 계정만 접근할 수 있습니다.

---

## 테스트

전체 테스트 실행:

```bash
npm test
```

특정 테스트 파일 실행 예시:

```bash
node --test test/workout/squat-form-alignment.test.js
node --test test/workout/quality-gate.test.js
node --test test/analysis/history-trend/history-trend-analyzer.test.js
```

현재 테스트는 크게 아래 영역을 검증합니다.

- 운동 runtime
  - quality gate
  - rep counter
  - scoring engine
  - session controller
  - session buffer
  - exercise rule separation
  - squat scoring robustness
- 루틴 세션 흐름
- 히스토리 metric series
- AI 성장 리포트
  - LLM prompt/client
  - output validator
  - fallback report
  - trend analyzer
  - weakness/improvement/regression detector
- TTS controller

---

## 카메라 및 데이터 처리 안내

FitPlus의 자세 추론과 실시간 채점은 브라우저에서 수행됩니다.

- 카메라 영상 원본은 서버에 저장하지 않습니다.
- MediaPipe Pose inference는 클라이언트에서 실행됩니다.
- 서버에는 운동 결과, 세트 요약, metric summary, session event, 히스토리 분석용 데이터가 저장됩니다.
- 카메라 권한은 운동 자세 분석과 화면 overlay 표시를 위해 사용됩니다.
- FitPlus는 운동 보조 서비스이며 의료 진단, 치료, 재활 처방을 대체하지 않습니다.

---

## 문서

| 문서 | 설명 |
|---|---|
| `docs/codebase_explanation.md` | 코드베이스 구조와 주요 흐름 설명 |
| `docs/database_structure.md` | Supabase/PostgreSQL 테이블 구조 설명 |
| `docs/workout_accuracy_evaluation.md` | 운동 정확도 검증 시나리오 |
| `docs/specs/` | 기능별 설계 spec |
| `docs/plans/` | 구현 계획 및 phase별 작업 문서 |
| `docs/validation/` | 검증 기록 |

최근 스쿼트 채점 관련 주요 spec:

- `docs/specs/2026-05-07-squat-scoring-robustness-spec.md`
- `docs/specs/2026-05-07-squat-side-live-scoring-stability-spec.md`

---

## 개발 메모

### 운동 모듈 추가 흐름

1. `public/js/workout/exercises/`에 `*-exercise.js` 파일을 추가합니다.
2. 파일 상단에 `EXERCISE_MANIFEST`를 작성합니다.
3. 운동별 rep/time 추적, scoring, feedback 로직을 모듈 내부에 구현합니다.
4. `WorkoutExerciseRegistry.register()`로 운동 모듈을 등록합니다.
5. 서버 시작 시 `config/exerciseCatalog.js`가 manifest를 읽어 운동 카탈로그와 동기화합니다.
6. 필요한 경우 workout 관련 테스트를 `test/workout/`에 추가합니다.

### 작업 시 주의 사항

- 운동별 특화 규칙은 각 exercise module에 둡니다.
- 공통 scoring/gating 로직은 `scoring-engine.js`, `quality-gate-session.js`에 둡니다.
- pose-derived input을 바꾸면 runtime과 테스트를 함께 갱신합니다.
- 카메라 각도와 landmark confidence가 낮은 경우에는 잘못된 점수보다 HOLD/안내가 우선입니다.

---

## 라이선스

ISC
