# 운동 중 음성 피드백과 히스토리 LLM 분석 확장 스펙

## 1. 문서 정보

- 작성일: 2026-04-26
- 상태: Draft
- 대상 프로젝트: FitPlus 웹캠 기반 운동 코칭 서비스
- 문서 목적: 현재 운동 중 화면 피드백을 브라우저 내장 TTS로 읽어주고, 이후 API TTS와 히스토리 기반 LLM 분석으로 확장 가능한 구조를 정의한다.
- 문서 범위: 프론트 세션 런타임, 피드백 이벤트 계약, TTS provider 인터페이스, 세션 이벤트 저장 확장, 향후 LLM 분석 입력 연결

## 2. 배경

현재 운동 세션은 브라우저에서 포즈를 분석하고, 점수와 피드백을 즉시 화면에 표시한다.

핵심 흐름은 아래와 같다.

```text
pose-engine.js
  -> session-controller.js handlePoseDetected()
    -> quality gate
    -> scoringEngine.calculate()
    -> getLiveFeedbackResult()
    -> updateScoreDisplay()
    -> checkFeedback()
    -> showRepFeedback()
    -> sessionBuffer
```

현재 피드백이 생성되고 소비되는 주요 위치는 아래다.

- `public/js/workout/session-controller.js`
  - `handlePoseDetected()`: 포즈 결과, 품질 게이트, 채점, 화면 업데이트를 오케스트레이션한다.
  - `checkFeedback()`: 낮은 점수 메트릭을 골라 `LOW_SCORE_HINT` 성격의 자세 교정 알림을 띄운다.
  - `showRepFeedback()`: rep 완료 후 토스트 피드백을 표시한다.
- `public/js/workout/session-ui.js`
  - `showAlert()`: 자세 교정/품질 게이트 알림을 화면에 표시한다.
  - `showToast()`: rep 완료 피드백을 토스트로 표시한다.
- `public/js/workout/session-buffer.js`
  - `addScore()`: 점수 타임라인과 메트릭 집계를 누적한다.
  - `addRep()`: rep 결과를 누적한다.
  - `addEvent()`: 현재는 `type`과 `timestamp` 중심의 이벤트만 저장한다.
  - `recordEvent()`: 구조화 이벤트를 저장할 수 있지만, 현재 주요 세션 피드백 호출부에서는 적극적으로 쓰이지 않는다.
- `controllers/workout.js`
  - `normalizeEvents()`: 현재 서버 저장 시 이벤트 `type`과 `event_time`만 정규화하고, 상세 payload는 저장하지 않는다.

현재 화면 피드백 문구는 사용자에게 즉시 도움이 되지만, 음성 피드백이나 히스토리 분석 입력으로 재사용하기에는 구조가 부족하다.

## 3. 문제 정의

현재 구조에서 바로 `speechSynthesis.speak()`를 여러 위치에 직접 호출하면 아래 문제가 생긴다.

1. 브라우저 내장 TTS에서 API TTS로 교체할 때 호출부를 여러 곳 수정해야 한다.
2. 같은 문구가 프레임 단위로 반복 발화될 수 있다.
3. 사용자가 음성 피드백을 끄거나 켤 수 있는 제어점이 없다.
4. 어떤 피드백이 실제 사용자에게 전달되었는지 히스토리에 남기기 어렵다.
5. 향후 LLM 분석에서 "반복된 자세 문제"를 읽어야 할 때, 피드백 문구와 메트릭 정보가 구조화되어 있지 않다.
6. 현재 `session_event` DB에는 `payload` 컬럼이 있으나, 종료 저장 경로는 payload를 보존하지 않는다.

## 4. 목표

### 4.1 1차 목표

- 운동 중 생성되는 주요 피드백을 표준 피드백 이벤트로 만든다.
- 표준 피드백 이벤트를 화면 표시, 브라우저 내장 TTS, 세션 기록에 재사용한다.
- 브라우저 내장 TTS를 기본 provider로 사용한다.
- TTS 미지원 환경에서는 화면 피드백만 유지하고 조용히 비활성화한다.
- 같은 문장 반복 발화를 막고, 발화 간격을 제어한다.
- 사용자가 운동 세션에서 음성 피드백을 켜고 끌 수 있게 한다.

### 4.2 확장 목표

