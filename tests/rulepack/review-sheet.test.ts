import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { jpMlitRulePack } from '../../src/rulepack'
import {
  expandFoldedReviewSheet,
  foldRulePack,
  renderReviewSheet,
} from '../../scripts/rulepack/review-sheet'

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n?/g, '\n')
}

function clonePack() {
  return {
    ...jpMlitRulePack,
    entries: jpMlitRulePack.entries.map((entry) => ({
      ...entry,
      conditions: { ...entry.conditions },
      source: { ...entry.source },
    })),
  }
}

describe('룰팩 원문 표 단위 대조 시트', () => {
  it('folds expanded Fc bands and the quantity interval into original cells', () => {
    const sheet = foldRulePack(jpMlitRulePack)

    expect(sheet.originalRowCount).toBe(243)
    expect(sheet.foldedRowCount).toBe(135)
    expect(sheet.byKey['measure.splice.interval']).toEqual({
      before: 8,
      after: 2,
    })
    expect(sheet.byKey['lap.L1']).toEqual({ before: 20, after: 11 })
    expect(sheet.byKey['cover.minimum']).toEqual({ before: 19, after: 7 })
    expect(sheet.byKey['bend.inside-diameter']).toEqual({ before: 21, after: 3 })
  })

  it('keeps method-specific splice factors as four separate review cells', () => {
    const sheet = foldRulePack(jpMlitRulePack)
    const factorGroups = sheet.groups.filter(
      (group) => group.key === 'measure.splice.length.factor',
    )

    expect(factorGroups).toHaveLength(4)
    expect(factorGroups.every((group) => group.foldedCount === 1)).toBe(true)
    expect(
      factorGroups.map((group) => group.cells[0]?.representative.conditions.method),
    ).toEqual(['重ね継手', 'ガス圧接', '機械式', '溶接'])
  })

  it('round-trips every original entry without losing any field', () => {
    const sheet = foldRulePack(jpMlitRulePack)

    expect(expandFoldedReviewSheet(sheet)).toEqual(jpMlitRulePack.entries)
  })

  it('fails instead of choosing a representative when a declared band disagrees', () => {
    const pack = clonePack()
    const target = pack.entries.find(
      (entry) =>
        entry.key === 'measure.splice.interval' &&
        entry.conditions.size === 'D13',
    )!
    target.value += 1

    expect(() => foldRulePack(pack)).toThrow(/帯.*値|value.*band/i)
  })

  it('marks the 77 cells covered by the existing agent re-read without excluding them', () => {
    const sheet = foldRulePack(jpMlitRulePack)

    expect(sheet.verification.reviewCellCount).toBe(77)
    expect(sheet.verification.note).toContain('독립 검토가 아니다')

    const markdown = renderReviewSheet(jpMlitRulePack)
    expect(markdown).toContain('전 칸 일치 / 불일치(칸을 적음)')
    expect(markdown).toContain('재대조 표식이 있어도 회신 대상에서 제외하지 않는다')
    expect(markdown).toContain('measure.splice.interval')
    expect(markdown).toContain('※既存再対照:')
    expect(markdown).toContain('독립 검토가 아니다')
    expect(markdown).toContain('屋内・仕上げあり')

    const tableRows = markdown
      .split('\n')
      .filter((line) => line.startsWith('|'))
    expect(tableRows.some((line) => line.includes('※既存再対照'))).toBe(false)
    expect(markdown).not.toContain('[[')
    expect((markdown.match(/\[transcribed\]\*/g) ?? []).length).toBe(77)
  })

  it('renders deterministically and keeps the quantity interval at two cells', () => {
    const first = renderReviewSheet(jpMlitRulePack)
    const second = renderReviewSheet(jpMlitRulePack)

    expect(second).toBe(first)
    expect(first.match(/measure\.splice\.interval/g)).toHaveLength(1)
    expect(first).toContain('D10·D13')
    expect(first).toContain('D16·D19·D22·D25·D29·D32')
  })

  it('matches the checked-in golden Markdown snapshot', () => {
    const snapshot = readFileSync(
      new URL('../golden/fixtures/rulepack-review-sheet.md', import.meta.url),
      'utf8',
    )

    expect(normalizeNewlines(renderReviewSheet(jpMlitRulePack))).toBe(
      normalizeNewlines(snapshot),
    )
  })
})
