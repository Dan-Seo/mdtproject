import { describe, expect, it } from 'vitest'

import { parseRulePack } from './loader'

const sources = `
spec:
  short: 標準仕様書
  doc: テスト仕様書
  edition: テスト版
  publisher: テスト発行者
  url: https://example.com/spec.pdf
`

function rule(overrides = ''): string {
  return `
- key: test.rule
  label: テスト規則
  expr: 1d
  conditions: { grade: SD345 }
  value: 1
  unit: d
  source: { ref: spec, section: テスト節, page: 1 }
  confidence: stated
  note: テスト注記
${overrides}`
}

function parse(rules: string) {
  return parseRulePack({
    'sources.yaml': sources,
    'rules.yaml': rules,
  })
}

describe('parseRulePack', () => {
  it('resolves a source reference into display-ready metadata', () => {
    const pack = parse(rule())

    expect(pack.id).toBe('jp-mlit')
    expect(pack.entries).toEqual([
      expect.objectContaining({
        key: 'test.rule',
        source: {
          short: '標準仕様書',
          doc: 'テスト仕様書',
          edition: 'テスト版',
          publisher: 'テスト発行者',
          url: 'https://example.com/spec.pdf',
          section: 'テスト節',
          page: 1,
        },
      }),
    ])
  })

  it.each(['key', 'label', 'value', 'unit', 'source', 'confidence'])(
    'rejects an entry missing required field %s',
    (field) => {
      const rules =
        field === 'key'
          ? rule().replace('- key: test.rule', '-')
          : rule()
              .split('\n')
              .filter((line) => !line.trimStart().startsWith(`${field}:`))
              .join('\n')

      expect(() => parse(rules)).toThrow(/rules\.yaml.*test\.rule|rules\.yaml.*<unknown>/)
    },
  )

  it("rejects confidence values outside 'stated' and 'inferred'", () => {
    expect(() => parse(rule().replace('confidence: stated', 'confidence: verified')))
      .toThrow(/rules\.yaml.*test\.rule/)
  })

  it("rejects 'stated' when source.page is null", () => {
    expect(() => parse(rule().replace('page: 1', 'page: null'))).toThrow(
      /rules\.yaml.*test\.rule.*page/,
    )
  })

  it('rejects an unknown source reference', () => {
    expect(() => parse(rule().replace('ref: spec', 'ref: missing'))).toThrow(
      /rules\.yaml.*test\.rule.*missing/,
    )
  })

  it('rejects duplicate key and conditions regardless of property order', () => {
    const duplicate = `${rule()}
- key: test.rule
  label: 重複規則
  expr: 2d
  conditions: { hook: false, grade: SD345 }
  value: 2
  unit: d
  source: { ref: spec, section: テスト節, page: 1 }
  confidence: stated
  note: テスト注記
- key: test.rule
  label: 重複規則
  expr: 3d
  conditions: { grade: SD345, hook: false }
  value: 3
  unit: d
  source: { ref: spec, section: テスト節, page: 1 }
  confidence: stated
  note: テスト注記
`

    expect(() => parse(duplicate)).toThrow(/rules\.yaml.*test\.rule.*duplicate/i)
  })
})
