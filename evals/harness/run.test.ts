// run.ts의 순수 부분(요청 빌더·텍스트 추출)만 검증한다 — 네트워크 호출 없음.
import { describe, expect, test } from 'vitest'

import { REVIEWER_SYSTEM } from './prompts'
import {
  JUDGE_MODEL,
  SUBJECT_MODEL,
  VERDICT_SCHEMA,
  extractText,
  judgeRequest,
  qaRequest,
  reviewerRequest,
} from './run'

describe('reviewerRequest', () => {
  const req = reviewerRequest('코드')

  test('경량 리뷰어는 Sonnet·temp0으로 고정된다', () => {
    expect(req.model).toBe(SUBJECT_MODEL)
    expect(req.temperature).toBe(0)
  })

  test('시스템 프롬프트는 CRITICAL 룰 요약이다', () => {
    expect(req.system).toBe(REVIEWER_SYSTEM)
  })
})

describe('qaRequest', () => {
  test('라이브 CLAUDE.md가 시스템 컨텍스트에 들어간다', () => {
    const req = qaRequest('질문', '# CLAUDE-MD-MARKER')
    expect(req.system).toContain('# CLAUDE-MD-MARKER')
    expect(req.temperature).toBe(0)
  })
})

describe('judgeRequest', () => {
  const req = judgeRequest('채점 프롬프트')

  test('judge는 subject와 다른 모델(Opus)이다', () => {
    expect(req.model).toBe(JUDGE_MODEL)
    expect(JUDGE_MODEL).not.toBe(SUBJECT_MODEL)
  })

  test('구조화 출력 스키마가 pass/reason을 강제한다', () => {
    expect(VERDICT_SCHEMA.required).toEqual(['pass', 'reason'])
    expect(VERDICT_SCHEMA.additionalProperties).toBe(false)
    expect(req.output_config.format.schema).toBe(VERDICT_SCHEMA)
  })

  test('refusal 폴백이 켜져 있다', () => {
    expect(req.fallbacks).toBe('default')
    expect(req.betas).toContain('server-side-fallback-2026-07-01')
  })
})

describe('extractText', () => {
  test('text 블록만 순서대로 이어붙인다', () => {
    const blocks = [
      { type: 'thinking' },
      { type: 'text', text: 'A' },
      { type: 'tool_use' },
      { type: 'text', text: 'B' },
    ]
    expect(extractText(blocks)).toBe('AB')
  })
})
