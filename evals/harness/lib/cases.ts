import { load } from 'js-yaml'

export type ReviewCase = {
  id: string
  track: 'review'
  /** 사람이 박제한 정답 라벨 */
  expect: 'violation' | 'pass'
  /** 위반한 룰의 슬러그 (violation일 때 필수) */
  rule: string | null
  /** 기대 발견 내용 — judge가 채점 기준으로 쓴다 */
  note: string | null
  body: string
}

export type QaCase = {
  id: string
  track: 'qa'
  /** 답변에 반드시 담겨야 할 사실 */
  must: string[]
  /** 답변이 주장하면 안 되는 내용 */
  mustNot: string[]
  /** 틀린 전제 반박 가드 표시 */
  guard: 'false-premise' | null
  body: string
}

export type EvalCase = ReviewCase | QaCase

function fail(source: string, message: string): never {
  throw new Error(`${source}: ${message}`)
}

function asStringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  if (!value.every((v) => typeof v === 'string' && v.trim() !== '')) return null
  return value
}

/** frontmatter(YAML) + 본문으로 이루어진 케이스 파일 하나를 파싱한다. 순수 함수 — I/O 없음. */
export function parseCaseFile(raw: string, source: string): EvalCase {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) fail(source, 'frontmatter(---)가 없다')

  const meta = load(match[1]) as Record<string, unknown>
  const body = match[2].trim()

  if (typeof meta?.id !== 'string' || meta.id.trim() === '')
    fail(source, 'id가 없다')
  if (body === '') fail(source, '본문이 비어 있다')

  const id = meta.id
  const track = meta.track

  if (track === 'review') {
    const expected = meta.expect
    if (expected !== 'violation' && expected !== 'pass')
      fail(source, `expect는 violation 또는 pass여야 한다 (현재: ${expected})`)
    if (expected === 'violation') {
      if (typeof meta.rule !== 'string' || meta.rule.trim() === '')
        fail(source, 'violation 케이스에는 rule이 필요하다')
      if (typeof meta.note !== 'string' || meta.note.trim() === '')
        fail(source, 'violation 케이스에는 note(기대 발견 내용)가 필요하다')
    }
    return {
      id,
      track: 'review',
      expect: expected,
      rule: typeof meta.rule === 'string' ? meta.rule : null,
      note: typeof meta.note === 'string' ? meta.note : null,
      body,
    }
  }

  if (track === 'qa') {
    const must = asStringList(meta.must)
    if (!must || must.length === 0)
      fail(source, 'qa 케이스에는 비어 있지 않은 must 목록이 필요하다')
    const mustNot = meta.must_not === undefined ? [] : asStringList(meta.must_not)
    if (!mustNot) fail(source, 'must_not은 문자열 목록이어야 한다')
    if (meta.guard !== undefined && meta.guard !== 'false-premise')
      fail(source, `guard는 false-premise만 허용한다 (현재: ${meta.guard})`)
    return {
      id,
      track: 'qa',
      must,
      mustNot,
      guard: meta.guard === 'false-premise' ? 'false-premise' : null,
      body,
    }
  }

  fail(source, `track은 review 또는 qa여야 한다 (현재: ${track})`)
}

/**
 * golden set 전체의 무결성/균형을 검사한다. 문제 목록을 돌려주며, 빈 배열이면 통과.
 * - id 중복 금지
 * - review: violation ≥ 1, pass(오탐 방지 가드) ≥ 1
 * - qa: 케이스 ≥ 1, false-premise(틀린 전제 반박) 가드 ≥ 1
 */
export function validateCaseSet(cases: EvalCase[]): string[] {
  const problems: string[] = []

  const seen = new Set<string>()
  for (const c of cases) {
    if (seen.has(c.id)) problems.push(`id 중복: ${c.id}`)
    seen.add(c.id)
  }

  const review = cases.filter((c): c is ReviewCase => c.track === 'review')
  const qa = cases.filter((c): c is QaCase => c.track === 'qa')

  if (review.length === 0) problems.push('review 트랙 케이스가 없다')
  else {
    if (!review.some((c) => c.expect === 'violation'))
      problems.push('review 트랙에 violation 케이스가 없다')
    if (!review.some((c) => c.expect === 'pass'))
      problems.push('review 트랙에 pass 케이스(오탐 방지 가드)가 없다')
  }

  if (qa.length === 0) problems.push('qa 트랙 케이스가 없다')
  else if (!qa.some((c) => c.guard === 'false-premise'))
    problems.push('qa 트랙에 false-premise 가드 케이스가 없다')

  return problems
}
