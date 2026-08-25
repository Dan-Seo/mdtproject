import { describe, expect, it } from 'vitest'

import type { Section } from '@/domain/model/member'
import type { Project } from '@/domain/model/project'
import { createSampleProject } from '@/domain/model/sample-project'

import type { TextItem, TextPage } from '../section-list/types'

import { applyElevation, applyFramingPlan } from './apply'
import { parseFramingPlan } from './parse'
import type {
  ElevationCandidate,
  PlanBlock,
  PlanGridCandidate,
} from './types'

// 断面은 손으로 짓지 않고 샘플 案件에서 빌린다 — 손으로 지으면 스키마가 자라날 때
// 이 테스트만 옛 모양으로 남고, 그 사실을 vitest는 알려주지 않는다 (tsc가 잡는다)
const sample = createSampleProject()

function sectionOf(kind: Section['kind'], mark: string): Section {
  const source = sample.sections.find((section) => section.kind === kind)
  if (!source) throw new Error(`sample has no ${kind} section`)
  return { ...source, id: `sec-${mark}`, mark }
}

function sectionWithStory(
  kind: Section['kind'],
  mark: string,
  storyLabel: string | undefined,
  id = `sec-${mark}-${storyLabel ?? 'none'}`,
): Section {
  return { ...sectionOf(kind, mark), id, storyLabel }
}

const columnSection = (mark: string) => sectionOf('柱', mark)
const girderSection = (mark: string) => sectionOf('大梁', mark)

function h(str: string, x: number, y: number): TextItem {
  return { str, x, y, w: 0, h: 8 }
}

function v(str: string, x: number, y: number): TextItem {
  return { str, x, y, w: 8, h: 0, rot: -90 }
}

function framingItems(
  xSpanMm: number,
  ySpanMm: number,
  xOffsetPt = 0,
): TextItem[] {
  return [
    h('X1', xOffsetPt, -40),
    h('X2', xOffsetPt + 200, -40),
    h(String(xSpanMm), xOffsetPt + 100, -20),
    h('Y1', xOffsetPt - 40, 0),
    h('Y2', xOffsetPt - 40, 200),
    v(String(ySpanMm), xOffsetPt - 20, 100),
  ]
}

function framingPage(xSpanMm: number, ySpanMm: number): TextPage {
  return {
    widthPt: 1000,
    heightPt: 1000,
    items: framingItems(xSpanMm, ySpanMm),
  }
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    schemaVersion: 11,
    name: 'test',
    grid: { xSpans: [6000], ySpans: [6000] },
    stories: [{ id: 'story-1', name: '1F', height: 4000 }],
    sections: [],
    members: [],
    ...overrides,
  }
}

const xGrid: PlanGridCandidate = {
  direction: 'X',
  axes: [
    { label: 'X1', positionPt: 0 },
    { label: 'X2', positionPt: 200 },
    { label: 'X3', positionPt: 400 },
  ],
  spansMm: [7000, 7000],
  scalePtPerMm: 200 / 7000,
  totalConfirmed: false,
}

const yGrid: PlanGridCandidate = {
  direction: 'Y',
  axes: [
    { label: 'Y1', positionPt: 0 },
    { label: 'Y2', positionPt: 200 },
  ],
  spansMm: [5000],
  scalePtPerMm: 200 / 5000,
  totalConfirmed: false,
}

function block(overrides: Partial<PlanBlock> = {}): PlanBlock {
  return {
    xGrid,
    yGrid,
    placements: [],
    unplacedMarks: [],
    ...overrides,
  }
}

