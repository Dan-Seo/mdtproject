import { describe, expect, it } from 'vitest'

import type { ColumnSection, GirderSection, Member } from './member'
import { createSampleProject } from './sample-project'
import {
  PROJECT_SCHEMA_VERSION,
  beamDepthAbove,
  columnEnds,
  deserializeProject,
  findSection,
  girderRun,
  girderSpan,
  girderSupportSections,
  gridPoint,
  gridPointCount,
  memberGroupKey,
  serializeProject,
  setNote,
  storyElevation,
  type Project,
  type Story,
} from './project'
import { MemberUnsupportedError } from './unsupported'
import { coverConditions } from '../rules/lookup'

const columnSection: ColumnSection = {
  id: 'section-C1',
  kind: '柱',
  mark: 'C1',
  b: 800,
  d: 800,
  fc: 24,
  grade: 'SD345',
  exposure: '屋外',
  finish: '仕上げなし',
  main: { size: 'D25', count: 12 },
  hoop: { size: 'D13', pitch: 100, startOffsetMm: 0 },
}

const shallowGirderSection: GirderSection = {
  id: 'section-G2',
  kind: '大梁',
  mark: 'G2',
  b: 400,
  depth: 700,
  fc: 24,
  grade: 'SD345',
  exposure: '屋外',
  finish: '仕上げなし',
  main: { size: 'D22', topCount: 4, bottomCount: 4 },
  stirrup: { size: 'D13', pitch: 150, startOffsetMm: 50 },
}

const deepGirderSection: GirderSection = {
  ...shallowGirderSection,
  id: 'section-G1',
  mark: 'G1',
  depth: 750,
}

const column: Member = {
  id: '1F-X2Y2',
  kind: '柱',
  memberClass: '躯体',
  sectionId: columnSection.id,
  storyId: '1F',
  position: { ix: 1, iy: 1 },
}

function createProject(members: Member[] = [column]): Project {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    name: 'テスト案件',
    grid: { xSpans: [6000, 6000], ySpans: [6000, 6000] },
    stories: [{ id: '1F', name: '1階', height: 4200 }],
    sections: [columnSection, shallowGirderSection, deepGirderSection],
    members,
  }
}

describe('storyElevation', () => {
  const stories: Story[] = [
    { id: '1F', name: '1階', height: 4200 },
    { id: '2F', name: '2階', height: 3800 },
    { id: '3F', name: '3階', height: 3800 },
  ]

  it('accumulates the heights of the stories below in array order', () => {
    expect(storyElevation(stories, '1F')).toBe(0)
    expect(storyElevation(stories, '2F')).toBe(4200)
    expect(storyElevation(stories, '3F')).toBe(8000)
  })

  it('returns 0 for the only story of a single-story project', () => {
    expect(storyElevation([stories[0]], '1F')).toBe(0)
  })

  it('throws on an unknown story id', () => {
    expect(() => storyElevation(stories, 'RF')).toThrow('Story not found: RF')
  })
})

describe('grid helpers', () => {
  it('returns grid point counts and cumulative coordinates in mm', () => {
    const grid = { xSpans: [1000, 2000], ySpans: [500] }

    expect(gridPointCount(grid)).toEqual({ nx: 3, ny: 2 })
    expect(gridPoint(grid, 2, 1)).toEqual({ x: 3000, y: 500 })
  })

  it.each([
    [-1, 0],
    [0, -1],
    [3, 0],
    [0, 3],
  ])('throws for an out-of-range grid index (%s, %s)', (ix, iy) => {
    expect(() => gridPoint(createProject().grid, ix, iy)).toThrow()
  })
})

