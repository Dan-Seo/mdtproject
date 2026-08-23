import { describe, expect, it } from 'vitest'

import { load } from './yaml-json'

describe('yaml-json (バンドル内の js-yaml 代替)', () => {
  it('ビルド時に JSON へ変換された規準データをそのまま戻す', () => {
    const data = { 'anchorage.L1': { value: 40, unit: 'd' } }

    expect(load(JSON.stringify(data))).toEqual(data)
  })

  it('YAML 構文が実行時に流れ込んだら黙って誤読せず止まる', () => {
    // ここを通ってしまうと規準値が null のまま数量に載る — 落とす方が安全だ。
    expect(() => load('key: 40\n')).toThrow(/ビルド時|next\.config/)
  })
})
