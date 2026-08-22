import { describe, expect, it } from 'vitest'

import { MemberUnsupportedError } from './unsupported'

describe('MemberUnsupportedError', () => {
  it('carries the reason so the caller can report it per member', () => {
    const error = new MemberUnsupportedError(
      '定着不成立',
      '折曲げ定着が支点柱に収まらない',
    )

    expect(error.reason).toBe('定着不成立')
    expect(error.message).toBe('折曲げ定着が支点柱に収まらない')
  })

  it('stays distinguishable from ordinary defects', () => {
    // 미지원 판정만 흡수하고 룰팩 공백·타입 위반은 그대로 터뜨리기 위해
    // 호출부가 instanceof로 갈라낼 수 있어야 한다.
    const error = new MemberUnsupportedError('寸法不成立', '内法長さ')

    expect(error).toBeInstanceOf(MemberUnsupportedError)
    expect(error).toBeInstanceOf(Error)
    expect(new Error('boom')).not.toBeInstanceOf(MemberUnsupportedError)
  })
})