describe('project lookup helpers', () => {
  it('finds a section and throws when the section is absent', () => {
    const project = createProject()

    expect(findSection(project, 'section-C1')).toEqual(columnSection)
    expect(() => findSection(project, 'missing')).toThrow()
  })

  it("uses Story.name, C/G and 符号 for the fixed group-key format", () => {
    expect(memberGroupKey(createProject(), column)).toBe('1階|C|C1')
  })

  it('returns the greatest depth among same-story 大梁 touching the 柱', () => {
    const members: Member[] = [
      column,
      {
        id: '1F-G2-X1Y2-X',
        kind: '大梁',
        memberClass: '躯体',
        sectionId: shallowGirderSection.id,
        storyId: '1F',
        position: { axis: 'X', ix: 0, iy: 1 },
      },
      {
        id: '1F-G1-X2Y2-Y',
        kind: '大梁',
        memberClass: '躯体',
        sectionId: deepGirderSection.id,
        storyId: '1F',
        position: { axis: 'Y', ix: 1, iy: 1 },
      },
      {
        id: '1F-G1-X1Y1-X',
        kind: '大梁',
        memberClass: '躯体',
        sectionId: deepGirderSection.id,
        storyId: '1F',
        position: { axis: 'X', ix: 0, iy: 0 },
      },
    ]

    expect(beamDepthAbove(createProject(members), column)).toBe(750)
  })

  it('throws when no same-story 大梁 touches the 柱', () => {
    expect(() => beamDepthAbove(createProject(), column)).toThrow()
  })
})

describe('girderSpan', () => {
  const rectangularColumnSection: ColumnSection = {
    ...columnSection,
    id: 'section-C-rectangular',
    mark: 'C-rectangular',
    b: 700,
    d: 900,
  }
  const narrowColumnSection: ColumnSection = {
    ...columnSection,
    id: 'section-C-narrow',
    mark: 'C-narrow',
    b: 600,
  }
  const wideColumnSection: ColumnSection = {
    ...columnSection,
    id: 'section-C-wide',
    mark: 'C-wide',
    b: 1000,
  }

  function supportColumn(
    id: string,
    sectionId: string,
    ix: number,
    iy: number,
  ): Member {
    return {
      id,
      kind: '柱',
      memberClass: '躯体',
      sectionId,
      storyId: '1F',
      position: { ix, iy },
    }
  }

  function girder(axis: 'X' | 'Y'): Member {
    return {
      id: `1F-G1-${axis}`,
      kind: '大梁',
      memberClass: '躯体',
      sectionId: deepGirderSection.id,
      storyId: '1F',
      position: { axis, ix: 0, iy: 0 },
    }
  }

  function spanProject(members: Member[]): Project {
    return {
      ...createProject(members),
      grid: { xSpans: [6000], ySpans: [6000] },
      sections: [
        columnSection,
        rectangularColumnSection,
        narrowColumnSection,
        wideColumnSection,
        shallowGirderSection,
        deepGirderSection,
      ],
    }
  }

  it('calculates the X-axis clear span between two 800 mm 柱 faces', () => {
    const member = girder('X')
    const project = spanProject([
      supportColumn('start', columnSection.id, 0, 0),
      supportColumn('end', columnSection.id, 1, 0),
      member,
    ])

    expect(girderSpan(project, member)).toEqual({
      axis: 'X',
      centerSpan: 6000,
      clear: 5200,
      startFaceOffsetMm: 400,
      endFaceOffsetMm: 400,
      startSupportLengthAlongAxisMm: 800,
      endSupportLengthAlongAxisMm: 800,
      startSupportCover: coverConditions(columnSection),
      endSupportCover: coverConditions(columnSection),
    })
  })

  it('uses d as the support length for a Y-axis girder', () => {
    const member = girder('Y')
    const project = spanProject([
      supportColumn('start', rectangularColumnSection.id, 0, 0),
      supportColumn('end', rectangularColumnSection.id, 0, 1),
      member,
    ])

    expect(girderSpan(project, member)).toEqual({
      axis: 'Y',
      centerSpan: 6000,
      clear: 5100,
      startFaceOffsetMm: 450,
      endFaceOffsetMm: 450,
      startSupportLengthAlongAxisMm: 900,
      endSupportLengthAlongAxisMm: 900,
      startSupportCover: coverConditions(rectangularColumnSection),
      endSupportCover: coverConditions(rectangularColumnSection),
    })
  })

  it('uses each end support dimension independently', () => {
    const member = girder('X')
    const project = spanProject([
      supportColumn('start', narrowColumnSection.id, 0, 0),
      supportColumn('end', wideColumnSection.id, 1, 0),
      member,
    ])

    expect(girderSpan(project, member)).toMatchObject({
      clear: 5200,
      startFaceOffsetMm: 300,
      endFaceOffsetMm: 500,
      startSupportLengthAlongAxisMm: 600,
      endSupportLengthAlongAxisMm: 1000,
    })
  })

  it('exposes both support 柱 sections without carrying viewer dimensions in GirderSpan', () => {
    const member = girder('Y')
    const project = spanProject([
      supportColumn('start', rectangularColumnSection.id, 0, 0),
      supportColumn('end', columnSection.id, 0, 1),
      member,
    ])

    expect(girderSupportSections(project, member)).toEqual({
      start: rectangularColumnSection,
      end: columnSection,
    })
  })

  it('throws when either end support 柱 is missing', () => {
    const member = girder('X')
    const project = spanProject([
      supportColumn('start', columnSection.id, 0, 0),
      member,
    ])

    expect(() => girderSpan(project, member)).toThrow()
  })

  it('throws when passed a 柱 member', () => {
    const member = supportColumn('start', columnSection.id, 0, 0)

    expect(() => girderSpan(spanProject([member]), member)).toThrow()
  })

  it('throws when the support faces leave no positive clear span', () => {
    const member = girder('X')
    const project: Project = {
      ...spanProject([
        supportColumn('start', columnSection.id, 0, 0),
        supportColumn('end', columnSection.id, 1, 0),
        member,
      ]),
      grid: { xSpans: [800], ySpans: [6000] },
    }

    // スパン 편집만으로 도달한다 — 페인을 죽이는 결함이 아니라 부재 단위
    // 미지원 판정으로 다뤄야 한다 (M3a).
    expect(() => girderSpan(project, member)).toThrow(MemberUnsupportedError)
    try {
      girderSpan(project, member)
    } catch (error) {
      expect((error as MemberUnsupportedError).reason).toBe('寸法不成立')
    }
  })
})

