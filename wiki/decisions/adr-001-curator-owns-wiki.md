# ADR-001: Wiki 조회는 Curator 하위 기능으로 둔다

## 상태
Accepted

## 결정
Wiki 조회와 후보 선별은 Curator가 담당하고, coder/tester/fixer에는 wiki 본문을 대량 주입하지 않는다.

## 근거
- 메인 세션 컨텍스트 오염 방지
- 중복 탐색/토큰 낭비 감소
- 장기 지식(Wiki)과 실행 지식(Working Memory) 분리 유지

## 결과
- Curator 출력에 `wiki_refs`를 포함한다.
- Wiki 도입 초기에는 `concepts/`, `decisions/`, `playbooks/`만 운영한다.
- `wiki/modules/` 파일 미러링은 보류한다.
