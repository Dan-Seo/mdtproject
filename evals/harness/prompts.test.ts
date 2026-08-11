import { describe, expect, test } from 'vitest'

import type { QaCase, ReviewCase } from './lib/cases'
import {
  JUDGE_SYSTEM,
  REVIEWER_SYSTEM,
  qaJudgePrompt,
  qaSystem,
  reviewJudgePrompt,
} from './prompts'

const violation: ReviewCase = {
  id: 'r1',
  track: 'review',
  expect: 'violation',
  rule: 'rulepack-literal',
  note: '35가 하드코딩됨',
  body: 'CODE-BODY',
}

const clean: ReviewCase = {
  id: 'r2',
  track: 'review',
  expect: 'pass',
  rule: null,
  note: null,
  body: 'CLEAN-BODY',
}

const qa: QaCase = {
  id: 'q1',
  track: 'qa',
  must: ['사실A', '사실B'],
  mustNot: ['금지C'],
  guard: null,
  body: '질문-BODY',
}

describe('REVIEWER_SYSTEM', () => {
  test('CLAUDE.md CRITICAL 룰 5개를 요약한다', () => {
    for (const anchor of ['定着', '主筋', 'src/domain', '서버', '할증률']) {
      expect(REVIEWER_SYSTEM).toContain(anchor)
    }
  })

  test('출력 계약(CRITICAL|…, OK)을 명시한다', () => {
    expect(REVIEWER_SYSTEM).toContain('CRITICAL|')
    expect(REVIEWER_SYSTEM).toContain('OK')
  })
})

describe('qaSystem', () => {
  test('전달받은 라이브 CLAUDE.md를 그대로 포함한다', () => {
    expect(qaSystem('# CLAUDE-MD-MARKER')).toContain('# CLAUDE-MD-MARKER')
  })
})

describe('JUDGE_SYSTEM', () => {
  test('JSON 출력 계약을 명시한다', () => {
    expect(JUDGE_SYSTEM).toContain('"pass"')
    expect(JUDGE_SYSTEM).toContain('"reason"')
  })
})

describe('reviewJudgePrompt', () => {
  test('violation 케이스는 라벨·기대 발견 내용·코드·리뷰어 출력을 담는다', () => {
    const p = reviewJudgePrompt(violation, 'REVIEWER-OUT')
    expect(p).toContain('rulepack-literal')
    expect(p).toContain('35가 하드코딩됨')
    expect(p).toContain('CODE-BODY')
    expect(p).toContain('REVIEWER-OUT')
  })

  test('pass 케이스는 오탐 채점 기준을 담는다', () => {
    const p = reviewJudgePrompt(clean, 'OK')
    expect(p).toContain('오탐')
    expect(p).toContain('CLEAN-BODY')
  })
})

describe('qaJudgePrompt', () => {
  test('질문·must·must_not·답변을 전부 담는다', () => {
    const p = qaJudgePrompt(qa, 'ANSWER-OUT')
    expect(p).toContain('질문-BODY')
    expect(p).toContain('사실A')
    expect(p).toContain('사실B')
    expect(p).toContain('금지C')
    expect(p).toContain('ANSWER-OUT')
  })
})
