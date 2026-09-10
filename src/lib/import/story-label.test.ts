import { describe, expect, it } from 'vitest'

import { levelStoryKey, storyNameKey, storyKey, storyLabelFromTitle } from '@/lib/import/story-label'

const levelGrammar = [
  ['1FL', '1'], ['２ＦＬ', '2'], ['1SL', '1'], ['01F', '1'], ['3階', '3'],
  ['RFL', 'R'], ['RSL+760.00', 'R'], ['RFL(水下)', 'R'],
  [' R ＦＬ（ 水下 ） ', 'R'], ['2FL-12.5', '2'], ['1SL±0', '1'],
  ['RFL760.00', 'R'], ['R', 'R'], ['RF', 'R'], ['R階', 'R'],
  ['RFL水上', undefined], ['中央棟1FL', undefined], ['GL', undefined],
  ['設計GL', undefined], ['基礎下端', undefined], ['PHFL', undefined],
  ['B1F', undefined], ['RCL', undefined], ['', undefined],
  ['note1FL', undefined], ['1FLまで', undefined], ['1FL／1SL', undefined],
] as const

describe('levelStoryKey', () => {
  it.each(levelGrammar)('%s -> %s', (label, key) => {
    expect(levelStoryKey(label)).toBe(key)
    if (key !== undefined) expect(storyKey(key === 'R' ? 'RF' : `${key}F`)).toBe(key)
  })
  it('keeps the existing story grammar unchanged', () => {
    expect(storyKey('1FL')).toBeUndefined()
  })
})

const nameGrammar = [
  ['1FL／1SL', '1'], ['中央棟1FL／基準GL', undefined],
  ['1FL／2SL', undefined], ['1FL／GL', undefined], ['1FL／', undefined],
  ['', undefined], ['RFL／RSL+760.00', 'R'], ['２ＦＬ/02SL', '2'],
] as const

describe('storyNameKey', () => {
  it.each(nameGrammar)('%s -> %s', (name, key) => {
    expect(storyNameKey(name)).toBe(key)
  })
})

describe('storyKey', () => {
  it('normalizes numeric floor labels and the roof aliases', () => {
    expect(storyKey('2階')).toBe('2')
    expect(storyKey('2F')).toBe('2')
    expect(storyKey('２階')).toBe('2')
    expect(storyKey(' RF ')).toBe('R')
    expect(storyKey('R階')).toBe('R')
    expect(storyKey('01F')).toBe('1')
  })

  it('does not infer keys from unsupported or non-label text', () => {
    expect(storyKey('B1F')).toBeUndefined()
    expect(storyKey('地下1階')).toBeUndefined()
    expect(storyKey('PH')).toBeUndefined()
    expect(storyKey('塔屋')).toBeUndefined()
    expect(storyKey('')).toBeUndefined()
    expect(storyKey('X1')).toBeUndefined()
    expect(storyKey('2階床伏図')).toBeUndefined()
  })
})

describe('storyLabelFromTitle', () => {
  it('returns the first supported floor token from a compacted title', () => {
    expect(storyLabelFromTitle('2階床伏図1/100')).toBe('2階')
    expect(storyLabelFromTitle('R階床伏図')).toBe('R階')
    expect(storyLabelFromTitle('２階 床伏図')).toBe('2階')
  })

  it('returns undefined when no supported floor token exists', () => {
    expect(storyLabelFromTitle('杭伏図')).toBeUndefined()
    expect(storyLabelFromTitle('地下1階平面図')).toBeUndefined()
  })

  it('rejects titles containing different canonical floor keys', () => {
    expect(storyLabelFromTitle('2階と3階の床伏図')).toBeUndefined()
    expect(storyLabelFromTitle('2F・R階床伏図')).toBeUndefined()
  })

  it('keeps the first token when repeated tokens share one canonical key', () => {
    expect(storyLabelFromTitle('2階床伏図(2F)')).toBe('2階')
  })
})
