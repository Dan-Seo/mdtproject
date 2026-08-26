import { describe, expect, it } from 'vitest'

import { storyKey, storyLabelFromTitle } from '@/lib/import/story-label'

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
