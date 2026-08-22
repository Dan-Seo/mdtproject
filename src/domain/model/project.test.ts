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
  shape: '矩形',
  b: 800,
  d: 800,
  fc: 24,
  grade: 'SD345',
  exposure: '屋外',
  finish: '仕上げなし',
  spliceMethod: '重ね継手',
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
  spliceMethod: '重ね継手',
  main: {
    size: 'D22',
    top: { endCount: 4, centerCount: 4 },
    bottom: { endCount: 4, centerCount: 4 },
    cutoffFromSupportFaceMm: 0,
  },
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

  // 階 라벨은 断面リスト 취입으로 도면에서 들어오는 값이라 메시지에 맨몸으로
  // 싣지 않고 JSON 블록으로 감싼다. 원래는 텔레메트리 스크러버(블랙리스트)가
  // letter+digit 토큰을 룰팩 상수로 오인해 통과시키는 것을 피하려는 조치였다.
  // ADR-020이 허용목록으로 바뀌어 예외 message 자체가 안 나가므로 그 결합은
  // 사라졌다 — 이 모양을 되돌리는 것은 별건이다.
  it('throws on an unknown story id with the id wrapped as a JSON block', () => {
    expect(() => storyElevation(stories, 'RF')).toThrow(
      'Story not found: {"storyId":"RF"}',
    )
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

  it('places each span start in the run frame', () => {
    // あばら筋은 각 부재 자기 스팬 로컬(0 기준)이라, 런을 한 프레임에 그리는 쪽이
    // 이 오프셋 없이는 2번째 스팬 스터럽을 1번째 스팬 위에 겹쳐 그린다.
    const run = girderRun(sample, sampleGirder('1F-G1-X1Y1-Y'))

    expect(run.memberOffsetsMm).toEqual([0, 5200 + 800])
    expect(run.memberOffsetsMm).toHaveLength(run.members.length)
    // 오프셋과 코어 길이는 같은 누적에서 나와야 한다 — 따로 세면 곧 어긋난다.
    expect(
      run.memberOffsetsMm[run.memberOffsetsMm.length - 1] +
        run.spans[run.spans.length - 1].clear,
    ).toBe(run.coreLengthMm)
  })

  it('starts a single-span run at the origin', () => {
    const run = girderRun(sample, sampleGirder('1F-G1-X1Y1-X'))

    expect(run.memberOffsetsMm).toEqual([0])
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

  // 取り込む案件は他人が作った文字列だ。schemaVersion だけを見て通すと、
  // 形の違う JSON が Project として奥まで入り、数量が NaN になるか画面が落ちる。
  it.each([
    ['stories が空', { stories: [] }],
    ['stories が配列でない', { stories: null }],
    ['階高が数でない', { stories: [{ id: '1F', name: '1階', height: '4200' }] }],
    ['案件名が数', { name: 42 }],
    ['スパンに数でないものが混ざる', { grid: { xSpans: [6000, '6000'], ySpans: [6000] } }],
    ['grid が無い', { grid: undefined }],
    ['断面の符号が数', { sections: [{ id: 'x', kind: '柱', mark: 1, b: 800 }] }],
    // 判別子が union の外なら、形は通っても断面の枝分かれを選べない。
    ['断面の kind が実在しない', { sections: [{ id: 'x', kind: '壁', mark: 'W1', b: 200 }] }],
    // せい は種別で鍵が違う。共通の場所だけ見て通すと、帯筋の加工寸法が
    // NaN になり、内訳書の行・階小計・径別集計・合計がそのまま NaN kg で出る。
    ['柱断面にせい (d) が無い', { sections: [{ id: 'x', kind: '柱', mark: 'C1', b: 800 }] }],
    [
      '大梁断面のせい (depth) が文字列',
      { sections: [{ id: 'x', kind: '大梁', mark: 'G1', b: 400, depth: '800' }] },
    ],
    // 鍵を取り違えた断面も通してはいけない — 柱 に depth だけあっても d は無い。
    [
      '柱断面が depth を持つ',
      { sections: [{ id: 'x', kind: '柱', mark: 'C1', b: 800, depth: 800 }] },
    ],
    // 配筋の入力が欠ければ generateColumnRebar の中で TypeError になる —
    // 何が足りないか言えないままペインが落ちる。
    [
      '柱断面に主筋が無い',
      { sections: [{ id: 'x', kind: '柱', mark: 'C1', b: 800, d: 800 }] },
    ],
    [
      '帯筋のピッチが文字列',
      {
        sections: [
          {
            id: 'x',
            kind: '柱',
            mark: 'C1',
            b: 800,
            d: 800,
            main: { size: 'D25', count: 12 },
            hoop: { size: 'D13', pitch: '100', startOffsetMm: 50 },
          },
        ],
      },
    ],
    [
      '大梁断面にあばら筋が無い',
      {
        sections: [
          {
            id: 'x',
            kind: '大梁',
            mark: 'G1',
            b: 400,
            depth: 800,
            main: {
              size: 'D25',
              top: { endCount: 4, centerCount: 2 },
              bottom: { endCount: 2, centerCount: 4 },
              cutoffFromSupportFaceMm: 1000,
            },
          },
        ],
      },
    ],
    [
      '大梁主筋の上端行が無い',
      {
        sections: [
          {
            id: 'x',
            kind: '大梁',
            mark: 'G1',
            b: 400,
            depth: 800,
            main: { size: 'D25', cutoffFromSupportFaceMm: 1000 },
            stirrup: { size: 'D13', pitch: 200, startOffsetMm: 50 },
          },
        ],
      },
    ],
    // position が無ければ buildingLayout の `'axis' in member.position` が落ちる。
    [
      '部材に位置が無い',
      { members: [{ id: 'm', kind: '柱', sectionId: 's', storyId: '1F' }] },
    ],
    // 軸を緩く取ると三項演算子で Y に落ち、図面に無い向きの大梁ができる。
    [
      '大梁の軸が X・Y でない',
      {
        members: [
          {
            id: 'm',
            kind: '大梁',
            sectionId: 's',
            storyId: '1F',
            position: { axis: 'Z', ix: 0, iy: 0 },
          },
        ],
      },
    ],
    ['部材の kind が無い', { members: [{ id: 'm', sectionId: 's', storyId: '1F' }] }],
    ['部材の階 id が無い', { members: [{ id: 'm', kind: '柱', sectionId: 's' }] }],
    ['備考の値が文字列でない', { notes: { row: 3 } }],
    ['単位質量が数でない', { unitMass: { D13: '0.995' } }],
  ])('rejects a project whose shape is broken: %s', (_label, broken) => {
    const project = createProject()

    expect(() =>
      deserializeProject(JSON.stringify({ ...project, ...broken })),
    ).toThrow()
  })

  // 形だけ通って参照が切れている記録は、描画の途中で初めて落ちる —
  // その頃にはもう store に入っているので、「サンプルに戻る」が効かない。
  it.each([
    ['部材が実在しない断面を指す', 'sectionId'],
    ['部材が実在しない階を指す', 'storyId'],
  ])('rejects a project whose references are broken: %s', (_label, field) => {
    const project = createProject()
    const broken = {
      ...project,
      members: project.members.map((member, index) =>
        index === project.members.length - 1
          ? { ...member, [field]: 'nowhere' }
          : member,
      ),
    }

    expect(() => deserializeProject(JSON.stringify(broken))).toThrow()
  })

  it.each([
    ['柱がグリッドの外を指す', { ix: 99, iy: 0 }],
    ['グリッド添字が整数でない', { ix: 0.5, iy: 0 }],
    ['グリッド添字が負', { ix: -1, iy: 0 }],
  ])('rejects a project whose grid index is out of range: %s', (_l, position) => {
    // gridPoint は RangeError を投げ、全ペインが落ちる。しかもその案件を
    // 自動保存が書くので、次の訪問でも同じ所で落ちる。
    const project = createProject()
    const broken = {
      ...project,
      members: project.members.map((member, index) =>
        index === 0 ? { ...member, position } : member,
      ),
    }

    expect(() => deserializeProject(JSON.stringify(broken))).toThrow()
  })

  it('rejects a 大梁 that starts on the last グリッド line of its axis', () => {
    // 大梁は隣の交点まで伸びるので、その軸だけ一つ手前までだ。
    const project = createSampleProject()
    const girder = project.members.find(
      (member) => member.kind === '大梁' && 'axis' in member.position,
    )
    expect(girder).toBeDefined()
    const { nx } = gridPointCount(project.grid)

    const broken = {
      ...project,
      members: project.members.map((member) =>
        member.id === girder!.id
          ? { ...member, position: { axis: 'X', ix: nx - 1, iy: 0 } }
          : member,
      ),
    }

    expect(() => deserializeProject(JSON.stringify(broken))).toThrow()
  })

  it('rejects a 大梁 that points at a 柱 断面', () => {
    // 種別違いは buildingLayout が投げる — 形の検査で止める方が早い。
    const project = createSampleProject()
    const column = project.sections.find(({ kind }) => kind === '柱')
    const girder = project.members.find(({ kind }) => kind === '大梁')
    expect(column).toBeDefined()
    expect(girder).toBeDefined()

    const crossed = {
      ...project,
      members: project.members.map((member) =>
        member.id === girder!.id
          ? { ...member, sectionId: column!.id }
          : member,
      ),
    }

    expect(() => deserializeProject(JSON.stringify(crossed))).toThrow()
  })

  it('accepts a project without the optional 備考・単位質量', () => {
    const project = createProject()

    expect(() =>
      deserializeProject(JSON.stringify(project)),
    ).not.toThrow()
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

  it('anchors into the foundation at the lowest story and passes through the joint', () => {
    const project = stackProject(twoStories)

    expect(columnEnds(project, twoStories[0])).toEqual({
      bottom: '定着',
      top: 'なし',
    })
  })

  it('leaves the joint bare on the upper column and stops at the roof without anchoring (R9①)', () => {
    // 접합부에는 定着이 붙지 않는다. 그 자리의 継手는 端部条件이 아니라
    // 積算基準 2（２）柱2)의 「各階ごとに1か所」가 정한다. 屋上(위에 柱가 없음)도
    // 定着을 붙이지 않는다 — 1通則1)＋（２）柱1) 但書가 最上階柱主筋을 「先端で
    // 止まる鉄筋」으로 다뤄 コンクリートの設計寸法까지만 간다.
    const project = stackProject(twoStories)

    expect(columnEnds(project, twoStories[1])).toEqual({
      bottom: 'なし',
      top: '先端',
    })
  })

  it('anchors only the base and stops at the roof (先端) when the column stands alone in its stack', () => {
    const project = stackProject([twoStories[0]])

    expect(columnEnds(project, twoStories[0])).toEqual({
      bottom: '定着',
      top: '先端',
    })
  })

  it('ignores a column that sits on a different grid point', () => {
    const project = stackProject([
      stackColumn('1F', 1, 1),
      stackColumn('2F', 0, 0),
    ])

    expect(columnEnds(project, stackColumn('1F', 1, 1))).toEqual({
      bottom: '定着',
      top: '先端',
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
    expect(columnEnds(reversed, twoStories[0]).bottom).toBe('なし')
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