describe('applyFramingPlan', () => {
  it('同じ符号の断面が複数階にあれば階指定なしで反映しない', () => {
    const result = applyFramingPlan(
      project({
        sections: [
          sectionWithStory('柱', 'C1', '1階'),
          sectionWithStory('柱', 'C1', '2階'),
        ],
      }),
      {
        block: block({
          placements: [{ mark: 'C1', role: '格子点', ix: 1, iy: 1 }],
        }),
        storyId: 'story-1',
      },
    )

    expect(result.applied).toBe(0)
    expect(result.skipped).toEqual([
      { mark: 'C1', reason: '断面複数該当' },
    ])
  })

  it('断面の階ラベルを厳密に指定すれば該当する断面だけを反映する', () => {
    const result = applyFramingPlan(
      project({
        sections: [
          sectionWithStory('柱', 'C1', '1階'),
          sectionWithStory('柱', 'C1', '2階'),
        ],
      }),
      {
        block: block({
          placements: [{ mark: 'C1', role: '格子点', ix: 1, iy: 1 }],
        }),
        storyId: 'story-1',
        sectionStoryLabel: '2階',
      },
    )

    expect(result.applied).toBe(1)
    expect(result.project.members[0]?.sectionId).toBe('sec-C1-2階')
  })

  it('指定した階ラベルの断面がなければ未登録として残す', () => {
    const result = applyFramingPlan(
      project({
        sections: [sectionWithStory('柱', 'C1', '1階')],
      }),
      {
        block: block({
          placements: [{ mark: 'C1', role: '格子点', ix: 1, iy: 1 }],
        }),
        storyId: 'story-1',
        sectionStoryLabel: '3階',
      },
    )

    expect(result.applied).toBe(0)
    expect(result.skipped).toEqual([{ mark: 'C1', reason: '断面未登録' }])
  })

  it('同じ符号と同じ階ラベルの重複断面も選べない', () => {
    const result = applyFramingPlan(
      project({
        sections: [
          sectionWithStory('柱', 'C1', '2階', 'sec-C1-2階-a'),
          sectionWithStory('柱', 'C1', '2階', 'sec-C1-2階-b'),
        ],
      }),
      {
        block: block({
          placements: [{ mark: 'C1', role: '格子点', ix: 1, iy: 1 }],
        }),
        storyId: 'story-1',
        sectionStoryLabel: '2階',
      },
    )

    expect(result.applied).toBe(0)
    expect(result.skipped).toEqual([
      { mark: 'C1', reason: '断面複数該当' },
    ])
  })

  it('階ラベルを正規化せず原文どおりに比較する', () => {
    const result = applyFramingPlan(
      project({
        sections: [sectionWithStory('柱', 'C1', '2階')],
      }),
      {
        block: block({
          placements: [{ mark: 'C1', role: '格子点', ix: 1, iy: 1 }],
        }),
        storyId: 'story-1',
        sectionStoryLabel: '2F',
      },
    )

    expect(result.applied).toBe(0)
    expect(result.skipped).toEqual([{ mark: 'C1', reason: '断面未登録' }])
  })

  it('階ラベル이 없는 단면은 지정된 층의 후보로 취급하지 않는다', () => {
    const result = applyFramingPlan(
      project({
        sections: [
          sectionWithStory('柱', 'C1', undefined, 'sec-C1-no-story'),
          sectionWithStory('柱', 'C1', '2階'),
        ],
      }),
      {
        block: block({
          placements: [{ mark: 'C1', role: '格子点', ix: 1, iy: 1 }],
        }),
        storyId: 'story-1',
        sectionStoryLabel: '2階',
      },
    )

    expect(result.applied).toBe(1)
    expect(result.project.members[0]?.sectionId).toBe('sec-C1-2階')
  })

  it('여러 伏図 중 두 번째 블록은 두 번째 도면의 X·Y 通り芯을 구별해 취입한다', () => {
    const plans = [framingPage(6000, 5000), framingPage(8000, 7000)].map(
      parseFramingPlan,
    )
    const blocks = plans.flatMap((plan) => plan.blocks)
    if (!blocks[1]) {
      throw new Error('synthetic framing plans were not parsed')
    }

    const result = applyFramingPlan(project(), {
      block: blocks[1],
      storyId: 'story-1',
    })

    expect(result.project.grid.xSpans).toEqual([8000])
    expect(result.project.grid.ySpans).toEqual([7000])
    expect(result.refusal).toBeUndefined()
    expect(result.skipped).toEqual([])
  })

  it('한 페이지의 스팬이 다른 伏図 두 장은 각 블록의 X·Y 通り芯으로 취입한다', () => {
    const parsed = parseFramingPlan({
      widthPt: 1400,
      heightPt: 1000,
      items: [
        ...framingItems(6000, 5000),
        ...framingItems(8000, 7000, 600),
      ],
    })

    expect(parsed.blocks).toHaveLength(2)
    expect(parsed.blocks.map((candidate) => candidate.xGrid.spansMm)).toEqual([
      [6000],
      [8000],
    ])
    expect(parsed.blocks.map((candidate) => candidate.yGrid.spansMm)).toEqual([
      [5000],
      [7000],
    ])

    const appliedGrids = parsed.blocks.map(
      (candidate) =>
        applyFramingPlan(project(), {
          block: candidate,
          storyId: 'story-1',
        }).project.grid,
    )
    expect(appliedGrids).toEqual([
      {
        xSpans: [6000],
        ySpans: [5000],
        xLabels: ['X1', 'X2'],
        yLabels: ['Y1', 'Y2'],
      },
      {
        xSpans: [8000],
        ySpans: [7000],
        xLabels: ['X1', 'X2'],
        yLabels: ['Y1', 'Y2'],
      },
    ])
  })

  it('通り芯을 도면의 스팬으로 바꾼다', () => {
    const result = applyFramingPlan(project(), {
      block: block(),
      storyId: 'story-1',
    })
    expect(result.project.grid).toEqual({
      xSpans: [7000, 7000],
      ySpans: [5000],
      xLabels: ['X1', 'X2', 'X3'],
      yLabels: ['Y1', 'Y2'],
    })
    expect(result.refusal).toBeUndefined()
  })

  it('通り芯의 이름을 도면에서 읽은 원문 그대로 싣는다', () => {
    // 이것이 R13(端部 좌우 비대칭)의 선결 조건이다 — 이름이 있어야 도면의
    // 「Y3端／Y4端」을 런의 실제 방향과 맞출 수 있다
    const result = applyFramingPlan(project(), {
      block: block(),
      storyId: 'story-1',
    })
    expect(result.project.grid.xLabels).toEqual(['X1', 'X2', 'X3'])
    expect(result.project.grid.yLabels).toEqual(['Y1', 'Y2'])
  })

  it('이름만 다른 그리드는 「바뀌었다」로 보지 않는다', () => {
    // 라벨은 数量도 격자 index도 바꾸지 않는다 — 이름 때문에 다른 층을 버리라는
    // 물음이 뜨면 사용자는 이유를 알 수 없다
    const base = project({
      grid: { xSpans: [7000, 7000], ySpans: [5000] },
      sections: [columnSection('C1')],
      members: [
        {
          id: 'm1',
          kind: '柱',
          memberClass: '躯体',
          sectionId: 'sec-C1',
          storyId: 'story-2',
          position: { ix: 1, iy: 1 },
        },
      ],
      stories: [
        { id: 'story-1', name: '1F', height: 4000 },
        { id: 'story-2', name: '2F', height: 4000 },
      ],
    })

    const result = applyFramingPlan(base, {
      block: block(),
      storyId: 'story-1',
    })
    expect(result.refusal).toBeUndefined()
    expect(result.project.grid.xLabels).toEqual(['X1', 'X2', 'X3'])
    expect(result.project.members).toHaveLength(1)
  })

  it('다른 층에 부재가 있는데 通り芯이 바뀌면 통째로 거부한다', () => {
    // 격자 index는 스팬 배열에 매여 있다 — 스팬을 바꾸면 손대지 않은 층의
    // 부재가 조용히 다른 자리로 옮겨간다. 이 제품이 못 견디는 실패다
    const existing = project({
      sections: [columnSection('C1')],
      members: [
        {
          id: 'm1',
          kind: '柱',
          memberClass: '躯体',
          sectionId: 'sec-C1',
          storyId: 'story-2',
          position: { ix: 1, iy: 1 },
        },
      ],
      stories: [
        { id: 'story-1', name: '1F', height: 4000 },
        { id: 'story-2', name: '2F', height: 4000 },
      ],
    })

    const result = applyFramingPlan(existing, {
      block: block(),
      storyId: 'story-1',
    })
    expect(result.refusal).toBe('他階部材あり通り芯変更不可')
    expect(result.project).toBe(existing)
  })

  it('취입하는 층의 부재는 갈아 끼운다 — 두 번 눌러도 겹치지 않는다', () => {
    const base = project({ sections: [columnSection('C1')] })
    const options = {
      block: block({
        placements: [{ mark: 'C1', role: '格子点' as const, ix: 1, iy: 1 }],
      }),
      storyId: 'story-1',
    }

    const once = applyFramingPlan(base, options)
    const twice = applyFramingPlan(once.project, options)
    expect(once.project.members).toHaveLength(1)
    expect(twice.project.members).toHaveLength(1)
    expect(once.applied).toBe(1)
  })

  it('같은 격자점에서 X·Y 방향으로 뻗는 같은 符号의 大梁을 모두 남긴다', () => {
    const result = applyFramingPlan(project({ sections: [girderSection('G1')] }), {
      block: block({
        placements: [
          { mark: 'G1', role: '辺', ix: 0, iy: 0, axis: 'X' },
          { mark: 'G1', role: '辺', ix: 0, iy: 0, axis: 'Y' },
        ],
      }),
      storyId: 'story-1',
    })

    expect(result.applied).toBe(2)
    expect(result.project.members.map((member) => member.position)).toEqual([
      { axis: 'X', ix: 0, iy: 0 },
      { axis: 'Y', ix: 0, iy: 0 },
    ])
  })

  it('같은 방향의 같은 大梁 배치가 블록에 두 번 들어오면 하나로 접는다', () => {
    const placement = {
      mark: 'G1',
      role: '辺' as const,
      ix: 0,
      iy: 0,
      axis: 'X' as const,
    }
    const result = applyFramingPlan(project({ sections: [girderSection('G1')] }), {
      block: block({ placements: [placement, placement] }),
      storyId: 'story-1',
    })

    expect(result.applied).toBe(1)
    expect(result.project.members).toHaveLength(1)
  })

  it('格子点의 柱를 ColumnPosition으로 넣는다', () => {
    const result = applyFramingPlan(project({ sections: [columnSection('C1')] }), {
      block: block({
        placements: [{ mark: 'C1', role: '格子点', ix: 2, iy: 1 }],
      }),
      storyId: 'story-1',
    })
    expect(result.project.members).toEqual([
      {
        id: 'story-1-C1-2-1',
        kind: '柱',
        memberClass: '躯体',
        sectionId: 'sec-C1',
        storyId: 'story-1',
        position: { ix: 2, iy: 1 },
      },
    ])
  })

  it('辺의 大梁를 GirderPosition으로 넣는다 — axis를 그대로 옮긴다', () => {
    const result = applyFramingPlan(project({ sections: [girderSection('G1')] }), {
      block: block({
        placements: [{ mark: 'G1', role: '辺', ix: 0, iy: 1, axis: 'X' }],
      }),
      storyId: 'story-1',
    })
    expect(result.project.members[0]?.position).toEqual({
      axis: 'X',
      ix: 0,
      iy: 1,
    })
  })

  it('断面一覧에 없는 符号은 넣지 않고 사유와 함께 남긴다', () => {
    const result = applyFramingPlan(project(), {
      block: block({
        placements: [{ mark: 'C9', role: '格子点', ix: 0, iy: 0 }],
      }),
      storyId: 'story-1',
    })
    expect(result.project.members).toEqual([])
    expect(result.skipped).toEqual([{ mark: 'C9', reason: '断面未登録' }])
  })

  it('種別과 자리가 어긋나면 넣지 않는다 — 柱를 辺에 놓지 않는다', () => {
    const result = applyFramingPlan(project({ sections: [columnSection('C1')] }), {
      block: block({
        placements: [{ mark: 'C1', role: '辺', ix: 0, iy: 0, axis: 'X' }],
      }),
      storyId: 'story-1',
    })
    expect(result.project.members).toEqual([])
    expect(result.skipped).toEqual([{ mark: 'C1', reason: '部材種別相違' }])
  })

  it('격자 밖을 가리키는 배치는 넣지 않는다', () => {
    // 도면의 通り芯 수와 취입하는 그리드가 어긋난 경우 — 지어내지 않는다
    const result = applyFramingPlan(project({ sections: [columnSection('C1')] }), {
      block: block({
        placements: [{ mark: 'C1', role: '格子点', ix: 3, iy: 0 }],
      }),
      storyId: 'story-1',
    })
    expect(result.project.members).toEqual([])
    expect(result.skipped).toEqual([{ mark: 'C1', reason: '格子外' }])
  })

  it('Y方向의 辺이 마지막 Y格子点에서 뻗으면 格子外로 남긴다', () => {
    const result = applyFramingPlan(project({ sections: [girderSection('G1')] }), {
      block: block({
        placements: [{ mark: 'G1', role: '辺', ix: 0, iy: 1, axis: 'Y' }],
      }),
      storyId: 'story-1',
    })
    expect(result.project.members).toEqual([])
    expect(result.skipped).toEqual([{ mark: 'G1', reason: '格子外' }])
  })

  it('없는 층을 가리키면 통째로 거부한다', () => {
    const base = project()
    const result = applyFramingPlan(base, {
      block: block(),
      storyId: 'story-9',
    })
    expect(result.refusal).toBe('階未指定')
    expect(result.project).toBe(base)
  })
})

