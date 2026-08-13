import { describe, expect, it } from 'vitest'

import ja from '@/locales/ja.json'
import ko from '@/locales/ko.json'

import {
  CANDIDATE_ISSUES,
  LIST_ISSUES,
  type CandidateIssue,
  type SectionCandidate,
} from './types'

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

  it('has a ja·ko message for every issue code', () => {
    // 코드만 있고 키가 없으면 사용자에게 「主筋折返し」 같은 코드가 그대로 보인다
    const missing = CANDIDATE_ISSUES.flatMap((issue) => {
      const key = `sectionImport.issue.${issue}`
      return [
        ...(key in ja ? [] : [`ja:${key}`]),
        ...(key in ko ? [] : [`ko:${key}`]),
      ]
    })

    expect(missing).toEqual([])
  })

  it('has a ja·ko message for every list-level issue code', () => {
    const missing = LIST_ISSUES.flatMap((issue) => {
      const key = `sectionImport.listIssue.${issue}`
      return [
        ...(key in ja ? [] : [`ja:${key}`]),
        ...(key in ko ? [] : [`ko:${key}`]),
      ]
    })

    expect(missing).toEqual([])
  })
})