- `session-voice.js` 내부 provider만 바꿔 API TTS로 전환할 수 있게 한다.
- 피드백 이벤트를 `session_event.payload` 또는 별도 분석 feature 생성 경로에서 재사용할 수 있게 한다.
- 히스토리 기반 LLM 분석이 반복 피드백, 문제 메트릭, rep 번호, 점수, 품질 게이트 상태를 읽을 수 있게 한다.

## 5. 비목표

이번 설계의 1차 구현에서 제외한다.

- 실시간 LLM 자세 판정
- 음성 파일 캐싱 테이블 도입
- raw video 또는 raw landmark를 LLM에 전달
- 모든 세션 이벤트의 DB 스키마 전면 재설계
- 운동별 피드백 문구 자체의 대규모 리라이트

## 6. 설계 원칙

1. `session-controller.js`는 음성 합성 구현을 알지 않는다.
2. 화면 피드백, 음성 피드백, 기록 피드백은 같은 표준 이벤트를 공유한다.
3. 1차 구현은 브라우저 내장 TTS로 충분히 작게 시작한다.
4. API TTS 전환은 provider 교체로 처리한다.
5. LLM 분석에는 raw pose가 아니라 세션 결과, 메트릭 집계, 구조화 피드백 이벤트만 전달한다.
6. 사용자가 운동 중 불편함을 느끼지 않도록 발화 빈도 제한을 기본값으로 둔다.
7. 기존 rule-based scoring과 quality gate 권한 구조를 변경하지 않는다.

## 7. 권장 아키텍처

```text
session-controller.js
  -> createFeedbackEvent()
  -> deliverFeedbackEvent()
       -> session-ui.js
       -> session-voice.js
       -> session-buffer.js

session-voice.js
  -> browserSpeechProvider
  -> future apiSpeechProvider

session-buffer.js
  -> feedback events
  -> export()
  -> controllers/workout.js
  -> session_event
  -> future session_analysis feature builder
```

### 7.1 신규 모듈

#### `public/js/workout/session-voice.js`

음성 출력 전용 모듈이다.

역할:

- 브라우저 내장 TTS 지원 여부 확인
- 발화 큐 관리
- 중복 문장 억제
- 최소 발화 간격 적용
- 음소거 상태 관리
- 향후 API TTS provider와 같은 인터페이스 유지

공개 인터페이스:

```js
createSessionVoice({
  provider,
  enabled,
  minIntervalMs,
  duplicateWindowMs,
  defaultLang,
  defaultRate,
});
```

반환 객체:

```js
{
  speak(message, context),
  setEnabled(enabled),
  isEnabled(),
  cancel(),
  isSupported()
}
```

### 7.2 기본 provider

1차 provider는 브라우저 내장 Web Speech API를 사용한다.

```js
window.speechSynthesis
window.SpeechSynthesisUtterance
```

provider 인터페이스:

```js
{
  name: 'browser-speech',
  isSupported(),
  speak({ message, lang, rate, context }),
  cancel()
}
```

### 7.3 API TTS provider (구현 완료)

`createApiSpeechProvider` (in `public/js/workout/session-voice.js`)는 OpenRouter `/api/v1/audio/speech`를 서버 프록시(`POST /api/tts`)로 호출하여 mp3를 재생한다.

```js
{
  name: 'api-speech',
  isSupported(),
  speak({ message }) {
    this.cancel();
    fetch('/api/tts', { body: JSON.stringify({message, model, voice}) })
      .then(r => r.blob())
      .then(blob => { audio.src = URL.createObjectURL(blob); audio.play(); });
    return { spoken: true };
  },
  cancel()
}
```

provider 선택은 `session-controller.js`의 `readTtsConfig()`가 localStorage `fitplus_tts_config`를 읽어 결정한다.
browser / openrouter 선택과 모델/보이스는 `/settings` 페이지에서 설정한다.

설정 정책:
- 서버 엔드포인트: `POST /api/tts` → OpenRouter `/audio/speech`
- API 키: `.env`의 `OPENROUTER_API_KEY`
- 모델 목록: `GET /api/models?output_modalities=speech` (8개 TTS 모델)
- 네트워크 실패 fallback: 조용히 실패 (session에러 없음)

## 8. 표준 피드백 이벤트 계약

운동 중 피드백은 아래 shape로 표준화한다.

