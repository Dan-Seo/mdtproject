import type { ColumnSection, GirderSection, Member } from './member'
import {
  PROJECT_SCHEMA_VERSION,
  gridPointCount,
  type Grid,
  type Project,
  type Story,
} from './project'

const sampleGrid: Grid = {
  xSpans: [6000],
  ySpans: [6000, 6000],
}

const sampleStories: Story[] = [
  { id: '1F', name: '1階', height: 4200 },
  { id: '2F', name: '2階', height: 3600 },
]

// M1 화면 확인용 사용자 입력 예시이며 규준 수치가 아니다.
// 屋外・仕上げなし는 종전 플레이스홀더 最小かぶり(40mm)와 같은 셀이다. 다만 帯筋의
// 数量은 数量積算基準 1通則2)의 断面周長으로 바뀌었으므로 샘플 산출값은 보존되지 않는다.
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

const girderSections: GirderSection[] = [
  {
    id: 'section-G1',
    kind: '大梁',
    mark: 'G1',
    b: 400,
    depth: 750,
    fc: 24,
    grade: 'SD345',
    exposure: '屋外',
    finish: '仕上げなし',
    main: { size: 'D25', topCount: 4, bottomCount: 4 },
    stirrup: { size: 'D13', pitch: 100, startOffsetMm: 50 },
  },
  {
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
  },
]

function createColumns(storyId: string): Member[] {
  const { nx, ny } = gridPointCount(sampleGrid)
  const columns: Member[] = []

  for (let iy = 0; iy < ny; iy += 1) {
    for (let ix = 0; ix < nx; ix += 1) {
      columns.push({
        id: `${storyId}-X${ix + 1}Y${iy + 1}`,
        kind: '柱',
        memberClass: '躯体',
        sectionId: columnSection.id,
        storyId,
        position: { ix, iy },
      })
    }
  }

  return columns
}

function createGirders(storyId: string): Member[] {
  const { nx, ny } = gridPointCount(sampleGrid)
  const girders: Member[] = []

  for (let iy = 0; iy < ny; iy += 1) {
    const mark = iy === 1 ? 'G2' : 'G1'
    for (let ix = 0; ix < nx - 1; ix += 1) {
      girders.push({
        id: `${storyId}-${mark}-X${ix + 1}Y${iy + 1}-X`,
        kind: '大梁',
        memberClass: '躯体',
        sectionId: `section-${mark}`,
        storyId,
        position: { axis: 'X', ix, iy },
      })
    }
  }

  for (let ix = 0; ix < nx; ix += 1) {
    const mark = ix === 1 ? 'G2' : 'G1'
    for (let iy = 0; iy < ny - 1; iy += 1) {
      girders.push({
        id: `${storyId}-${mark}-X${ix + 1}Y${iy + 1}-Y`,
        kind: '大梁',
        memberClass: '躯体',
        sectionId: `section-${mark}`,
        storyId,
        position: { axis: 'Y', ix, iy },
      })
    }
  }

  return girders
}

export function createSampleProject(): Project {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    name: 'サンプル案件 / RC 2階建て',
    grid: sampleGrid,
    stories: sampleStories,
    sections: [columnSection, ...girderSections],
    members: sampleStories.flatMap(({ id }) => [
      ...createColumns(id),
      ...createGirders(id),
    ]),
  }
}
