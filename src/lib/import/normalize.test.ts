import { describe, expect, it } from 'vitest'

import { compact, normalized } from './normalize'
import { compact as compactFromRuns, normalized as normalizedFromRuns } from './runs'

/**
 * runs.ts에서 갈라 낸 정규화. 구현은 하나뿐이어야 하므로 (ADR-033), 갈라 낸 뒤에도
 * runs.ts가 내보내는 것이 **같은 함수**인지를 고정한다 — 사본이 생기면 断面リスト와
 * framing-plan의 문자열 완전 일치가 조용히 깨진다.
 */
describe('normalize', () => {
  it('is the same implementation runs.ts exposes', () => {
    expect(compactFromRuns).toBe(compact)
    expect(normalizedFromRuns).toBe(normalized)
  })

  it('folds NFKC and the hyphen family but leaves 長音符 alone', () => {
    expect(normalized('Ｄ１３')).toBe('D13')
    // CP932 0x815C の写り方が U+2014 と U+2015 に割れる (yokohama p13 は U+2015)
    expect(normalized('a—b')).toBe('a-b')
    expect(normalized('a―b')).toBe('a-b')
    expect(normalized('a−b')).toBe('a-b')
    // 長音符はカナの字であってハイフンではない (kani p38)
    expect(normalized('コンクリート')).toBe('コンクリート')
  })

  it('drops every kind of space on top of the normalisation', () => {
    expect(compact(' Ｙ ２ 端\t')).toBe('Y2端')
    expect(compact('5 - D25')).toBe('5-D25')
  })
})
