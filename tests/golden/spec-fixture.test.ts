import { describe, expect, it } from 'vitest'

import fixture from './fixtures/spec-r7-ch5.json'

type FixtureEntry = (typeof fixture.entries)[number]

const requiredSourceFields = ['doc', 'edition', 'sha256', 'url'] as const
const requiredEntryFields = [
  'table',
  'pdfPage',
  'printedPage',
  'kind',
  'conditions',
  'value',
  'unit',
  'imageRead',
] as const

function entriesFor(...kinds: string[]): FixtureEntry[] {
  return fixture.entries.filter(({ kind }) => kinds.includes(kind))
}

describe('公共建築工事標準仕様書 令和7年版 5章 fixture', () => {
  it('has the required source and entry fields', () => {
    expect(fixture.entries.length).toBeGreaterThan(0)

    for (const field of requiredSourceFields) {
      expect(fixture.source).toHaveProperty(field)
      expect(fixture.source[field]).not.toBe('')
    }

    for (const entry of fixture.entries) {
      for (const field of requiredEntryFields) {
        expect(entry).toHaveProperty(field)
      }

      expect(entry.table).not.toBe('')
      expect(entry.pdfPage).toBeGreaterThan(0)
      expect(entry.printedPage).toBeGreaterThan(0)
    }
  })

  it('contains all 22 重ね継手 cells', () => {
    expect(entriesFor('lap.L1', 'lap.L1h')).toHaveLength(22)
  })

  it('contains all 44 定着 cells for 柱 and 大梁', () => {
    expect(
      entriesFor(
        'anchorage.L1',
        'anchorage.L2',
        'anchorage.L1h',
        'anchorage.L2h',
      ),
    ).toHaveLength(44)
  })

  it('contains all 11 梁主筋 投影定着 La cells', () => {
    expect(entriesFor('anchorage.La')).toHaveLength(11)
  })
})