```js
{
  type: 'LOW_SCORE_HINT',
  timestamp: 12345,
  message: '무릎이 안쪽으로 무너지지 않도록 바깥쪽 힘으로 밀어주세요',
  exercise_code: 'squat',
  metric_key: 'knee_valgus',
  metric_name: '무릎 정렬',
  score: 42,
  max_score: 100,
  normalized_score: 42,
  rep_number: 3,
  set_number: 1,
  severity: 'warning',
  source: 'live_feedback',
  delivery: {
    visual: true,
    voice: true
  }
}
```

### 8.1 필수 필드

- `type`: 이벤트 종류
- `timestamp`: 세션 시작 기준 상대 ms
- `message`: 사용자에게 보여주거나 읽어줄 문장
- `exercise_code`: 운동 코드
- `severity`: `info`, `success`, `warning`, `critical`
- `source`: 이벤트 생성 경로
- `delivery`: 화면/음성 전달 여부

### 8.2 선택 필드

- `metric_key`
- `metric_name`
- `score`
- `max_score`
- `normalized_score`
- `rep_number`
- `set_number`
- `withhold_reason`
- `selected_view`
- `quality_level`

### 8.3 이벤트 타입

| 타입 | 생성 위치 | 용도 |
|---|---|---|
| `LOW_SCORE_HINT` | `checkFeedback()` | 실시간 자세 교정 |
| `REP_COMPLETE_FEEDBACK` | `showRepFeedback()` | rep 완료 후 짧은 코칭 |
| `QUALITY_GATE_WITHHOLD` | `handlePoseDetected()` gate suppress branch | 카메라/자세 인식 대기 안내 |
| `NO_PERSON` | `handleNoPerson()` | 사람 미감지 안내 |
| `ROUTINE_STEP_CHANGE` | 루틴 단계 전환 | 다음 운동 안내 |
| `REST_START` | 휴식 시작 | 휴식 안내 |
| `REST_END` | 휴식 종료 | 운동 재개 안내 |

## 9. 세션 런타임 연결 설계

### 9.1 `checkFeedback()` 변경 방향

현재:

```js
showAlert('자세 교정 필요', lowScoreItem.feedback);
sessionBuffer.addEvent('LOW_SCORE_HINT', { ... });
```

변경:

```js
const event = createFeedbackEvent({
  type: 'LOW_SCORE_HINT',
  message: lowScoreItem.feedback,
  metric: lowScoreItem,
  severity: 'warning',
  source: 'live_feedback'
});

deliverFeedbackEvent(event);
```

`deliverFeedbackEvent()`는 아래를 수행한다.

- `ui.showAlert('자세 교정 필요', event.message)` — 항상
- `shouldSpeakFeedbackEvent(event)` 일 때만 `voice.speak(event.message, event)`
- `sessionBuffer.recordEvent(event)`

구현된 발화 정책: `shouldSpeakFeedbackEvent()`는 `LOW_SCORE_HINT`만 true 반환.
`REP_COMPLETE_FEEDBACK`과 `QUALITY_GATE_WITHHOLD`는 시각 피드백 전용.

### 9.2 `showRepFeedback()` 변경 방향

현재:

```js
ui.showToast(`${repRecord.repNumber}회 ${msg}`);
```

변경:

```js
const event = createFeedbackEvent({
  type: 'REP_COMPLETE_FEEDBACK',
  message: `${repRecord.repNumber}회 ${msg}`,
  repRecord,
  severity: repRecord.score >= 80 ? 'success' : 'info',
  source: 'rep_complete'
});

deliverFeedbackEvent(event);
```

### 9.3 품질 게이트 안내

`QUALITY_GATE_WITHHOLD`는 너무 자주 발생할 수 있다.

발화 정책:

- 같은 `withhold_reason`은 6초 내 재발화하지 않는다.
- `out_of_frame`, `view_mismatch`, `no_person` 같은 사용자가 바로 조정해야 하는 메시지만 음성 대상에 포함한다.
- 단순 tracking confidence 흔들림은 화면에는 표시하되 음성은 제한한다.

## 10. 발화 정책

### 10.1 기본값

- 기본 언어: `ko-KR`
- 기본 속도: `1.0`
- 최소 발화 간격: 2500ms
- 같은 문장 재발화 금지 시간: 6000ms
- 발화 큐 길이: 1
- 새 critical 안내가 들어오면 이전 발화를 취소하고 새 안내를 우선한다.

### 10.2 이벤트별 정책

