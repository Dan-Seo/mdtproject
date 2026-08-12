import { describe, expect, it } from 'vitest'

import { lookupRule } from '../../src/domain/rules/lookup'
import { jpMlitRulePack } from '../../src/rulepack'
import fixture from './fixtures/spec-r7-ch5.json'

interface TableEntry {
  table: string
  printedPage: number
  kind: string
  conditions: {
    grade: string
    fcBand: string
    hook?: boolean
  }
  value: number
  unit: string
}

interface BendInsideDiameterEntry {
  table: string
  printedPage: number
  kind: 'bend.inside-diameter'
  conditions: {
    grades: string[]
    barSizeBand: string
  }
  value: number
  unit: string
  imageRead: boolean
}

interface DirectEntry {
  table: string
  printedPage: number
  kind: string
  conditions: Record<string, never>
  value: number
  unit: string
  imageRead: boolean
}

interface CoverEntry {
  table: string
  printedPage: number
  kind: 'cover.minimum'
  conditions: {
    memberKinds: string[]
    soilContact: boolean
    exposure?: string
    finish?: string
  }
  value: number
  unit: string
  imageRead: boolean
}

interface ExpandedCase {
  entry: {
    table: string
    printedPage: number
    kind: string
    value: number
    unit: string
  }
  conditions: Record<string, string | number | boolean>
}

const supportedKinds = new Set([
  'lap.L1',
  'lap.L1h',
  'anchorage.L1',
  'anchorage.L2',
  'anchorage.L1h',
  'anchorage.L2h',
  'anchorage.La',
])

// 표의 Fc 帯·呼び径 대역은 끝점이 아니라 대역 내 전 표준값으로 전개해 대조한다 —
// 끝점만 보면 대역 중간값(Fc33 등)의 룰팩 공백을 골든테스트가 놓친다.
const STANDARD_FC = [18, 21, 24, 27, 30, 33, 36]

function expandFcBand(fcBand: string): number[] {
  const [low, high = low] = fcBand.split('-').map(Number)

  if (!Number.isFinite(low) || !Number.isFinite(high)) {
    throw new Error(`Invalid fcBand in fixture: ${fcBand}`)
  }

  const expanded = STANDARD_FC.filter((fc) => fc >= low && fc <= high)

  if (expanded.length === 0) {
    throw new Error(`fcBand matches no standard Fc: ${fcBand}`)
  }

  return expanded
}

// 도메인 BarSize 유니온과 같은 呼び径 목록 (D35·D38은 유니온 밖 — 전개 제외)
const BAR_SIZES = [10, 13, 16, 19, 22, 25, 29, 32]

function expandBarSizeBand(barSizeBand: string): string[] {
  const bounds = barSizeBand.match(/\d+/g)?.map(Number)

  if (!bounds || bounds.length === 0) {
    throw new Error(`Invalid barSizeBand in fixture: ${barSizeBand}`)
  }

  const [low, high = low] = bounds
  const expanded = barSizeBand.includes('以下')
    ? BAR_SIZES.filter((diameter) => diameter <= low)
    : barSizeBand.includes('以上')
      ? BAR_SIZES.filter((diameter) => diameter >= low)
      : BAR_SIZES.filter((diameter) => diameter >= low && diameter <= high)

  if (expanded.length === 0) {
    throw new Error(`barSizeBand matches no BarSize: ${barSizeBand}`)
  }

  return expanded.map((diameter) => `D${diameter}`)
}

const tableEntries = (fixture.entries as unknown as TableEntry[]).filter(
  ({ kind }) => supportedKinds.has(kind),
)

const expandedCases: ExpandedCase[] = tableEntries.flatMap((entry) => {
  const { fcBand, ...baseConditions } = entry.conditions

  return expandFcBand(fcBand).map((fc) => ({
    entry,
    conditions: { ...baseConditions, fc },
  }))
})

const bendInsideDiameterEntries = (
  fixture.entries as unknown as BendInsideDiameterEntry[]
).filter(({ kind }) => kind === 'bend.inside-diameter')

const bendInsideDiameterCases: ExpandedCase[] =
  bendInsideDiameterEntries.flatMap((entry) =>
    entry.conditions.grades.flatMap((grade) =>
      expandBarSizeBand(entry.conditions.barSizeBand).map((size) => ({
        entry,
        conditions: { grade, size },
      })),
    ),
  )

const hookEntries = (fixture.entries as unknown as DirectEntry[]).filter(
  ({ kind }) =>
    ['bend.hook180', 'bend.hook135', 'bend.hook90', 'bend.hook-tome'].includes(
      kind,
    ),
)

const coverEntries = (fixture.entries as unknown as CoverEntry[]).filter(
  ({ kind }) => kind === 'cover.minimum',
)

const coverCases: ExpandedCase[] = coverEntries.flatMap((entry) => {
  const { memberKinds, ...baseConditions } = entry.conditions

  return memberKinds.map((memberKind) => ({
    entry,
    conditions: { ...baseConditions, memberKind },
  }))
})

