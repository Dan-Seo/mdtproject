import type { Member } from './member'
import {
  PROJECT_SCHEMA_VERSION,
  gridPointCount,
  type Grid,
  type Project,
  type Story,
} from './project'
import { columnSection, girderSections } from './sample-project'

export interface StressProjectOptions {
  /** 그리드 X방향 스팬 수 (스팬 1개당 spanMm) */
  xSpanCount: number
  /** 그리드 Y방향 스팬 수 */
  ySpanCount: number
  /** 층 수 (전 층 동일 층고) */
  storyCount: number
  spanMm?: number
  storyHeightMm?: number
}

function createColumns(grid: Grid, storyId: string): Member[] {
  const { nx, ny } = gridPointCount(grid)
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

function createGirders(grid: Grid, storyId: string): Member[] {
  const { nx, ny } = gridPointCount(grid)
  const girders: Member[] = []

  for (let iy = 0; iy < ny; iy += 1) {
    const mark = iy % 2 === 1 ? 'G2' : 'G1'
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
    const mark = ix % 2 === 1 ? 'G2' : 'G1'
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

/**
 * 建物 뷰 InstancedMesh 규모 측정용 합성 Project (R4). 規準 수치가 아니라
 * sample-project.ts의 C1/G1/G2 단면을 그대로 복제 배치해 그리드·층수만 키운
 * 부하 시험용 형상이다 — 실제 산정값으로 쓰지 않는다.
 */
export function createStressProject(options: StressProjectOptions): Project {
  const spanMm = options.spanMm ?? 6000
  const storyHeightMm = options.storyHeightMm ?? 4200
  const grid: Grid = {
    xSpans: Array(options.xSpanCount).fill(spanMm) as number[],
    ySpans: Array(options.ySpanCount).fill(spanMm) as number[],
  }
  const stories: Story[] = Array.from(
    { length: options.storyCount },
    (_, index) => ({
      id: `${index + 1}F`,
      name: `${index + 1}階`,
      height: storyHeightMm,
    }),
  )

  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    name: `stress-${options.xSpanCount}x${options.ySpanCount}x${options.storyCount}`,
    grid,
    stories,
    sections: [columnSection, ...girderSections],
    members: stories.flatMap(({ id }) => [
      ...createColumns(grid, id),
      ...createGirders(grid, id),
    ]),
  }
}