| 이벤트 | 음성 기본값 | 정책 |
|---|---|---|
| `LOW_SCORE_HINT` | 켜짐 | 중복 억제 강하게 적용 |
| `REP_COMPLETE_FEEDBACK` | 켜짐 | 짧은 문장만 발화 |
| `QUALITY_GATE_WITHHOLD` | 부분 켜짐 | 이유 변화 또는 긴 간격일 때만 발화 |
| `NO_PERSON` | 켜짐 | 6초 이상 지속될 때 발화 |
| `REST_START` | 켜짐 | 1회 발화 |
| `REST_END` | 켜짐 | 1회 발화 |
| `ROUTINE_STEP_CHANGE` | 켜짐 | 1회 발화 |

### 10.3 문장 길이

운동 중 발화 문장은 짧아야 한다.

- 권장: 25자 이하
- 허용: 45자 이하
- 초과 시 `session-voice.js`가 축약 문구를 우선 사용할 수 있다.

예:

- 화면 문구: `무릎이 안쪽으로 무너지지 않도록 바깥쪽 힘으로 밀어주세요`
- 음성 문구: `무릎을 바깥쪽으로 밀어주세요`

## 11. UI 제어

세션 준비 영역에 음성 피드백 토글을 추가한다.

권장 위치:

- `views/workout/session.ejs`
- 입력 소스/채점 자세 설정 근처

기본 동작:

- 버튼 문구: `음성 피드백`
- 상태: `켜짐` / `꺼짐`
- 기본값: 켜짐
- 저장: 1차는 `localStorage`
- 브라우저 미지원 시: 비활성 상태와 짧은 안내 표시

브라우저는 사용자 상호작용 이후 TTS가 안정적으로 동작하므로, 실제 음성 초기화는 `운동 시작` 클릭 이후에 수행한다.

## 12. 세션 이벤트 저장 확장

### 12.1 현재 한계

현재 `SessionBuffer.addEvent(type)`는 두 번째 인자를 받지 않는다.

하지만 `session-controller.js`에서는 아래처럼 payload를 넘기는 호출이 존재한다.

```js
sessionBuffer.addEvent('LOW_SCORE_HINT', {
  metric_key: lowScoreItem.key,
  feedback: lowScoreItem.feedback
});
```

이 payload는 현재 `SessionBuffer.addEvent()`에서 보존되지 않는다.

또한 서버의 `normalizeEvents()`는 이벤트 저장 시 `session_id`, `type`, `event_time`만 반환한다. `session_event.payload` 컬럼은 문서와 DB 구조에 존재하지만 현재 종료 저장 경로에서는 사용하지 않는다.

### 12.2 변경 방향

1차 구현에서는 `SessionBuffer.recordEvent(event)`를 표준 피드백 이벤트 저장에 사용한다.

서버 저장 경로는 다음 중 하나를 선택한다.

#### 옵션 A: `session_event.payload` 저장

`controllers/workout.js normalizeEvents()`가 안전한 payload subset을 보존한다.

장점:

- 기존 DB 구조를 활용한다.
- 히스토리 LLM 분석에서 세션 이벤트를 바로 읽을 수 있다.

주의:

- payload 크기 제한이 필요하다.
- 사용자에게 보여준 문구와 점수/메트릭만 저장해야 한다.

#### 옵션 B: 분석 feature 생성 시 브라우저 export의 `events`만 사용

종료 API에서 받은 payload로 `session_analysis.feature_json`을 만들고, `session_event`에는 type/time만 유지한다.

장점:

- DB 이벤트 테이블 변경이 작다.

단점:

- 분석 재생성이나 디버깅 시 원본 이벤트 상세가 부족하다.

권장: 옵션 A. 이미 `session_event.payload` 컬럼이 있으므로, 안전한 subset을 저장하는 편이 LLM 분석 확장에 유리하다.

## 13. 히스토리 LLM 분석 확장

기존 `docs/specs/2026-04-15_history_llm_session_analysis_spec.md`는 `session_analysis`를 별도 분석층으로 정의한다. 이번 피드백 이벤트 설계는 그 분석층의 feature 입력을 보강한다.

### 13.1 LLM 입력에 포함할 수 있는 데이터

- 세션 요약
  - 운동 코드
  - 운동 이름
  - 모드
  - 선택 뷰
  - 총 rep 또는 유지 시간
  - 최종 점수
- 메트릭 집계
  - `session_snapshot_metric.metric_key`
  - 평균 점수
  - raw value 범위
  - sample count
- rep 결과
  - rep 번호
  - rep 점수
  - rep feedback