describe('girderRun', () => {
  const sample = createSampleProject()

  function sampleGirder(id: string): Member {
    const member = sample.members.find((candidate) => candidate.id === id)
    if (member?.kind !== '大梁') throw new Error(`大梁 not found: ${id}`)
    return member
  }

  it('builds the maximum Y-axis chain in ascending axis order', () => {
    const run = girderRun(sample, sampleGirder('1F-G1-X1Y1-Y'))

    expect(run.axis).toBe('Y')
    expect(run.members.map(({ id }) => id)).toEqual([
      '1F-G1-X1Y1-Y',
      '1F-G1-X1Y2-Y',
    ])
    expect(run.ownerId).toBe('1F-G1-X1Y1-Y')
    expect(run.spans).toHaveLength(2)
  })

  it('represents an X-axis single span as a length-one run', () => {
    const run = girderRun(sample, sampleGirder('1F-G1-X1Y1-X'))

    expect(run.axis).toBe('X')
    expect(run.members.map(({ id }) => id)).toEqual(['1F-G1-X1Y1-X'])
    expect(run.spans).toHaveLength(1)
  })

  it('finds the same maximum chain when started from its other member', () => {
    const first = girderRun(sample, sampleGirder('1F-G1-X1Y1-Y'))
    const second = girderRun(sample, sampleGirder('1F-G1-X1Y2-Y'))

    expect(second).toEqual(first)
  })

  it('accumulates clear spans and the intermediate 柱 axis dimension', () => {
    const run = girderRun(sample, sampleGirder('1F-G1-X1Y1-Y'))

    expect(run.spans.map(({ clear }) => clear)).toEqual([5200, 5200])
    expect(run.coreLengthMm).toBe(5200 * 2 + 800)
    expect(run.coreLengthMm).toBe(11200)
  })

  it('throws a plain Error when adjacent run members use mixed sections', () => {
    const first = sampleGirder('1F-G1-X1Y1-Y')
    const second = sampleGirder('1F-G1-X1Y2-Y')
    const mixed: Project = {
      ...sample,
      members: sample.members.map((candidate) =>
        candidate.id === second.id
          ? { ...candidate, sectionId: 'section-G2' }
          : candidate,
      ),
    }

    expect(() => girderRun(mixed, first)).toThrow(Error)
    expect(() => girderRun(mixed, first)).not.toThrow(MemberUnsupportedError)
  })
})

