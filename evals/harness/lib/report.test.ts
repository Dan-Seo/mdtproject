import { describe, expect, test } from 'vitest'

import { formatSummary, summarize, type CaseResult } from './report'

const results: CaseResult[] = [
  { id: 'review-a', track: 'review', pass: true, reason: '위반을 지적함' },
  { id: 'review-b', track: 'review', pass: false, reason: '위반을 놓침' },
  { id: 'qa-c', track: 'qa', pass: true, reason: 'must 충족' },
]

describe('summarize', () => {
  test('통과/실패를 집계하고 실패가 있으면 exitCode 1이다', () => {
    const s = summarize(results)
    expect(s.total).toBe(3)
    expect(s.passed).toBe(2)
    expect(s.failed.map((r) => r.id)).toEqual(['review-b'])
    expect(s.exitCode).toBe(1)
  })

  test('전부 통과면 exitCode 0이다', () => {
    const s = summarize(results.filter((r) => r.pass))
    expect(s.exitCode).toBe(0)
  })

  test('결과가 하나도 없으면 exitCode 1이다 (빈 실행이 초록으로 통과하지 않도록)', () => {
    expect(summarize([]).exitCode).toBe(1)
  })
})

describe('formatSummary', () => {
  test('케이스별 상태와 합계를 담는다', () => {
    const text = formatSummary(results)
    expect(text).toContain('PASS  review/review-a')
    expect(text).toContain('FAIL  review/review-b — 위반을 놓침')
    expect(text).toContain('3 cases: 2 pass, 1 fail')
  })
})