- 피드백 이벤트
  - 반복된 `LOW_SCORE_HINT`
  - `QUALITY_GATE_WITHHOLD` 이유
  - `NO_PERSON` 빈도
  - 사용자가 실제로 음성으로 들은 메시지 여부

### 13.2 LLM 입력에 넣지 않을 데이터

- raw video
- raw pose landmark 전체
- 브라우저/기기 식별에 가까운 민감 정보
- 과도하게 긴 프레임별 원본 배열
- 음성 합성용 API 응답 원문

### 13.3 분석 예시

피드백 이벤트가 구조화되면 히스토리 분석은 아래처럼 만들 수 있다.

```text
최근 스쿼트 세션에서 무릎 정렬 피드백이 7회 반복되었습니다.
깊이 점수는 안정적이지만, 하강 구간에서 무릎이 안쪽으로 모이는 경향이 있습니다.
다음 세션에서는 발끝 방향과 무릎 방향을 맞추는 데 집중하세요.
```

### 13.4 feature builder 방향

향후 `session_analysis.feature_json` 생성 시 아래 요약을 만든다.

```js
{
  repeated_feedback: [
    {
      metric_key: 'knee_valgus',
      message: '무릎을 바깥쪽으로 밀어주세요',
      count: 7,
      worst_score: 38,
      average_score: 51,
      first_seen_ms: 12000,
      last_seen_ms: 86000
    }
  ],
  delivery_summary: {
    voice_enabled: true,
    voice_spoken_count: 9,
    visual_shown_count: 12
  },
  quality_gate_summary: {
    out_of_frame_count: 2,
    view_mismatch_count: 0,
    no_person_count: 1
  }
}
```

## 14. 파일별 변경 범위 (실제 구현)

### 14.1 신규

- `public/js/workout/session-voice.js`
  - TTS provider abstraction (`createBrowserSpeechProvider`, `createApiSpeechProvider`, `createSessionVoice`)
  - queue/cooldown/dedup policy
- `controllers/tts.js`
  - `GET /api/tts/models` → OpenRouter `?output_modalities=speech`
  - `POST /api/tts` → OpenRouter `/audio/speech` mp3 프록시
- `routes/tts.js`
  - `/api/tts/models`, `/api/tts` 라우트
- `test/tts-controller.test.js`
- `test/workout/session-voice.test.js`
- `test/workout/session-controller-voice.test.js`
- `test/workout/session-event-payload.test.js`

### 14.2 변경

- `views/workout/session.ejs`
  - `session-voice.js` script 추가
  - 음성 피드백 토글 UI 추가
- `public/js/workout/session-controller.js`
  - `readTtsConfig()` — localStorage `fitplus_tts_config`
  - `createTtsProvider()` — browser / openrouter 선택
  - `createFeedbackEvent()`, `deliverFeedbackEvent()`, `shouldSpeakFeedbackEvent()`
  - `checkFeedback()`, `showRepFeedback()`, 품질 게이트 연결
- `public/js/workout/session-ui.js`
  - 음성 토글 버튼 핸들러
- `public/js/workout/session-buffer.js`
  - `addEvent(type, payload)` 하위 호환 확장
  - `recordEvent(event)` 표준 이벤트 저장
- `controllers/workout.js`
  - `normalizeEvents()` → `buildSafeEventPayload()` allowlist 기반 payload 보존
- `app.js`
  - `/api/tts` 라우트 등록
- `views/settings/index.ejs`
  - TTS 설정 카드 (provider: browser/openrouter, 모델, 보이스, 테스트 버튼)
  - localStorage 기반 설정 저장
- `test/session-buffer.test.js`
  - 구조화 피드백 이벤트 export 보존 테스트
- `test/workout/session-controller-seam.test.js`
  - session-controller 정적 라우팅 테스트 확장
- `test/workout/session-ui.test.js`
  - 토글 UI 테스트

## 15. 테스트 전략

### 15.1 단위 테스트

`session-voice.js`

- Web Speech API 미지원이면 `isSupported()`가 false를 반환한다.
- disabled 상태에서는 `speak()`가 provider를 호출하지 않는다.
- 같은 문장은 `duplicateWindowMs` 안에서 재발화하지 않는다.
- `critical` 이벤트는 이전 발화를 취소하고 우선 발화한다.

`session-buffer.js`

- 구조화 feedback event가 `export().events`에 보존된다.
- 기존 `addEvent(type)` 호출은 계속 동작한다.

