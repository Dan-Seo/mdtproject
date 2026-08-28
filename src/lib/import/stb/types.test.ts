import { describe, expect, it } from 'vitest'

import ja from '@/locales/ja.json'
import ko from '@/locales/ko.json'

import { STB_ISSUES } from './types'

describe('ST-Bridge import issue codes', () => {
  it('defines exactly the supported issue codes', () => {
    expect(STB_ISSUES).toHaveLength(18)
    expect(new Set(STB_ISSUES).size).toBe(18)
  })

  it('has a ja·ko message for every issue code', () => {
    const missing = STB_ISSUES.flatMap((issue) => {
      const key = `stbImport.issue.${issue}`
      return [
        ...(key in ja ? [] : [`ja:${key}`]),
        ...(key in ko ? [] : [`ko:${key}`]),
      ]
    })

    expect(missing).toEqual([])
  })
})
