import { describe, expect, test } from 'vitest'

import { parseCaseFile, validateCaseSet, type EvalCase } from './cases'

const reviewViolationRaw = `---
id: review-sample
track: review
expect: violation
rule: rulepack-literal
note: 定着長さ 계수가 .ts에 리터럴로 하드코딩됨
---
\`\`\`ts
export function anchorageLength(d: number): number {
  return 35 * d
}
\`\`\`
`

const reviewPassRaw = `---
id: review-clean
track: review
expect: pass
note: 룰팩 조회만 있음
---
\`\`\`ts
export function f(pack: RulePack): number {
  return lookupRule(pack, 'anchorage.L2', {}).value
}
\`\`\`
`

const qaRaw = `---
id: qa-sample
track: qa
must:
  - 실패(throw)해야 한다
must_not:
  - 기본값 4%를 반환한다
---
범위 밖 부재 구분이 들어오면 어떻게 되나요?
`

const qaGuardRaw = `---
id: qa-guard
track: qa
guard: false-premise
must:
  - 壁는 범위 밖이다
must_not:
  - 壁 모듈이 존재하는 것처럼 안내한다
---
壁 물량 모듈이 어디 있나요?
`

describe('parseCaseFile', () => {
  test('review violation 케이스를 파싱한다', () => {
    const c = parseCaseFile(reviewViolationRaw, 'review-sample.md')
    expect(c).toMatchObject({
      id: 'review-sample',
      track: 'review',
      expect: 'violation',
      rule: 'rulepack-literal',
    })
    expect(c.body).toContain('35 * d')
  })

  test('review pass 케이스는 rule 없이 파싱된다', () => {
    const c = parseCaseFile(reviewPassRaw, 'review-clean.md')
    expect(c).toMatchObject({ track: 'review', expect: 'pass', rule: null })
  })

  test('qa 케이스의 must/must_not/guard를 파싱한다', () => {
    const c = parseCaseFile(qaGuardRaw, 'qa-guard.md')
    expect(c).toMatchObject({
      track: 'qa',
      guard: 'false-premise',
      must: ['壁는 범위 밖이다'],
      mustNot: ['壁 모듈이 존재하는 것처럼 안내한다'],
    })
  })

  test('CRLF 줄바꿈도 파싱한다', () => {
    const c = parseCaseFile(qaRaw.replace(/\n/g, '\r\n'), 'qa-sample.md')
    expect(c.id).toBe('qa-sample')
  })

  test('frontmatter가 없으면 파일명을 포함해 실패한다', () => {
    expect(() => parseCaseFile('본문뿐', 'broken.md')).toThrow(/broken\.md/)
  })

  test('알 수 없는 track이면 실패한다', () => {
    const raw = qaRaw.replace('track: qa', 'track: lint')
    expect(() => parseCaseFile(raw, 'x.md')).toThrow(/track/)
  })

  test('violation인데 rule이나 note가 없으면 실패한다', () => {
    const raw = reviewViolationRaw.replace('rule: rulepack-literal\n', '')
    expect(() => parseCaseFile(raw, 'x.md')).toThrow(/rule/)
  })

  test('review인데 expect가 없으면 실패한다', () => {
    const raw = reviewViolationRaw.replace('expect: violation\n', '')
    expect(() => parseCaseFile(raw, 'x.md')).toThrow(/expect/)
  })

  test('qa인데 must가 비어 있으면 실패한다', () => {
    const raw = `---\nid: q\ntrack: qa\nmust: []\n---\n질문`
    expect(() => parseCaseFile(raw, 'x.md')).toThrow(/must/)
  })

  test('본문이 비어 있으면 실패한다', () => {
    const raw = `---\nid: q\ntrack: qa\nmust:\n  - 사실\n---\n`
    expect(() => parseCaseFile(raw, 'x.md')).toThrow(/본문/)
  })
})

describe('validateCaseSet', () => {
  const ok: EvalCase[] = [
    parseCaseFile(reviewViolationRaw, 'a.md'),
    parseCaseFile(reviewPassRaw, 'b.md'),
    parseCaseFile(qaRaw, 'c.md'),
    parseCaseFile(qaGuardRaw, 'd.md'),
  ]

  test('균형 잡힌 세트는 문제가 없다', () => {
    expect(validateCaseSet(ok)).toEqual([])
  })

  test('id가 중복되면 잡는다', () => {
    const dup = [...ok, parseCaseFile(qaRaw, 'c2.md')]
    expect(validateCaseSet(dup).join()).toMatch(/qa-sample/)
  })

  test('review에 pass 케이스(오탐 가드)가 없으면 잡는다', () => {
    const noPass = ok.filter(
      (c) => !(c.track === 'review' && c.expect === 'pass'),
    )
    expect(validateCaseSet(noPass).join()).toMatch(/pass/)
  })

  test('review에 violation 케이스가 없으면 잡는다', () => {
    const noViolation = ok.filter(
      (c) => !(c.track === 'review' && c.expect === 'violation'),
    )
    expect(validateCaseSet(noViolation).join()).toMatch(/violation/)
  })

  test('qa에 false-premise 가드가 없으면 잡는다', () => {
    const noGuard = ok.filter(
      (c) => !(c.track === 'qa' && c.guard === 'false-premise'),
    )
    expect(validateCaseSet(noGuard).join()).toMatch(/false-premise/)
  })

  test('한 트랙이 통째로 비어 있으면 잡는다', () => {
    const reviewOnly = ok.filter((c) => c.track === 'review')
    expect(validateCaseSet(reviewOnly).length).toBeGreaterThan(0)
  })
})
