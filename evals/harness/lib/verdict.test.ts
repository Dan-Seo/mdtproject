import { describe, expect, test } from 'vitest'

import { parseVerdict } from './verdict'

describe('parseVerdict', () => {
  test('순수 JSON을 파싱한다', () => {
    expect(parseVerdict('{"pass": true, "reason": "모든 must 충족"}')).toEqual({
      pass: true,
      reason: '모든 must 충족',
    })
  })

  test('코드 펜스로 감싼 JSON도 파싱한다', () => {
    const text = '```json\n{"pass": false, "reason": "오탐"}\n```'
    expect(parseVerdict(text)).toEqual({ pass: false, reason: '오탐' })
  })

  test('앞뒤 공백을 무시한다', () => {
    expect(parseVerdict('  \n{"pass": true, "reason": "ok"}\n')).toEqual({
      pass: true,
      reason: 'ok',
    })
  })

  test('JSON이 아니면 실패한다', () => {
    expect(() => parseVerdict('PASS입니다')).toThrow(/JSON/)
  })

  test('pass가 boolean이 아니면 실패한다', () => {
    expect(() => parseVerdict('{"pass": "yes", "reason": "x"}')).toThrow(
      /pass/,
    )
  })

  test('reason이 없으면 실패한다', () => {
    expect(() => parseVerdict('{"pass": true}')).toThrow(/reason/)
  })
})
