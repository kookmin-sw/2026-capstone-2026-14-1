# 운동 음성 피드백 및 분석 확장 구현 계획

> **상태:** 구현 완료 (5/6 태스크), 브라우저 수동 검증만 남음
> **브랜치:** `feature/voice-feedback`
> **커밋:** 5개, 테스트 118/118 통과

## 목표

브라우저 기반 한국어 음성 피드백을 운동 세션에 추가한다. 추후 API TTS로의 교체를 위한 provider 인터페이스와, 추후 LLM 분석을 위한 구조화된 피드백 이벤트를 함께 제공한다.

## 아키텍처

`session-voice.js` 모듈이 음성 provider 동작(중복 제거, 쿨다운, 사용자 활성화)을 소유한다. 라이브 피드백은 `session-controller.js`에서 구조화된 피드백 이벤트로 라우팅되고, 각 이벤트는 `session-ui.js`, `session-voice.js`, `SessionBuffer`로 전달된다. `controllers/workout.js`에서 안전한 이벤트 페이로드만 DB에 저장한다.

**음성 발화 정책 (구현 최종):** 오직 `LOW_SCORE_HINT`(자세 교정 필요) 이벤트만 TTS로 발화한다. `REP_COMPLETE_FEEDBACK`, `QUALITY_GATE_WITHHOLD`는 시각 피드백만 제공하고 음성은 출력하지 않는다.

**기술 스택:** Vanilla JS, Web Speech API, Node.js `node:test`, CommonJS/브라우저 글로벌 듀얼 export, Express.

---

## 구현 완료 태스크

### Task 1: Voice Provider 모듈 ✓

**생성 파일:**
- `public/js/workout/session-voice.js`
- `test/workout/session-voice.test.js` (7 tests)

**내용:**
- `createBrowserSpeechProvider()` — Web Speech API 래퍼, `ko-KR` 발화, 지원 감지
- `createSessionVoice()` — 중복 억제(6초 윈도우), 쿨다운(2.5초), 비활성화 모드, localStorage 영속화
- `window.createSessionVoice` / `window.createBrowserSpeechProvider` 글로벌 노출
- CommonJS `module.exports` → Node 테스트 지원

**커밋:** `bff2bde feat(workout): add voice feedback provider`

---

### Task 2: Structured SessionBuffer 이벤트 ✓

**수정 파일:**
- `public/js/workout/session-buffer.js` — `addEvent(type, payload)`, `recordEvent(event)` 확장
- `test/session-buffer.test.js` — 2개 신규 테스트 추가

**내용:**
- `addEvent(type, payload)` — payload가 있으면 이벤트에 포함, 기존 `addEvent(type)` 호환 유지
- `recordEvent(event)` — timestamp가 없으면 상대시간 자동 추가 후 저장
- `export().events`로 구조화된 피드백 이벤트 보존

**커밋:** `80e3e25 feat(workout): preserve structured session events`

---

### Task 3: 서버 이벤트 페이로드 저장 ✓

**수정/생성 파일:**
- `controllers/workout.js` — 안전한 페이로드 allowlist 헬퍼 추가, `normalizeEvents()`에 payload 포함
- `test/workout/session-event-payload.test.js` — 2개 테스트

**내용:**
- `buildSafeEventPayload()` — 허용 필드만 통과 (message, exercise_code, metric_key, score 등)
- `toEventText()` — 최대 500자 제한
- `normalizeEventDelivery()` — 시각/음성 bool만 허용
- `__test.normalizeEvents` export로 집중 테스트 가능
- 개인정보/랜드마크/디바이스 식별자 등 민감 데이터 차단

**커밋:** `4c9eead feat(workout): persist safe session event payloads`

---

### Task 4: 음성 토글 UI ✓

**수정 파일:**
- `public/js/workout/session-ui.js` — `updateVoiceFeedbackToggle({ enabled, supported })` 추가
- `test/workout/session-ui.test.js` — 토글 상태 테스트 추가
- `views/workout/session.ejs` — `session-voice.js` 스크립트 로드 + 음성 토글 UI 추가

**내용:**
- 켜짐/꺼짐/미지원 3가지 상태 반영
- setup 패널에 `viewSelect`와 `plankTargetSelect` 사이에 토글 버튼 배치
- 힌트 텍스트: "운동 중 주요 피드백을 음성으로 안내합니다."

**커밋:** `f74a139 feat(workout): add voice feedback toggle UI`

---

### Task 5: 컨트롤러 음성 로딩 및 피드백 라우팅 ✓

**수정/생성 파일:**
- `public/js/workout/session-controller.js` — 주요 변경
- `test/workout/session-controller-voice.test.js` — 정적 라우팅 테스트 (4 tests)
- `test/workout/session-controller-seam.test.js` — `session-voice.js` 로드 순서 추가

**내용:**
- `loadSessionVoiceFactory()` — CommonJS 우선, 브라우저 글로벌 fallback
- `createFeedbackEvent()` — 타입, 메트릭, repRecord, severity 등 구조화
- `deliverFeedbackEvent()` — 시각+음성 통합 전달, SessionBuffer 기록
- `shouldSpeakFeedbackEvent()` — **오직 `LOW_SCORE_HINT`만 true 반환**
- `setupVoiceFeedbackToggle()` — 토글 클릭 시 enable/disable 전환
- 품질 게이트 보류 → `QUALITY_GATE_WITHHOLD` 이벤트 (음성 없음, alert만)
- 낮은 점수 피드백 → `LOW_SCORE_HINT` 이벤트 (음성 + alert)
- rep 완료 피드백 → `REP_COMPLETE_FEEDBACK` 이벤트 (toast만, 음성 없음)

**커밋:** `c11be51 feat(workout): route session feedback to voice events`

---

### Task 6: 엔드투엔드 검증

- [x] 구문 검사 (`node --check`) — 모든 파일 통과
- [x] 집중 테스트 — 24/24 통과
- [x] 전체 테스트 (`npm test`) — **118/118 통과**
- [ ] 브라우저 수동 검증 (미실시)

---

## 피드백 라우팅 요약

| 이벤트 타입 | 발생 조건 | 시각 피드백 | 음성 피드백 |
|---|---|---|---|
| `LOW_SCORE_HINT` | 메트릭 점수 60 미만 | alert "자세 교정 필요" | **TTS 발화** |
| `REP_COMPLETE_FEEDBACK` | rep 완료 시 | toast "N회 좋아요!" | 없음 |
| `QUALITY_GATE_WITHHOLD` | 사람/자세 감지 실패 | alert "자세 인식 대기" | 없음 |

## 위험 사항

- 브라우저 TTS 품질은 OS/브라우저에 따라 다름. `ko-KR` 발화를 보장하나 자연스러운 한국어 음성을 모든 기기에서 보장하지는 않음
- `speechSynthesis.speak()`를 `session-controller.js`에서 직접 호출하지 말 것 — 반드시 `voice.speak()`를 통해야 함
- 이벤트 페이로드에 raw video, raw landmarks, 브라우저/디바이스 식별자를 포함하지 말 것
- `controllers/workout.js`는 allowlist에 명시된 필드만 저장함

## 파일 구조

```
신규:
  public/js/workout/session-voice.js
  test/workout/session-voice.test.js
  test/workout/session-event-payload.test.js
  test/workout/session-controller-voice.test.js

수정:
  public/js/workout/session-buffer.js
  test/session-buffer.test.js
  controllers/workout.js
  public/js/workout/session-ui.js
  test/workout/session-ui.test.js
  views/workout/session.ejs
  public/js/workout/session-controller.js
  test/workout/session-controller-seam.test.js
```
