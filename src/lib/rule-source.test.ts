import { describe, expect, it } from 'vitest'

import type { RuleHit } from '@/domain/rules/types'

import { sourceLabel, sourceTooltip } from './rule-source'

function rule(overrides: Partial<RuleHit> = {}): RuleHit {
  return {
    key: 'anchorage.L1',
    label: '定着長さ L1',
    expr: '40d',
    conditions: {},
    value: 40,
    unit: 'd',
    source: {
      short: '標準仕様書',
      doc: '公共建築工事標準仕様書（建築工事編）',
      edition: '令和7年版',
      publisher: '国土交通省',
      url: 'https://example.invalid/spec',
      section: '表5.3.4',
      page: 118,
    },
    confidence: 'stated',
    note: '一般値',
    ...overrides,
  }
}

describe('sourceLabel', () => {
  it('joins the short document name with the cited section', () => {
    expect(sourceLabel(rule())).toBe('標準仕様書 表5.3.4')
  })

  it('drops the section when the rule cites the document as a whole', () => {
    expect(sourceLabel(rule({ source: { ...rule().source, section: null } })))
      .toBe('標準仕様書')
  })
})

describe('sourceTooltip', () => {
  it('carries label, expression, document location and note', () => {
    expect(sourceTooltip(rule())).toBe(
      [
        '定着長さ L1 ＝ 40d',
        '公共建築工事標準仕様書（建築工事編）（令和7年版） 表5.3.4 118頁',
        '一般値',
      ].join('\n'),
    )
  })

  it('separates 原文に値なし from 独立検討待ち', () => {
    // 두 사실은 다르다 — 하나는 제품이 지어낸 값이고, 다른 하나는 원문에 있는
    // 값인데 검토자가 전사자와 같을 뿐이다 (R6). 같은 문구로 덮으면 등급을
    // 나눈 의미가 사라진다 (ADR-023).
    expect(sourceTooltip(rule({ confidence: 'inferred' }))).toContain(
      '⚠ 原文に値なし（推論）—',
    )
    expect(sourceTooltip(rule({ confidence: 'transcribed' }))).toContain(
      '△ 原文明示・独立検討待ち（R6）—',
    )
    const statedTooltip = sourceTooltip(rule({ confidence: 'stated' }))
    expect(statedTooltip).not.toContain('推論')
    expect(statedTooltip).not.toContain('独立検討待ち')
  })

  it('says the original URL is missing instead of silently omitting it', () => {
    expect(
      sourceTooltip(rule({ source: { ...rule().source, url: null } })),
    ).toContain('原文URL未確保 —')
  })
})
