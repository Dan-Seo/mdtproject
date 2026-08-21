import { describe, expect, it } from 'vitest'

import type { GirderSection, Member } from '@/domain/model/member'
import {
  findSection,
  girderRun,
  girderSpan,
  type GirderRun,
  type GirderSpan,
} from '@/domain/model/project'
import { createSampleProject } from '@/domain/model/sample-project'
import type { Rebar } from '@/domain/model/rebar'
import { generateGirderRebar } from '@/domain/rebar/girder'
import { resolveGirderEnd } from '@/domain/rebar/girder-ends'
import { lookupRule } from '@/domain/rules/lookup'
import { jpMlitRulePack } from '@/rulepack'

import { legendEntries } from './legend'

function sampleGirder(): {
  member: Member
  section: GirderSection
  span: GirderSpan
  run: GirderRun
} {
  const project = createSampleProject()
  const member = project.members.find(
    ({ id }) => id === '1F-G1-X1Y1-X',
  )
  if (member === undefined || member.kind !== '大梁') {
    throw new Error('Supported sample 大梁 not found')
  }
  const section = findSection(project, member.sectionId)
  if (section.kind !== '大梁') {
    throw new Error('Sample 大梁 section not found')
  }

  return {
    member,
    section,
    span: girderSpan(project, member),
    run: girderRun(project, member),
  }
}

function runWithSpan(run: GirderRun, span: GirderSpan): GirderRun {
  return { ...run, spans: [span], coreLengthMm: span.clear }
}

function diameter(size: GirderSection['main']['size']): number {
  return Number(size.replace(/^D/, ''))
}

describe('legendEntries', () => {
  it('deduplicates 大梁 定着 zones using the lookup-derived rule length', () => {
    const { section, span, run } = sampleGirder()
    const straightRule = lookupRule(jpMlitRulePack, 'anchorage.L1', {
      fc: section.fc,
      grade: section.grade,
      hook: false,
    })
    const expectedLengthMm = straightRule.value * diameter(section.main.size)
    const straightSpan: GirderSpan = {
      ...span,
      startSupportLengthAlongAxisMm: expectedLengthMm * 2,
      endSupportLengthAlongAxisMm: expectedLengthMm * 2,
    }
    const rebars = generateGirderRebar(
      { run: runWithSpan(run, straightSpan), section },
      jpMlitRulePack,
    )

    expect(legendEntries(rebars)).toEqual([
      {
        kind: '定着',
        lengthMm: expectedLengthMm,
        ruleKey: straightRule.key,
        rule: straightRule,
      },
    ])
  })

  it('keeps different start and end 定着 lengths as separate entries', () => {
    // 5.3.4(5)(ｲ) の (a) L1 が支配すると折曲げ定着の全長は直線定着とぴったり
    // 同じ値・同じ行になり、凡例は正しく1件にまとまる。この検査が見たいのは
    // 「違う長さは分かれて残るか」なので、(b) 投影＋余長が支配する断面を使う。
    // D13/柱560 がその窓に入る — 折曲げになるには柱せい < L1 520 ＋ かぶり 50、
    // (b) が勝つには 0.75×柱せい ＋ 8d 104 > 520 すなわち柱せい > 554.7。
    const { section: sampleSection, span, run } = sampleGirder()
    const section: GirderSection = {
      ...sampleSection,
      main: { ...sampleSection.main, size: 'D13' },
    }
    const straightRule = lookupRule(jpMlitRulePack, 'anchorage.L1', {
      fc: section.fc,
      grade: section.grade,
      hook: false,
    })
    const straightLengthMm = straightRule.value * diameter(section.main.size)
    const asymmetricSpan: GirderSpan = {
      ...span,
      startSupportLengthAlongAxisMm: straightLengthMm * 2,
      endSupportLengthAlongAxisMm: 560,
    }
    const bentEnd = resolveGirderEnd(
      {
        supportLengthMm: asymmetricSpan.endSupportLengthAlongAxisMm,
        supportCover: span.endSupportCover,
        barSize: section.main.size,
        fc: section.fc,
        grade: section.grade,
        bendDirection: '下',
      },
      jpMlitRulePack,
    )
    const rebars = generateGirderRebar(
      { run: runWithSpan(run, asymmetricSpan), section },
      jpMlitRulePack,
    )

    const bentLengthRule =
      bentEnd.kind === '折曲げ定着' ? bentEnd.lengthRule : undefined

    expect(bentEnd.kind).toBe('折曲げ定着')
    // (b) が支配していないと両端が同じ L1 になり、この検査は何も守らない。
    expect(bentLengthRule).toBe('anchorage.bent.tail.minimum')
    expect(bentEnd.lengthMm).not.toBe(straightLengthMm)
    expect(legendEntries(rebars)).toEqual([
      {
        kind: '定着',
        lengthMm: straightLengthMm,
        ruleKey: straightRule.key,
        rule: straightRule,
      },
      {
        kind: '定着',
        lengthMm: bentEnd.lengthMm,
        ruleKey: bentLengthRule,
        rule: bentEnd.usedRules.find(({ key }) => key === bentLengthRule),
      },
    ])
  })

  it('fails instead of showing a 定着長 whose rule it cannot cite', () => {
    // 出典 표시는 법적 의무다 — 근거를 못 찾으면 조용히 수치만 띄우는 대신 실패한다.
    const { section, run } = sampleGirder()
    const [withZones] = generateGirderRebar(
      { run, section },
      jpMlitRulePack,
    )
    const orphaned: Rebar = { ...withZones, ruleHits: [] }

    expect(() => legendEntries([orphaned])).toThrow(
      /Legend rule missing from ruleHits/,
    )
  })

  it('returns an empty array when no Rebar carries zones', () => {
    const { section, run } = sampleGirder()
    const withoutZones = generateGirderRebar(
      { run, section },
      jpMlitRulePack,
    ).map((rebar): Rebar => ({ ...rebar, zones: undefined }))

    expect(legendEntries(withoutZones)).toEqual([])
  })
})