const fabricationAdditionEntry = (
  fixture.entries as unknown as DirectEntry[]
).find(({ kind }) => kind === 'cover.fabrication.addition')

if (!fabricationAdditionEntry) {
  throw new Error('Fixture is missing cover.fabrication.addition')
}

describe('公共建築工事標準仕様書 令和7年版 定着・重ね継手 tables', () => {
  it.each(expandedCases)(
    '$entry.kind Fc$conditions.fc $entry.conditions.grade matches $entry.table',
    ({ entry, conditions }) => {
      const hit = lookupRule(jpMlitRulePack, entry.kind, conditions)

      expect(hit.value).toBe(entry.value)
      expect(hit.unit).toBe(entry.unit)
      expect(hit.source.section).toBe(entry.table)
      expect(hit.source.page).toBe(entry.printedPage)
      expect(hit.confidence).toBe('inferred')
      expect(hit.note).toContain('LLM転写 — 独立検討待ち')
    },
  )

  it('fails fast for an Fc value absent from the fixture bands', () => {
    expect(() =>
      lookupRule(jpMlitRulePack, 'anchorage.L2', {
        fc: 25, // 表の Fc 帯に無い値 — 룰팩 공백은 조용히 넘어가지 않고 실패해야 한다
        grade: 'SD345',
        hook: false,
      }),
    ).toThrow(/not found/i)
  })
})

describe('公共建築工事標準仕様書 令和7年版 折曲げ・かぶり tables', () => {
  it.each(bendInsideDiameterCases)(
    '$entry.kind $conditions.grade $conditions.size matches $entry.table',
    ({ entry, conditions }) => {
      const hit = lookupRule(jpMlitRulePack, entry.kind, conditions)

      expect(hit.value).toBe(entry.value)
      expect(hit.unit).toBe(entry.unit)
      expect(hit.source.section).toBe(entry.table)
      expect(hit.source.page).toBe(entry.printedPage)
      expect(hit.confidence).toBe('inferred')
      expect(hit.note).toContain('LLM転写 — 独立検討待ち')
    },
  )

  it.each(hookEntries)(
    '$kind matches the image-read value in $table',
    (entry) => {
      const hit = lookupRule(jpMlitRulePack, entry.kind, entry.conditions)

      expect(entry.imageRead).toBe(true)
      expect(hit.value).toBe(entry.value)
      expect(hit.unit).toBe(entry.unit)
      expect(hit.source.section).toBe(entry.table)
      expect(hit.source.page).toBe(entry.printedPage)
      expect(hit.confidence).toBe('inferred')
      expect(hit.note).toContain('画像')
    },
  )

  it.each(coverCases)(
    '$entry.kind $conditions.memberKind matches $entry.table',
    ({ entry, conditions }) => {
      const hit = lookupRule(jpMlitRulePack, entry.kind, conditions)

      expect(hit.value).toBe(entry.value)
      expect(hit.unit).toBe(entry.unit)
      expect(hit.source.section).toBe(entry.table)
      expect(hit.source.page).toBe(entry.printedPage)
      expect(hit.confidence).toBe('inferred')
      expect(hit.note).toContain('LLM転写 — 独立検討待ち')
    },
  )

  it('matches the 加工用かぶり addition as its own rule', () => {
    const entry = fabricationAdditionEntry
    const hit = lookupRule(jpMlitRulePack, entry.kind, entry.conditions)

    expect(hit.value).toBe(entry.value)
    expect(hit.unit).toBe(entry.unit)
    expect(hit.source.section).toBe(entry.table)
    expect(hit.source.page).toBe(entry.printedPage)
    expect(hit.confidence).toBe('inferred')
    expect(hit.key).toBe(entry.kind)
  })
})

describe('픽스처 대조 완전성', () => {
  // 대조 중(covered)도 유예(deferred)도 아닌 셀은 무검증으로 남는다 —
  // 픽스처에 새 kind를 넣으면 어느 한쪽에 명시하지 않는 한 실패시킨다.
  const coveredKinds = new Set([
    ...supportedKinds,
    'bend.inside-diameter',
    'bend.hook180',
    'bend.hook135',
    'bend.hook90',
    'bend.hook-tome',
    'cover.minimum',
    'cover.fabrication.addition',
  ])
  // 룰팩 미수록 — 경량 콘크리트 가산과 折曲げ定着 상세는 아직 소비자가 없다.
  // 룰팩에 수록하는 시점에 covered로 옮겨 대조를 시작할 것.
  const deferredKinds = new Set([
    'lap.lightweight.addition',
    'anchorage.lightweight.addition',
    'anchorage.La.lightweight.addition',
    'anchorage.bent.tail.minimum',
    'anchorage.bent.projection.minimum',
  ])

  it('leaves no fixture entry uncompared', () => {
    const uncovered = fixture.entries
      .map(({ kind }) => kind)
      .filter((kind) => !coveredKinds.has(kind) && !deferredKinds.has(kind))

    expect(uncovered).toEqual([])
  })
})
