import type { QaCase, ReviewCase } from './lib/cases'

/**
 * review 트랙 subject의 시스템 프롬프트 — CLAUDE.md CRITICAL 룰 요약.
 * scripts/githooks/pre-commit의 LLM 퀵 패스 프롬프트와 같은 룰 집합이다.
 * 룰이 바뀌면 두 곳을 함께 고칠 것.
 */
export const REVIEWER_SYSTEM = `너는 Kijun 프로젝트의 경량 코드 리뷰어다. 입력으로 받은 코드에서 아래 CRITICAL 룰 위반만 찾아라. 도구 없이 코드만으로 판정하라.

1. [rulepack-literal] 배근 규준 수치(定着·重ね継手·折曲げ·かぶり·할증률 등)를 .ts/.tsx 코드에 리터럴로 쓰면 안 된다 — 전부 src/rulepack/ YAML에서 조회한다. 예외: 단위 변환 상수(1000 등), 기하 계산, 출처가 명기된 테스트 픽스처 기대값
2. [shukin-is-input] 主筋 경·본수와 帯筋/あばら筋 피치는 단면일람에서 받은 입력값이다 — 룰팩에서 조회하는 코드는 위반이다 (ADR-012)
3. [domain-pure] src/domain/ 은 순수 TypeScript다 — react·react-dom·next·three·zustand·exceljs import는 위반이다
4. [no-server-transfer] 사용자 도면 데이터를 서버로 보내는 코드(fetch·XMLHttpRequest·WebSocket·sendBeacon·axios)는 위반이다 — 모든 계산은 브라우저에서 한다
5. [markup-no-default] 할증률 조회가 범위 밖 부재 구분에 기본값을 조용히 반환하면 위반이다 — 실패(throw)시켜야 한다 (ADR-014)

출력 규칙 — 아래 형식 외 다른 텍스트 절대 금지:
- 위반 발견: 줄마다 CRITICAL|룰 슬러그|한 문장 근거
- 위반 없음: OK`

/** qa 트랙 subject의 시스템 프롬프트 — 라이브 CLAUDE.md를 컨텍스트로 넣는다. */
export function qaSystem(claudeMd: string): string {
  return `너는 Kijun 프로젝트의 코드베이스 어시스턴트다. 아래 CLAUDE.md(프로젝트 규약)를 근거로 질문에 답하라. 규약에 근거가 없는 내용은 지어내지 마라.

<claude-md>
${claudeMd}
</claude-md>`
}

export const JUDGE_SYSTEM =
  '너는 엄격한 LLM-as-judge 채점자다. 반드시 {"pass": boolean, "reason": string} 형태의 JSON만 출력하라. reason은 한두 문장의 한국어로 쓴다.'

export function reviewJudgePrompt(c: ReviewCase, reviewerOutput: string): string {
  const label =
    c.expect === 'violation'
      ? `기대: violation
위반 룰: ${c.rule}
기대 발견 내용: ${c.note}`
      : `기대: pass — 이 코드는 위반이 없는 정상 코드다.${c.note ? ` (${c.note})` : ''}`

  return `리뷰어 품질을 채점하라. 아래는 사람이 박제한 정답 라벨과 리뷰어 출력이다.

[정답 라벨]
${label}

[리뷰 대상 코드]
${c.body}

[리뷰어 출력]
${reviewerOutput}

판정 기준:
- 기대가 violation이면: 리뷰어가 위 '기대 발견 내용'에 해당하는 위반을 지적했으면 pass. 같은 위반을 다른 표현이나 다른 룰 슬러그로 지적한 것도 pass다. 해당 위반을 지적하지 못했거나 OK로 판정했으면 fail.
- 기대가 pass면: 리뷰어가 위반 없음(OK)으로 판정했으면 pass. 위반을 지적했으면 오탐이므로 fail.
reason에는 판정 근거를 한두 문장으로 적어라.`
}

export function qaJudgePrompt(c: QaCase, answer: string): string {
  const mustNot =
    c.mustNot.length > 0 ? c.mustNot.map((m) => `- ${m}`).join('\n') : '(없음)'

  return `응답자 품질을 채점하라. 아래는 질문, 사람이 박제한 채점 기준, 응답자 답변이다.

[질문]
${c.body}

[must — 답변에 반드시 담겨야 할 사실]
${c.must.map((m) => `- ${m}`).join('\n')}

[must_not — 답변이 주장하면 안 되는 내용]
${mustNot}

[응답자 답변]
${answer}

판정 기준: 모든 must 사실이 표현이 달라도 실질적으로 담겨 있고, must_not 내용을 주장하지 않으면 pass. 하나라도 어긋나면 fail. reason에는 어느 항목이 어긋났는지 적어라.`
}
