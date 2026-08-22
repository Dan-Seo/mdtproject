import { describe, expect, it } from 'vitest'

import ja from '@/locales/ja.json'
import ko from '@/locales/ko.json'

import { MemberUnsupportedError, UNSUPPORTED_REASONS } from './unsupported'

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

describe('UnsupportedReason', () => {
  // 유니온에 사유를 하나 더 넣고 문구를 안 쓰면 사용자에게 「止め位置未入力」 같은
  // 코드가 그대로 보인다. 타입만으로는 잡히지 않아 런타임 배열을 둔다
  it.each(['takeoff.unsupported', 'viewer.unsupported'])(
    'has a ja·ko %s message for every reason',
    (scope) => {
      const missing = UNSUPPORTED_REASONS.flatMap((reason) =>
        [`${scope}.reason.${reason}`, `${scope}.plan.${reason}`].flatMap(
          (key) => [
            ...(key in ja ? [] : [`ja:${key}`]),
            ...(key in ko ? [] : [`ko:${key}`]),
          ],
        ),
      )

      expect(missing).toEqual([])
    },
  )
})