`controllers/workout.js`

- `normalizeEvents()`가 type/time을 유지한다.
- 허용된 payload key만 저장한다.
- 긴 message는 제한 길이로 잘린다.

### 15.2 브라우저 수동 검증

- 운동 시작 전 음성 피드백 토글이 보인다.
- 토글을 끄면 화면 피드백만 표시된다.
- 토글을 켜면 낮은 점수 피드백이 한국어로 발화된다.
- 같은 자세 오류가 계속되어도 음성이 과도하게 반복되지 않는다.
- rep 완료 시 짧은 피드백이 한 번만 발화된다.
- TTS 미지원 브라우저에서도 세션 진행이 막히지 않는다.

## 16. 단계별 구현 계획 초안

### 16.1 1단계: 브라우저 내장 TTS 기반

- `session-voice.js` 추가
- `views/workout/session.ejs` script 추가
- `session-controller.js`에서 voice 인스턴스 생성
- `checkFeedback()`와 `showRepFeedback()`에 표준 이벤트 전달 적용
- 음성 토글 상태를 `localStorage`에 저장
- 관련 단위 테스트 추가

### 16.2 2단계: 이벤트 payload 저장

- `SessionBuffer.recordEvent()` 사용 경로 정리
- `addEvent(type, payload)` 하위 호환 확장 적용
- `controllers/workout.js normalizeEvents()` payload 저장 추가
- DB 저장 확인

### 16.3 3단계: LLM 분석 feature 연동

- `session_analysis.feature_json` 생성 경로에서 feedback event 요약 추가
- 반복 피드백, 품질 게이트, 음성 전달 횟수 집계
- deterministic fallback 분석 문구에 반복 피드백 요약 반영
- 이후 LLM prompt 입력에 feature summary 포함

### 16.4 4단계: API TTS provider 전환 (완료)

- `createApiSpeechProvider` 추가 (in `session-voice.js`)
- `controllers/tts.js` + `routes/tts.js` 서버 엔드포인트
- OpenRouter `/audio/speech` 프록시 (모델 목록: `?output_modalities=speech`)
- `/settings` 페이지에서 provider/mode/voice 선택 → localStorage 저장
- `session-controller.js`가 localStorage 읽어 provider 전환
- API TTS 실패 시 조용히 실패 (session 중단 없음)

## 17. 수용 기준

1차 구현 완료 기준:

- 운동 세션 화면에서 음성 피드백을 켜고 끌 수 있다.
- 브라우저 내장 TTS 지원 환경에서 자세 교정 문구가 한국어로 발화된다.
- rep 완료 피드백이 음성으로 한 번 발화된다.
- 같은 피드백이 짧은 시간에 반복 발화되지 않는다.
- TTS 미지원 환경에서도 기존 화면 피드백과 운동 진행은 유지된다.
- `session-controller.js`는 provider 구현을 직접 알지 않는다.
- 표준 피드백 이벤트가 `SessionBuffer.export().events`에 남는다.
- 향후 API TTS provider를 추가해도 `checkFeedback()`와 `showRepFeedback()`의 호출 방식은 유지된다.

## 18. 결정 사항 (실제 구현 기준)

- 1차 TTS는 브라우저 내장 Web Speech API를 사용한다. (완료)
- 4단계 API TTS는 OpenRouter `/audio/speech`로 구현. (완료)
- provider abstraction을 먼저 둬서 API TTS 전환 비용을 낮췄다.
- 운동 중 피드백은 표준 이벤트로 만들고, 화면 표시와 음성 발화와 기록이 같은 이벤트를 공유한다.
- 음성 피드백은 `LOW_SCORE_HINT`만 발화. 나머지는 화면 전용.
- 향후 LLM 분석은 세션 결과, 메트릭 집계, 구조화 피드백 이벤트를 입력으로 사용한다.

## 19. 최종 구현 개요

- 음성 피드백 기본값은 켜짐. `localStorage`에 저장하고 이후 세션에서 유지.
- `session_event.payload` 저장 포함. 단, 저장 payload는 buildSafeEventPayload() allowlist 기반의 subset으로 제한.
- API TTS는 OpenRouter. 모델, 보이스는 `/settings`에서 선택.
- 설정 저장은 localStorage (`fitplus_tts_config`). DB 수정 없음.
- `session-controller.js`는 `shouldSpeakFeedbackEvent()`로 발화 대상을 필터링. (`LOW_SCORE_HINT`만)
