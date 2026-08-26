import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { createSampleProject } from '@/domain/model/sample-project'
import { applyElevation, applyFramingPlan } from '@/lib/import/framing-plan/apply'
import { parseFramingPlan } from '@/lib/import/framing-plan/parse'
import type {
  AxisCandidate,
  ElevationCandidate,
  MemberPlacement,
  PlanBlock,
  PlanGridCandidate,
} from '@/lib/import/framing-plan/types'
import { parseSectionLists } from '@/lib/import/section-list/parse'
import type {
  SectionCandidate,
  TextPage,
} from '@/lib/import/section-list/types'
import { compact, recoverRows } from '@/lib/import/runs'

type TextItemFixture = {
  page: Pick<TextPage, 'widthPt' | 'heightPt'>
  items: TextPage['items']
}

function readFixture(file: string): TextPage {
  const fixture = JSON.parse(
    readFileSync(
      resolve('tests/fixtures/section-import/textitems', file),
      'utf8',
    ),
  ) as TextItemFixture
  return { ...fixture.page, items: fixture.items }
}

function axis(direction: 'X' | 'Y', labels: string[]): PlanGridCandidate {
  const axes: AxisCandidate[] = labels.map((label, index) => ({
    label,
    positionPt: index,
  }))
  return {
    direction,
    axes,
    spansMm: Array.from({ length: Math.max(0, labels.length - 1) }, () => 6000),
    scalePtPerMm: 1,
    totalConfirmed: false,
  }
}

function block(placements: MemberPlacement[]): PlanBlock {
  return {
    title: '2階床伏図1/100',
    xGrid: axis('X', ['X1', 'X2']),
    yGrid: axis('Y', ['Y1', 'Y2', 'Y3']),
    placements,
    unplacedMarks: [],
  }
}

function syntheticColumnPage(story: string): TextPage {
  return {
    widthPt: 300,
    heightPt: 180,
    items: [
      { str: '柱リスト', x: 10, y: 5, w: 40, h: 8 },
      { str: '符号', x: 10, y: 20, w: 20, h: 8 },
      { str: 'C1', x: 120, y: 20, w: 12, h: 8 },
      { str: story, x: 10, y: 32, w: 30, h: 8 },
      { str: '主筋', x: 10, y: 44, w: 20, h: 8 },
      { str: '16-D25', x: 100, y: 44, w: 36, h: 8 },
      { str: '帯筋', x: 10, y: 56, w: 20, h: 8 },
      { str: 'D13-@100', x: 100, y: 56, w: 48, h: 8 },
    ],
  }
}

function onlyCandidate(page: TextPage): SectionCandidate {
  const list = parseSectionLists(page).find((entry) => entry.listKind === '柱リスト')
  assert.ok(list, 'synthetic 柱リスト was not detected')
  const candidate = list.candidates.find((entry) => entry.mark === 'C1')
  assert.ok(candidate, 'synthetic C1 was not detected')
  return candidate
}

