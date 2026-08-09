import type { MemberKind } from '@/domain/model/member'
import {
  findSection,
  gridPoint,
  storyElevation,
  type Project,
} from '@/domain/model/project'
import type { Rebar } from '@/domain/model/rebar'

import { rebarSegments, type Bounds, type Point3 } from './geometry'

export interface ConcreteBox {
  memberId: string
  kind: MemberKind
  /** 박스 중심 (mm) */
  center: Point3
  /** 박스 크기 [x, y, z] (mm) */
  size: Point3
}

export interface RebarInstance {
  memberId: string
  from: Point3
  to: Point3
  radius: number
}

export interface BuildingLayout {
  boxes: ConcreteBox[]
  rebar: RebarInstance[]
  bounds: Bounds
}

function emptyBounds(): Bounds {
  return {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  }
}

function expandBounds(bounds: Bounds, point: Point3, margin = 0): void {
  for (let axis = 0; axis < 3; axis += 1) {
    bounds.min[axis] = Math.min(bounds.min[axis], point[axis] - margin)
    bounds.max[axis] = Math.max(bounds.max[axis], point[axis] + margin)
  }
}

function translate(point: Point3, offset: Point3): Point3 {
  return [point[0] + offset[0], point[1] + offset[1], point[2] + offset[2]]
}

/**
 * 建物 뷰의 순수 레이아웃 (DESIGN.md §7). 전 부재의 콘크리트 외형과
 * 柱 배근 인스턴스를 mm 좌표로 전개한다 — 大梁 배근은 M3 이후.
 * 그리드 교점에 단면 중심을 정렬하므로, 부재 로컬 좌표(모서리 원점)의
 * 배근 세그먼트는 교점 − 단면/2 만큼 평행이동한다.
 */
export function buildingLayout(
  project: Project,
  rebars: Rebar[],
): BuildingLayout {
  const boxes: ConcreteBox[] = []
  const instances: RebarInstance[] = []
  const bounds = emptyBounds()

  for (const member of project.members) {
    const story = project.stories.find(({ id }) => id === member.storyId)
    if (!story) {
      throw new Error(`Story not found: ${member.storyId}`)
    }
    const elevation = storyElevation(project.stories, member.storyId)
    const section = findSection(project, member.sectionId)

    let box: ConcreteBox
    if (member.kind === '柱') {
      if (section.kind !== '柱' || 'axis' in member.position) {
        throw new Error(`柱 member references a non-柱 section: ${member.id}`)
      }
      const { x, y } = gridPoint(
        project.grid,
        member.position.ix,
        member.position.iy,
      )
      box = {
        memberId: member.id,
        kind: '柱',
        center: [x, elevation + story.height / 2, y],
        size: [section.b, story.height, section.d],
      }
    } else {
      if (section.kind !== '大梁' || !('axis' in member.position)) {
        throw new Error(
          `大梁 member references a non-大梁 section: ${member.id}`,
        )
      }
      const position = member.position
      const start = gridPoint(project.grid, position.ix, position.iy)
      const end =
        position.axis === 'X'
          ? gridPoint(project.grid, position.ix + 1, position.iy)
          : gridPoint(project.grid, position.ix, position.iy + 1)
      // 大梁 상단을 층 천장에 맞춘다.
      const centerY = elevation + story.height - section.depth / 2
      box =
        position.axis === 'X'
          ? {
              memberId: member.id,
              kind: '大梁',
              center: [(start.x + end.x) / 2, centerY, start.y],
              size: [end.x - start.x, section.depth, section.b],
            }
          : {
              memberId: member.id,
              kind: '大梁',
              center: [start.x, centerY, (start.y + end.y) / 2],
              size: [section.b, section.depth, end.y - start.y],
            }
    }

    boxes.push(box)
    expandBounds(bounds, [
      box.center[0] - box.size[0] / 2,
      box.center[1] - box.size[1] / 2,
      box.center[2] - box.size[2] / 2,
    ])
    expandBounds(bounds, [
      box.center[0] + box.size[0] / 2,
      box.center[1] + box.size[1] / 2,
      box.center[2] + box.size[2] / 2,
    ])
  }

  for (const rebar of rebars) {
    const member = project.members.find(({ id }) => id === rebar.memberId)
    if (!member) {
      throw new Error(`Member not found: ${rebar.memberId}`)
    }
    if (member.kind !== '柱') continue

    const section = findSection(project, member.sectionId)
    if (section.kind !== '柱' || 'axis' in member.position) {
      throw new Error(`柱 member references a non-柱 section: ${member.id}`)
    }
    const { x, y } = gridPoint(
      project.grid,
      member.position.ix,
      member.position.iy,
    )
    const offset: Point3 = [
      x - section.b / 2,
      storyElevation(project.stories, member.storyId),
      y - section.d / 2,
    ]

    for (const segment of rebarSegments(rebar, section)) {
      const from = translate(segment.from, offset)
      const to = translate(segment.to, offset)
      instances.push({ memberId: member.id, from, to, radius: segment.radius })
      expandBounds(bounds, from, segment.radius)
      expandBounds(bounds, to, segment.radius)
    }
  }

  if (boxes.length === 0 && instances.length === 0) {
    return { boxes, rebar: instances, bounds: { min: [0, 0, 0], max: [0, 0, 0] } }
  }

  return { boxes, rebar: instances, bounds }
}

/** InstancedMesh는 지오메트리(=반경)당 하나 — 표시 반경별로 묶는다. */
export function groupInstancesByRadius(
  instances: RebarInstance[],
): Map<number, RebarInstance[]> {
  const groups = new Map<number, RebarInstance[]>()

  for (const instance of instances) {
    const group = groups.get(instance.radius)
    if (group === undefined) groups.set(instance.radius, [instance])
    else group.push(instance)
  }

  return groups
}
