import { describe, expect, it } from 'vitest'
import { lapLength, markupRate } from './smoke'

describe('스모크 테스트용 임시 파일 — /review-code PR 모드 검증 후 폐기', () => {
  it('lapLength: D13에 대해 40d를 반환한다', () => {
    expect(lapLength(13)).toBe(520)
  })
  it('markupRate: 躯体는 4%를 반환한다', () => {
    expect(markupRate('躯体')).toBe(0.04)
  })
})
