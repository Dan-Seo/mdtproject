import { describe, expect, it } from 'vitest'

import type { CandidateIssue, SectionCandidate } from './types'

describe('SectionCandidate', () => {
  it('carries issue codes instead of free-form sentences', () => {
    // 파서가 완성 문장을 실으면 i18n 레이어를 우회한다 — 유니온이 좁혀 막는다
    const issue: CandidateIssue = '主筋折返し'
    const candidate: SectionCandidate = {
      kind: '柱',
      mark: 'C1',
      raw: {},
      issues: [issue],
    }

    expect(candidate.issues).toEqual(['主筋折返し'])
  })
})