describe('applyFramingPlan — 다른 층을 버리는 동의', () => {
  const existing = () =>
    project({
      sections: [columnSection('C1')],
      members: [
        {
          id: 'm1',
          kind: '柱',
          memberClass: '躯体',
          sectionId: 'sec-C1',
          storyId: 'story-2',
          position: { ix: 1, iy: 1 },
        },
      ],
      stories: [
        { id: 'story-1', name: '1F', height: 4000 },
        { id: 'story-2', name: '2F', height: 4000 },
      ],
    })

  it('동의하면 다른 층 부재를 남기지 않고 통째로 버린다', () => {
    const result = applyFramingPlan(existing(), {
      block: block({
        placements: [{ mark: 'C1', role: '格子点', ix: 1, iy: 1 }],
      }),
      storyId: 'story-1',
      discardOtherStories: true,
    })
    expect(result.refusal).toBeUndefined()
    // 반쯤 옮겨 놓느니 비운다 — 남기면 index가 다른 자리를 가리킨다
    expect(result.project.members.map((member) => member.storyId)).toEqual([
      'story-1',
    ])
  })

  it('通り芯이 그대로면 동의 없이도 다른 층을 건드리지 않는다', () => {
    const base = existing()
    const result = applyFramingPlan(base, {
      block: block({
        xGrid: { ...xGrid, spansMm: base.grid.xSpans },
        yGrid: { ...yGrid, spansMm: base.grid.ySpans },
      }),
      storyId: 'story-1',
    })
    expect(result.refusal).toBeUndefined()
    expect(result.project.members).toHaveLength(1)
  })
})