describe('project serialization', () => {
  it('round-trips a Project with deep equality', () => {
    const project = createProject()

    expect(deserializeProject(serializeProject(project))).toEqual(project)
  })

  it('throws when schemaVersion does not match', () => {
    const project = createProject()
    const incompatible = JSON.stringify({
      ...project,
      schemaVersion: PROJECT_SCHEMA_VERSION + 1,
    })

    expect(() => deserializeProject(incompatible)).toThrow()
  })

  it('round-trips 備考 notes', () => {
    const project = setNote(createProject(), '1階|C|C1|主筋', '要確認')

    expect(deserializeProject(serializeProject(project))).toEqual(project)
  })
})

describe('columnEnds', () => {
  function stackColumn(storyId: string, ix: number, iy: number): Member {
    return {
      id: `${storyId}-X${ix + 1}Y${iy + 1}`,
      kind: '柱',
      memberClass: '躯体',
      sectionId: 'section-C1',
      storyId,
      position: { ix, iy },
    }
  }

  function stackProject(members: Member[]): Project {
    return {
      ...createProject(members),
      stories: [
        { id: '1F', name: '1階', height: 4200 },
        { id: '2F', name: '2階', height: 3600 },
      ],
    }
  }

  const twoStories = [
    stackColumn('1F', 1, 1),
    stackColumn('2F', 1, 1),
  ]

  it('anchors into the foundation at the lowest story and hands the joint upwards', () => {
    const project = stackProject(twoStories)

    expect(columnEnds(project, twoStories[0])).toEqual({
      bottom: '定着',
      top: 'なし',
    })
  })

  it('makes the upper column carry the 継手 and anchor at the roof', () => {
    const project = stackProject(twoStories)

    expect(columnEnds(project, twoStories[1])).toEqual({
      bottom: '継手',
      top: '定着',
    })
  })

  it('anchors at both ends when the column stands alone in its stack', () => {
    const project = stackProject([twoStories[0]])

    expect(columnEnds(project, twoStories[0])).toEqual({
      bottom: '定着',
      top: '定着',
    })
  })

  it('ignores a column that sits on a different grid point', () => {
    const project = stackProject([
      stackColumn('1F', 1, 1),
      stackColumn('2F', 0, 0),
    ])

    expect(columnEnds(project, stackColumn('1F', 1, 1))).toEqual({
      bottom: '定着',
      top: '定着',
    })
  })

  it('reads the stack order from the stories array', () => {
    const reversed: Project = {
      ...stackProject(twoStories),
      stories: [
        { id: '2F', name: '2階', height: 3600 },
        { id: '1F', name: '1階', height: 4200 },
      ],
    }

    // 배열이 뒤집히면 2F가 최하층으로 해석된다 — 순서가 곧 스택이다.
    expect(columnEnds(reversed, twoStories[1]).bottom).toBe('定着')
    expect(columnEnds(reversed, twoStories[0]).bottom).toBe('継手')
  })

  it('rejects a member that is not a 柱', () => {
    const beam: Member = {
      id: '1F-G1-X1Y1-X',
      kind: '大梁',
      memberClass: '躯体',
      sectionId: shallowGirderSection.id,
      storyId: '1F',
      position: { axis: 'X', ix: 0, iy: 0 },
    }

    expect(() => columnEnds(stackProject(twoStories), beam)).toThrow()
  })
})

describe('setNote', () => {
  it('stores a note without mutating the original Project', () => {
    const project = createProject()
    const next = setNote(project, '1階|C|C1|主筋', '要確認')

    expect(next.notes).toEqual({ '1階|C|C1|主筋': '要確認' })
    expect(project.notes).toBeUndefined()
  })

  it('replaces an existing note for the same line', () => {
    const project = setNote(createProject(), '1階|C|C1|主筋', '要確認')
    const next = setNote(project, '1階|C|C1|主筋', '確認済')

    expect(next.notes).toEqual({ '1階|C|C1|主筋': '確認済' })
  })

  it('drops the key when the note is cleared so empty strings do not pile up', () => {
    const project = setNote(createProject(), '1階|C|C1|主筋', '要確認')
    const next = setNote(project, '1階|C|C1|主筋', '')

    expect(next.notes).toEqual({})
  })

  it('keeps notes for other lines untouched', () => {
    const project = setNote(createProject(), '1階|C|C1|主筋', '要確認')
    const next = setNote(project, '1階|C|C1|帯筋', 'ピッチ確認')

    expect(next.notes).toEqual({
      '1階|C|C1|主筋': '要確認',
      '1階|C|C1|帯筋': 'ピッチ確認',
    })
  })
})
