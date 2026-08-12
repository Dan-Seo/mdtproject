// run.ts의 순수 부분(요청 빌더·텍스트 추출)만 검증한다 — 네트워크 호출 없음.
import { describe, expect, test } from 'vitest'

import type { EvalCase } from './lib/cases'
import { REVIEWER_SYSTEM } from './prompts'
import {
  JUDGE_MODEL,
  SUBJECT_MODEL,
  VERDICT_SCHEMA,
  extractText,
  judgeRequest,
  qaRequest,
  reviewerRequest,
  selectTrack,
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

describe('selectTrack', () => {
  // 캐스팅하지 않는다 — track 리터럴이 바뀌면 여기서 컴파일 에러가 나야 한다.
  const cases = [
    { id: 'q', track: 'qa' },
    { id: 'r', track: 'review' },
  ] satisfies { id: string; track: EvalCase['track'] }[]

  test('미지정이면 전부 돌린다 — 로컬 npm run eval의 기존 동작', () => {
    expect(selectTrack(cases, undefined).map((c) => c.id)).toEqual(['q', 'r'])
    expect(selectTrack(cases, 'all').map((c) => c.id)).toEqual(['q', 'r'])
  })

  test('트랙을 지정하면 그 트랙만 남는다 — 과금 대상이 절반이 된다', () => {
    expect(selectTrack(cases, 'qa').map((c) => c.id)).toEqual(['q'])
    expect(selectTrack(cases, 'review').map((c) => c.id)).toEqual(['r'])
  })

  // 오타난 트랙을 조용히 전부로 되돌리면, 4케이스를 돌린 줄 알고 9케이스를 과금한다.
  test('알 수 없는 트랙은 전부로 되돌리지 않고 실패한다', () => {
    expect(() => selectTrack(cases, 'golden')).toThrow(/golden/)
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
