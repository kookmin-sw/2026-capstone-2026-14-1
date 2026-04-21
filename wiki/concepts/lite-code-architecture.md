# Lite-Code Architecture (v2 Minimal)

<!-- LITE-CODE:AUTO:START summary -->
<!-- LITE-CODE:AUTO:END summary -->

Lite-Code는 `plan`, `build`, `coder`, `tester`, `fixer`, `reviewer` 역할 분리를 유지하면서, v2에서 다음을 강화한다.

1. 결정적 라우팅 함수(`.opencode/plugins/routing.ts`)
2. 축소 상태기계(`.opencode/state/tickets.json` + `state-machine.ts`)
3. 구조화 패킷/결과(JSON schema)
4. run-log 기반 정량 지표 집계(`.opencode/scripts/metrics.js`)

Curator는 읽기 전용으로 파일/테스트/wiki 참조를 모아 `context-packet`을 제공하고, 구현 판단은 하지 않는다.
