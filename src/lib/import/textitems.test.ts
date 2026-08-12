import { describe, expect, it } from 'vitest'

import { toTextItems } from './textitems'

// 프로덕션 추출기(pdf-text.ts)와 픽스처 생성기(scripts/extract-textitems.mjs)가
// 같은 함수를 쓰는 것이 규약 일치의 근거다. 이 테스트는 그 함수의 규약 자체를
// 고정한다: 문자 단위 분할, y=베이스라인, 공백 문자 제외, 회전 기록.
describe('toTextItems', () => {
  it('splits a string into per-character items on the baseline', () => {
    const items = toTextItems(
      [{ str: 'AB C', width: 40, height: 10, transform: [10, 0, 0, 10, 50, 100] }],
      [1, 0, 0, -1, 0, 200],
    )

    expect(items).toEqual([
      { str: 'A', x: 50, y: 100, w: 10, h: 10 },
      { str: 'B', x: 60, y: 100, w: 10, h: 10 },
      { str: 'C', x: 80, y: 100, w: 10, h: 10 },
    ])
  })

  it('advances rotated text along its baseline direction and records rot', () => {
    const items = toTextItems(
      [{ str: 'AB', width: 20, height: 10, transform: [0, 10, -10, 0, 50, 100] }],
      [1, 0, 0, -1, 0, 200],
    )

    expect(items).toEqual([
      { str: 'A', x: 50, y: 100, w: 10, h: 10, rot: -90 },
      { str: 'B', x: 50, y: 90, w: 10, h: 10, rot: -90 },
    ])
  })

  it('drops whitespace-only strings entirely', () => {
    expect(
      toTextItems(
        [{ str: '   ', width: 12, height: 10, transform: [1, 0, 0, 1, 0, 0] }],
        [1, 0, 0, -1, 0, 200],
      ),
    ).toEqual([])
  })
})