describe('applyElevation', () => {
  // 도면 순서는 위에서 아래다. 실물 yokohama p8이 이 모양이다 —
  // 맨 위는 라벨이 없는 パラペット 천단이고, 그 아래로 RCL·2FL·1FL·基礎下端이다.
  const candidate: ElevationCandidate = {
    titles: ['bY1通り軸組図1/100'],
    levels: [
      { labels: [], positionPt: 159 },
      { labels: ['中央棟RCL(水下)'], positionPt: 199 },
      { labels: ['2FL'], positionPt: 315 },
      { labels: ['中央棟1FL', '基準GL'], positionPt: 442 },
      { labels: ['基礎下端'], positionPt: 518 },
    ],
    heightsMm: [1400, 4100, 4480, 2690],
    scalePtPerMm: 0.02835,
  }

  it('고른 범위의 간격만 階가 되고, 아래에서 위로 쌓인다', () => {
    // 1FL(3)에서 RCL(1)까지 → 1階(4480)와 2階(4100). パラペット(1400)와
    // 基礎(2690)는 階가 아니므로 범위 밖이다
    const result = applyElevation(project(), {
      candidate,
      topLevelIndex: 1,
      bottomLevelIndex: 3,
    })
    expect(result.refusal).toBeUndefined()
    expect(result.project.stories.map((story) => story.height)).toEqual([
      4480, 4100,
    ])
  })

  it('階의 이름은 그 階의 바닥이 되는 레벨의 원문이다', () => {
    const result = applyElevation(project(), {
      candidate,
      topLevelIndex: 1,
      bottomLevelIndex: 3,
    })
    // 같은 높이에 라벨이 둘이면 둘 다 남긴다 — 하나를 고르지 않는다
    expect(result.project.stories.map((story) => story.name)).toEqual([
      '中央棟1FL／基準GL',
      '2FL',
    ])
  })

  it('라벨이 없는 레벨이 바닥이면 이름을 지어내지 않고 번호로 둔다', () => {
    const result = applyElevation(project(), {
      candidate,
      topLevelIndex: 0,
      bottomLevelIndex: 1,
    })
    expect(result.project.stories.map((story) => story.name)).toEqual([
      '中央棟RCL(水下)',
    ])
  })

  it('범위가 한 칸도 없으면 거부한다', () => {
    const base = project()
    const result = applyElevation(base, {
      candidate,
      topLevelIndex: 2,
      bottomLevelIndex: 2,
    })
    expect(result.refusal).toBe('階範囲不正')
    expect(result.project).toBe(base)
  })

  it('부재가 있으면 통째로 거부한다 — 階를 갈면 부재가 갈 곳을 잃는다', () => {
    const base = project({
      sections: [columnSection('C1')],
      members: [
        {
          id: 'm1',
          kind: '柱',
          memberClass: '躯体',
          sectionId: 'sec-C1',
          storyId: 'story-1',
          position: { ix: 0, iy: 0 },
        },
      ],
    })
    const result = applyElevation(base, {
      candidate,
      topLevelIndex: 1,
      bottomLevelIndex: 3,
    })
    expect(result.refusal).toBe('部材あり階置換不可')
    expect(result.project).toBe(base)
  })

  it('동의하면 부재를 버리고 階를 갈아 끼운다', () => {
    const base = project({
      sections: [columnSection('C1')],
      members: [
        {
          id: 'm1',
          kind: '柱',
          memberClass: '躯体',
          sectionId: 'sec-C1',
          storyId: 'story-1',
          position: { ix: 0, iy: 0 },
        },
      ],
    })
    const result = applyElevation(base, {
      candidate,
      topLevelIndex: 1,
      bottomLevelIndex: 3,
      discardMembers: true,
    })
    expect(result.refusal).toBeUndefined()
    expect(result.project.members).toEqual([])
    expect(result.project.stories).toHaveLength(2)
  })
})
