import { describe, expect, it } from 'vitest'

import { lookupMarkup } from '../../src/domain/rules/lookup'
import { jpMlitRulePack } from '../../src/rulepack'
import fixture from './fixtures/markup.json'

describe('公共建築数量積算基準 鉄筋割増', () => {
  it('matches the stated 躯体 value and source on printed page 15', () => {
    const hit = lookupMarkup(jpMlitRulePack, fixture.supported.memberClass)

    expect(hit.value).toBe(fixture.supported.value)
    expect(hit.unit).toBe(fixture.supported.unit)
    expect(hit.confidence).toBe(fixture.supported.confidence)
    expect(hit.source.doc).toBe(fixture.source.doc)
    expect(hit.source.edition).toBe(fixture.source.edition)
    expect(hit.source.section).toBe(fixture.source.section)
    expect(hit.source.page).toBe(fixture.source.page)
  })

  it.each(fixture.unsupported)(
    'fails for unsupported member class $memberClass documented on page $page',
    ({ memberClass }) => {
      expect(() => lookupMarkup(jpMlitRulePack, memberClass)).toThrow()
    },
  )

  it('fails for an empty member class', () => {
    expect(() => lookupMarkup(jpMlitRulePack, '')).toThrow()
  })
})
