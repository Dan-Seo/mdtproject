import type { ColumnShape, MemberKind } from '@/domain/model/member'
import {
  findSection,
  girderSpan,
  gridPoint,
  slabBay,
  storyElevation,
  storyNotFound,
  wallSpan,
  type Project,
} from '@/domain/model/project'
import type { Rebar } from '@/domain/model/rebar'

import {
  rebarSegments,
  roleToLayer,
  type Bounds,
  type Point3,
  type RebarLayer,
} from './geometry'

export interface ConcreteBox {
  memberId: string
  kind: MemberKind
  /** 박스 중심 (mm) */
  center: Point3
  /** 박스 크기 [x, y, z] (mm) */
  size: Point3
  /**
   * 円形柱だけ立体が変わる。size は外接寸法のままなので直径は size[0] であり、
   * 大梁の内法も選択の当たり判定も外接寸法で決まったまま動く (ADR-026)。
   */
  shape?: ColumnShape
}

export interface RebarInstance {
  memberId: string
  from: Point3
  to: Point3
  radius: number
  layer: RebarLayer
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
 * 지원 부재의 배근 인스턴스를 mm 좌표로 전개한다. 柱는 그리드 교점에
 * 단면 중심을 정렬하고, 大梁는 좌측 柱면·밑면·폭 모서리를 로컬 원점으로 쓴다.
 * 미지원 大梁는 콘크리트 박스만 남기고 철근을 전개하지 않는다 (R7 ②).
 */
export function buildingLayout(
  project: Project,
  rebars: Rebar[],
  unsupportedMemberIds: ReadonlySet<string>,
): BuildingLayout {
  const boxes: ConcreteBox[] = []
  const instances: RebarInstance[] = []
  const bounds = emptyBounds()

  for (const member of project.members) {
    const story = project.stories.find(({ id }) => id === member.storyId)
    if (!story) {
      throw storyNotFound(member.storyId)
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
        shape: section.shape,
      }
    } else if (member.kind === '大梁') {
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
    } else if (member.kind === '床板') {
      if (section.kind !== '床板' || 'axis' in member.position) {
        throw new Error(`床板 member references a non-床板 section: ${member.id}`)
      }
      // 床板も内法部分そのものだ（躯体の区分（４）「柱、梁等に接する水平材の
      // 内法部分」）。通り芯間で描くと大梁と重なった板になる。
      const origin = gridPoint(
        project.grid,
        member.position.ix,
        member.position.iy,
      )
      const bay = slabBay(project, member)
      // 板の上面は階の天井 — 大梁の上端と同じ高さで、そこから板厚だけ下がる。
      const topY = elevation + story.height
      box = {
        memberId: member.id,
        kind: '床板',
        center: [
          origin.x + bay.startFaceOffsetXMm + bay.clearXMm / 2,
          topY - section.thickness / 2,
          origin.y + bay.startFaceOffsetYMm + bay.clearYMm / 2,
        ],
        size: [bay.clearXMm, section.thickness, bay.clearYMm],
      }
    } else {
      if (section.kind !== '耐震壁' || !('axis' in member.position)) {
        throw new Error(
          `耐震壁 member references a non-耐震壁 section: ${member.id}`,
        )
      }
      // 壁は躯体の区分（第4編第1章第2節（５）壁）で「柱、梁、床板等に接する
      // 垂直材の内法部分」なので、箱も内法で描く — 中心間で描くと柱・大梁と
      // 重なった立体になり、数量（内法）と見た目が食い違う。
      const position = member.position
      const start = gridPoint(project.grid, position.ix, position.iy)
      const span = wallSpan(project, member)
      const alongCenter =
        span.startFaceOffsetMm + span.clearLengthMm / 2
      const centerY = elevation + span.clearHeightMm / 2
      box =
        position.axis === 'X'
          ? {
              memberId: member.id,
              kind: '耐震壁',
              center: [start.x + alongCenter, centerY, start.y],
              size: [span.clearLengthMm, span.clearHeightMm, section.thickness],
            }
          : {
              memberId: member.id,
              kind: '耐震壁',
              center: [start.x, centerY, start.y + alongCenter],
              size: [section.thickness, span.clearHeightMm, span.clearLengthMm],
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
    if (unsupportedMemberIds.has(member.id)) continue

    const section = findSection(project, member.sectionId)
    let worldPoint: (point: Point3) => Point3

    if (member.kind === '柱') {
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
      worldPoint = (point) => translate(point, offset)
    } else if (member.kind === '大梁') {
      if (section.kind !== '大梁' || !('axis' in member.position)) {
        throw new Error(
          `大梁 member references a non-大梁 section: ${member.id}`,
        )
      }
      const story = project.stories.find(({ id }) => id === member.storyId)
      if (!story) {
        throw storyNotFound(member.storyId)
      }
      const start = gridPoint(
        project.grid,
        member.position.ix,
        member.position.iy,
      )
      const span = girderSpan(project, member)
      const base =
        storyElevation(project.stories, member.storyId) +
        story.height -
        section.depth

      worldPoint =
        member.position.axis === 'X'
          ? ([x, y, z]) => [
              start.x + span.startFaceOffsetMm + x,
              base + y,
              start.y - section.b / 2 + z,
            ]
          : ([x, y, z]) => [
              start.x - section.b / 2 + z,
              base + y,
              start.y + span.startFaceOffsetMm + x,
            ]
    } else if (member.kind === '床板') {
      if (section.kind !== '床板' || 'axis' in member.position) {
        throw new Error(`床板 member references a non-床板 section: ${member.id}`)
      }
      const slabStory = project.stories.find(({ id }) => id === member.storyId)
      if (!slabStory) {
        throw storyNotFound(member.storyId)
      }
      const origin = gridPoint(
        project.grid,
        member.position.ix,
        member.position.iy,
      )
      const bay = slabBay(project, member)
      // 床板のローカル原点は「内法域の X 最小・Y 最小の隅、板の下端」。鉄筋は
      // ランの持ち主に帰属するので、その持ち主のベイの内法原点がランの原点だ。
      const base =
        storyElevation(project.stories, member.storyId) +
        slabStory.height -
        section.thickness

      worldPoint = ([x, y, z]) => [
        origin.x + bay.startFaceOffsetXMm + x,
        base + z,
        origin.y + bay.startFaceOffsetYMm + y,
      ]
    } else {
      if (section.kind !== '耐震壁' || !('axis' in member.position)) {
        throw new Error(
          `耐震壁 member references a non-耐震壁 section: ${member.id}`,
        )
      }
      const start = gridPoint(
        project.grid,
        member.position.ix,
        member.position.iy,
      )
      const span = wallSpan(project, member)
      // 壁のローカル原点は「始端の柱内側面・壁下端・厚さの手前面」。壁下端は
      // 階の床板上面＝階の基準標高そのものである（大梁と違い天井から下げない）。
      const base = storyElevation(project.stories, member.storyId)

      worldPoint =
        member.position.axis === 'X'
          ? ([x, y, z]) => [
              start.x + span.startFaceOffsetMm + x,
              base + y,
              start.y - section.thickness / 2 + z,
            ]
          : ([x, y, z]) => [
              start.x - section.thickness / 2 + z,
              base + y,
              start.y + span.startFaceOffsetMm + x,
            ]
    }

    const layer = roleToLayer(rebar.role)

    for (const segment of rebarSegments(rebar, section)) {
      const from = worldPoint(segment.from)
      const to = worldPoint(segment.to)
      instances.push({
        memberId: member.id,
        from,
        to,
        radius: segment.radius,
        layer,
      })
      expandBounds(bounds, from, segment.radius)
      expandBounds(bounds, to, segment.radius)
    }
  }

  if (boxes.length === 0 && instances.length === 0) {
    return { boxes, rebar: instances, bounds: { min: [0, 0, 0], max: [0, 0, 0] } }
  }

  return { boxes, rebar: instances, bounds }
}

/** InstancedMesh는 현재 레이어 토글 경계에 맞춰 표시 레이어·반경별 하나다. */
export function groupInstancesByLayerAndRadius(
  instances: RebarInstance[],
): Map<string, RebarInstance[]> {
  const groups = new Map<string, RebarInstance[]>()

  for (const instance of instances) {
    const key = `${instance.radius}|${instance.layer}`
    const group = groups.get(key)
    if (group === undefined) groups.set(key, [instance])
    else group.push(instance)
  }

  return groups
}