const runtime = {
  silentDefault: (() => {
    const initial = createSampleProject()
    const initialStoryId = initial.stories[0]?.id ?? ''
    const elevation: ElevationCandidate = {
      titles: ['1階軸組図'],
      levels: [
        { labels: ['1FL'], positionPt: 0 },
        { labels: ['RCL'], positionPt: 1 },
      ],
      heightsMm: [4200],
      scalePtPerMm: 1,
    }
    const replaced = applyElevation(initial, {
      candidate: elevation,
      topLevelIndex: 0,
      bottomLevelIndex: 1,
      discardMembers: true,
    })
    assert.equal(replaced.applied, 1)
    assert.deepEqual(replaced.project.stories.map(({ id }) => id), ['story-1'])

    // PlanImport의 useState는 초기 storyId('1F')를 유지한다. 그 상태로
    // elevation 반영 직후 평면 반영을 누르는 UI 순서를 직접 재현한다.
    const result = applyFramingPlan(replaced.project, {
      block: block([{ mark: 'C1', role: '格子点', ix: 0, iy: 0 }]),
      storyId: initialStoryId,
    })
    assert.equal(result.refusal, '階未指定')
    return {
      initialStoryId,
      storiesAfterElevation: replaced.project.stories.map(({ id }) => id),
      refusalAfterUsingStaleSelection: result.refusal,
    }
  })(),
  wallSlabTrap: (() => {
    const project = createSampleProject()
    const result = applyFramingPlan(project, {
      block: block([
        { mark: 'W1', role: '辺', ix: 0, iy: 0, axis: 'Y' },
        { mark: 'S1', role: 'ベイ', ix: 0, iy: 0 },
      ]),
      storyId: '1F',
      sectionStoryLabel: '2階',
    })

    assert.equal(result.applied, 0)
    assert.deepEqual(result.skipped, [
      { mark: 'W1', reason: '断面未登録' },
      { mark: 'S1', reason: '断面未登録' },
    ])
    assert.equal(
      project.sections.find((section) => section.mark === 'W1')?.storyLabel,
      undefined,
    )
    assert.equal(
      project.sections.find((section) => section.mark === 'S1')?.storyLabel,
      undefined,
    )
    return {
      applied: result.applied,
      skipped: result.skipped,
      wallStoryLabel: project.sections.find((section) => section.mark === 'W1')?.storyLabel,
      slabStoryLabel: project.sections.find((section) => section.mark === 'S1')?.storyLabel,
    }
  })(),
  titleNormalization: (() => {
    const source = readFixture('yokohama-p7.json')
    const sourceRows = recoverRows(source.items)
    const sourceTitle = sourceRows
      .flatMap((row) => row.segments)
      .find((segment) => segment.compact.includes('2階床伏図'))
    assert.ok(sourceTitle, 'source title segment was not detected')
    const changedItem = sourceTitle.items[0]
    assert.ok(changedItem, 'source title has no text item')
    const changedItems = source.items.map((item) =>
      item === changedItem ? { ...item, str: ` ${item.str}` } : item,
    )
    const changedRawTitle = sourceTitle.items
      .map((item) => (item === changedItem ? ` ${item.str}` : item.str))
      .join('')
    const parsed = parseFramingPlan({ ...source, items: changedItems })
    const title = parsed.blocks.find((entry) => entry.title?.includes('2階床伏図'))?.title
    assert.equal(title, compact(changedRawTitle))
    assert.notEqual(title, changedRawTitle)
    return { rawTitle: changedRawTitle, parsedTitle: title }
  })(),
  storyPattern: (() => {
    const recognized = ['RF', 'R階', '2F', '2階']
    const unrecognized = ['B1F', '地下2階', 'PH', '塔屋']
    const recognizedResults = recognized.map((story) => ({
      story,
      parsed: onlyCandidate(syntheticColumnPage(story)).storyLabel,
    }))
    const unrecognizedResults = unrecognized.map((story) => ({
      story,
      parsed: onlyCandidate(syntheticColumnPage(story)).storyLabel,
    }))
    assert.deepEqual(
      recognizedResults.map(({ parsed }) => parsed),
      recognized,
    )
    assert.deepEqual(
      unrecognizedResults.map(({ parsed }) => parsed),
      unrecognized.map(() => undefined),
    )
    return { recognized: recognizedResults, unrecognized: unrecognizedResults }
  })(),
  rawStoryEquality: (() => {
    const base = createSampleProject()
    const project = {
      ...base,
      sections: base.sections.map((section) =>
        section.kind === '柱' && section.mark === 'C1'
          ? { ...section, storyLabel: 'RF' }
          : section,
      ),
    }
    const result = applyFramingPlan(project, {
      block: block([{ mark: 'C1', role: '格子点', ix: 0, iy: 0 }]),
      storyId: '1F',
      sectionStoryLabel: 'R階',
    })
    assert.equal(result.applied, 0)
    assert.deepEqual(result.skipped, [{ mark: 'C1', reason: '断面未登録' }])
    return { sectionStoryLabel: 'RF', requestedStoryLabel: 'R階', skipped: result.skipped }
  })(),
  storyShape: (() => {
    const project = createSampleProject()
    const keys = Object.keys(project.stories[0] ?? {}).sort()
    assert.deepEqual(keys, ['height', 'id', 'name'])
    assert.equal('level' in (project.stories[0] ?? {}), false)
    return { storyKeys: keys, hasLevelField: false }
  })(),
  parserWallSlabCandidates: (() => {
    const pages = ['ojkk-p4.json', 'yokohama-p15.json'].map(readFixture)
    const candidates = pages
      .flatMap((page) => parseSectionLists(page))
      .filter(({ listKind }) => listKind === '壁リスト' || listKind === 'スラブリスト')
      .flatMap(({ listKind, candidates: entries }) =>
        entries.map((entry) => ({ listKind, mark: entry.mark, storyLabel: entry.storyLabel })),
      )
    assert.ok(candidates.length > 0, 'wall/slab fixture candidates were not detected')
    assert.ok(candidates.every(({ storyLabel }) => storyLabel === undefined))
    return candidates
  })(),
}

console.log(JSON.stringify(runtime, null, 2))
