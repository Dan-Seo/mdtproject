# evals/harness — 하네스 품질 eval

Kijun의 **비즈니스 로직이 아니라 "하네스"의 품질**을 재는 회귀 게이트다.
여기서 하네스란 LLM 리뷰 자동화(pre-commit 퀵 패스·CI 리뷰)와 CLAUDE.md 컨텍스트가
실제로 작동하는지를 뜻한다. 도메인 수치 검증은 `tests/golden/`이 담당하고, 이 eval은
"리뷰어가 룰 위반을 잡는가", "CLAUDE.md만 주면 규약 질문에 옳게 답하는가"를 잰다.

## 구조

```
evals/harness/
  cases/            # golden set — frontmatter 라벨 + 본문 입력
    review/         # 위반 4 + 정상 1 (오탐 방지 가드)
    qa/             # 규약 질문 4 (틀린 전제 반박 가드 1 포함)
  lib/              # 순수 함수 — 파서(cases)·judge 출력 검증(verdict)·집계(report)
  prompts.ts        # subject/judge 프롬프트 (순수)
  run.ts            # 라이브 러너 — 유일하게 네트워크·비용이 드는 진입점
```

## 두 트랙

| 트랙 | subject | 채점 |
|---|---|---|
| **review** | 경량 리뷰어 — `claude-sonnet-4-6`·temp 0, CLAUDE.md CRITICAL 룰 요약을 시스템 프롬프트로 | judge(`claude-opus-5`)가 사람 라벨(`expect: violation/pass`, `rule`, `note`)과 리뷰어 출력을 대조 |
| **qa** | 응답자 — 같은 모델, **라이브 `CLAUDE.md`**를 시스템 컨텍스트로 | judge가 `must`(반드시 담길 사실)/`must_not`(주장하면 안 되는 내용)으로 사실 채점 |

- subject 모델이 `claude-sonnet-4-6`인 이유: temp 0 고정이 요구인데 Sonnet 5는
  sampling 파라미터를 400으로 거부한다. 모델을 올리려면 `temperature`를 함께 제거할 것.
- judge는 subject와 **다른 모델**(Opus 5)이고, 구조화 출력(json_schema)으로
  `{"pass", "reason"}`을 강제하며, 안전 분류기 오탐이 게이트를 흔들지 않게 서버측
  refusal 폴백(`fallbacks: "default"`)을 켠다.
- review 트랙의 리뷰어 시스템 프롬프트는 `scripts/githooks/pre-commit`의 LLM 퀵 패스와
  같은 룰 집합이다. **룰이 바뀌면 두 곳을 함께 고칠 것** (`prompts.ts` 주석 참조).

## 실행

```sh
npm test        # 키·네트워크 없이: 파서/집계 단위 테스트 + golden set 무결성·균형 검증
npm run eval    # 라이브 회귀 게이트 — API 호출(비용) 발생, 하나라도 실패하면 exit 1
```

- `npm test`가 지키는 무결성/균형: 라벨 스키마(트랙별 필수 필드), id 중복 금지,
  review에 violation·pass(오탐 가드) 각 1개 이상, qa에 false-premise 가드 1개 이상.
- `npm run eval`은 **fail-closed**다: 실행 오류(네트워크·refusal·판정 파싱 실패)도
  실패로 계상하고, 케이스가 0개면 빈 실행이 초록으로 통과하지 않도록 exit 1이다.
  (pre-commit 퀵 패스의 fail-open과 반대 — 게이트는 의심스러우면 빨간불이어야 한다.)
- 인증: `ANTHROPIC_API_KEY` — 저장소 루트의 `.env`(gitignore 대상)에 넣으면 자동
  로드되고(`--env-file-if-exists`), 환경변수로 직접 줘도 된다(CI는 이 방식).

## 원칙

1. **golden set은 작게 시작한다.** 케이스 수를 불리는 것보다 케이스 하나하나가
   "하네스가 실제로 틀렸던/틀릴 뻔한 지점"을 박제하는 것이 중요하다. 하네스가
   실수를 하면, 그 실수를 케이스로 먼저 박제하고 나서 고친다.
2. **라벨은 사람이 박제한다.** `expect`·`rule`·`note`·`must`·`must_not`은 사람이
   판단해 적는 정답이다. LLM이 생성하거나 수정하지 않는다 — 추출자가 승인자를
   겸하면 독립 검토가 아니다 (R6과 같은 원리).
3. **판정 로직과 실행을 분리한다.** 파서·검증·집계는 순수 함수(`lib/`)로 두고
   vitest가 키 없이 지킨다. 네트워크·비용은 `run.ts` 한 곳에만 있다.
