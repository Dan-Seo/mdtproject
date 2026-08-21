import type {
  BarSize,
  ColumnSection,
  GirderSection,
  Section,
} from '@/domain/model/member'
import type { Rebar, RebarRole, RebarZone } from '@/domain/model/rebar'
import { stirrupPositions } from '@/domain/rebar/stirrup-layout'

export type Point3 = [number, number, number]

export interface Segment {
  from: Point3
  to: Point3
  radius: number
}

export interface Bounds {
  min: Point3
  max: Point3
}

export type ClipAxis = 'x' | 'y' | 'z'

/**
 * mm 좌표계의 절단 위치를 THREE.Plane과 같은 normal/constant 형태로 만든다.
 * +축 normal에 constant = −position이므로 남는 영역은 [position, max]다 —
 * ratio가 커질수록 좁아지고 ratio=1이면 전부 잘린다.
 * scene 단위 변환은 렌더러 경계에서만 수행한다.
 */
export function clipPlaneForMm(
  bounds: { min: Point3; max: Point3 },
  axis: ClipAxis,
  ratio: number,
): { normal: Point3; constantMm: number } {
  assertBounds(bounds)
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
    throw new Error(`Invalid clip ratio: ${ratio}`)
  }

  const axisIndex = axis === 'x' ? 0 : axis === 'y' ? 1 : 2
  const positionMm =
    bounds.min[axisIndex] +
    (bounds.max[axisIndex] - bounds.min[axisIndex]) * ratio
  const normal: Point3 = [0, 0, 0]
  normal[axisIndex] = 1

  return { normal, constantMm: -positionMm }
}

export interface CameraFit {
  position: Point3
  target: Point3
}

export const CAMERA_FOV_DEGREES = 38
export const CAMERA_FRAME_MARGIN = 1.08
export const CAMERA_DIRECTION: Point3 = [0.72, 0.34, 0.86]

const MINIMUM_DISPLAY_DIAMETER = 14
const DISPLAY_DIAMETER_SCALE = 1.6

export type RebarLayer = 'main' | 'hoop'

export function roleToLayer(role: RebarRole): RebarLayer {
  switch (role) {
    case '主筋':
    case '上端筋':
    case '下端筋':
      return 'main'
    case '帯筋':
    case 'あばら筋':
    // 幅止め筋은 あばら筋에 결속되는 가로 방향 보조근이라 같은 레이어에 둔다.
    case '幅止め筋':
      return 'hoop'
    // 腹筋은 스팬 방향으로 흐르는 세로근이라 主筋과 같은 레이어다.
    case '腹筋':
      return 'main'
    default: {
      const unsupported: never = role
      throw new Error(`Unsupported RebarRole: ${unsupported}`)
    }
  }
}

function barDiameter(size: BarSize): number {
  const diameter = Number(size.replace(/^D/, ''))

  if (!Number.isFinite(diameter) || diameter <= 0) {
    throw new Error(`Invalid BarSize: ${size}`)
  }

  return diameter
}

export function rebarRadius(size: BarSize): number {
  return (
    Math.max(barDiameter(size), MINIMUM_DISPLAY_DIAMETER) *
    DISPLAY_DIAMETER_SCALE
  )
}

/**
 * `Rebar`는 「대표 1본 + 本数」로 모델링된다 — 수량은 그것으로 충분하지만
 * 3D는 실제 本数만큼 그려야 한다. 배치는 규準値가 아니라 작도 규칙이므로
 * 룰팩을 타지 않고 단면 치수와 대표 배근 위치에서만 유도한다.
 *
 * domain의 points는 かぶり면 기준 중심선이지만, 표시 반경(rebarRadius)이
 * 과장돼 있으므로 표시 공간에서는 그대로 그리면 帯筋과 主筋이 관통한다.
 * 帯筋은 표시 반경만큼, 主筋은 帯筋 표시 지름 + 主筋 표시 반경만큼 안쪽으로
 * 넣어 帯筋 바깥면이 かぶり면에, 主筋 표면이 帯筋 안쪽면에 접하게 한다.
 */
function columnRebarPlacements(
  rebar: Rebar,
  section: ColumnSection,
): Point3[] {
  if (rebar.shape === 'hoop') {
    return columnHoopPlacements(rebar)
  }

  // 主筋: 帯筋 안쪽 사각형 둘레를 등간격으로 돈다. 대표 배근이 시작 모서리다.
  const [insetX, , insetZ] = rebar.points[0]
  const inward =
    2 * rebarRadius(section.hoop.size) + rebarRadius(rebar.size)
  const width = Math.max(0, section.b - 2 * (insetX + inward))
  const depth = Math.max(0, section.d - 2 * (insetZ + inward))
  const perimeter = 2 * (width + depth)

  return Array.from({ length: rebar.count }, (_, index): Point3 => {
    const walked = (index * perimeter) / rebar.count

    if (walked <= width) return [inward + walked, 0, inward]
    if (walked <= width + depth) {
      return [inward + width, 0, inward + walked - width]
    }
    if (walked <= 2 * width + depth) {
      return [inward + width - (walked - width - depth), 0, inward + depth]
    }
    return [inward, 0, inward + depth - (walked - 2 * width - depth)]
  })
}

function girderMainPlacements(
  rebar: Rebar,
  section: GirderSection,
): Point3[] {
  if (rebar.role !== '上端筋' && rebar.role !== '下端筋') {
    throw new Error(`Unsupported 大梁 main role: ${rebar.role}`)
  }

  const [, , insetZ] = rebar.points[0]
  const inward =
    2 * rebarRadius(section.stirrup.size) + rebarRadius(rebar.size)
  const width = Math.max(0, section.b - 2 * (insetZ + inward))
  const y = rebar.role === '上端筋' ? -inward : inward

  return Array.from({ length: rebar.count }, (_, index): Point3 => {
    const z =
      rebar.count === 1
        ? inward + width / 2
        : inward + (index * width) / (rebar.count - 1)

    return [0, y, z]
  })
}

/**
 * 帯筋 전개는 도메인 `stirrupPositions`가 유일한 출처다. index×pitch로 되풀이하면
 * 内法이 피치로 나누어떨어지지 않을 때 마지막 本이 内法 밖에 그려진다.
 */
function columnHoopPlacements(rebar: Rebar): Point3[] {
  if (rebar.placement?.axis !== 'y') {
    throw new Error(`帯筋 y-axis placement is missing: ${rebar.id}`)
  }

  const positions = stirrupPositions(
    rebar.placement.clearMm,
    rebar.placement.pitchMm,
    rebar.placement.startOffsetMm,
  ).positionsMm

  // 대조 상대는 `count`(数量積算基準의 設計本数)가 아니라 `positionCount`다 —
  // 둘은 정당하게 다르다 (ADR-019). 도메인이 배치 인자와 다른 개수를 실었을 때만 잡힌다.
  if (positions.length !== rebar.placement.positionCount) {
    throw new Error(
      `帯筋 placement count mismatch: ${positions.length} !== ` +
        `${rebar.placement.positionCount}`,
    )
  }

  return positions.map((y): Point3 => [0, y, 0])
}

/**
 * 内法 방향으로 되풀이되는 大梁 철근(あばら筋·幅止め筋)의 전개. 도메인
 * `stirrupPositions`가 유일한 출처인 것은 柱 帯筋과 같다.
 */
function girderRepeatedPlacements(rebar: Rebar): Point3[] {
  if (rebar.placement?.axis !== 'x') {
    throw new Error(`${rebar.role} x-axis placement is missing: ${rebar.id}`)
  }

  const positions = stirrupPositions(
    rebar.placement.clearMm,
    rebar.placement.pitchMm,
    rebar.placement.startOffsetMm,
  ).positionsMm

  if (positions.length !== rebar.placement.positionCount) {
    throw new Error(
      `${rebar.role} placement count mismatch: ${positions.length} !== ` +
        `${rebar.placement.positionCount}`,
    )
  }

  return positions.map((x): Point3 => [x, 0, 0])
}

/**
 * 腹筋은 좌우 두 側面에 나뉘어 붙는다. 段数 ＝ ⌈本数 ÷ 2⌉ 이고, 홀수면 마지막
 * 한 본이 한쪽 면에만 남는다. 段의 높이는 上端筋·下端筋 사이를 균등 분할한 값이다
 * — 規準値가 아니라 작도 규칙이며, 数量은 이 배치를 쓰지 않는다 (ADR-019).
 */
function girderSideBarPlacements(
  rebar: Rebar,
  section: GirderSection,
): Point3[] {
  const [, midDepthMm, nearFaceZ] = rebar.points[0]
  const farFaceZ = section.b - nearFaceZ
  const tiers = Math.ceil(rebar.count / 2)

  return Array.from({ length: rebar.count }, (_, index): Point3 => {
    const tier = Math.floor(index / 2)
    // 段が1つなら梁せいの中央、複数なら上端筋・下端筋の間を均等に割る。
    const spanMm = section.depth - 2 * nearFaceZ
    const y =
      tiers === 1
        ? 0
        : nearFaceZ + (tier * spanMm) / (tiers - 1) - midDepthMm
    const z = index % 2 === 0 ? 0 : farFaceZ - nearFaceZ

    return [0, y, z]
  })
}

export function rebarPlacements(rebar: Rebar, section: Section): Point3[] {
  if (section.kind === '柱') {
    return columnRebarPlacements(rebar, section)
  }
  if (rebar.role === 'あばら筋' || rebar.role === '幅止め筋') {
    return girderRepeatedPlacements(rebar)
  }
  if (rebar.role === '腹筋') {
    return girderSideBarPlacements(rebar, section)
  }

  return girderMainPlacements(rebar, section)
}

function insetCoordinate(
  value: number,
  minimum: number,
  maximum: number,
  radius: number,
): number {
  const inset = Math.min(radius, (maximum - minimum) / 2)
  return Math.min(Math.max(value, minimum + inset), maximum - inset)
}

// hoop 중심선을 かぶり면에서 표시 반경만큼 안쪽으로 넣는다. 평면은 부재 kind로
// 명시적으로 고른다: 柱는 X–Z, 大梁은 Y–Z. 좌표 변화로 평면을 추론하지 않는다.
function hoopDisplayPoint(
  point: Point3,
  framePoints: Point3[],
  radius: number,
  section: Section,
): Point3 {
  if (section.kind === '柱') {
    const xs = framePoints.map((candidate) => candidate[0])
    const zs = framePoints.map((candidate) => candidate[2])
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minZ = Math.min(...zs)
    const maxZ = Math.max(...zs)

    return [
      insetCoordinate(point[0], minX, maxX, radius),
      point[1],
      insetCoordinate(point[2], minZ, maxZ, radius),
    ]
  }

  const ys = framePoints.map((candidate) => candidate[1])
  const zs = framePoints.map((candidate) => candidate[2])
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const minZ = Math.min(...zs)
  const maxZ = Math.max(...zs)

  return [
    point[0],
    insetCoordinate(point[1], minY, maxY, radius),
    insetCoordinate(point[2], minZ, maxZ, radius),
  ]
}

function translate(point: Point3, offset: Point3): Point3 {
  return [point[0] + offset[0], point[1] + offset[1], point[2] + offset[2]]
}

interface PathSegment {
  from: Point3
  to: Point3
}

interface PathRun {
  zone: RebarZone['kind'] | null
  segments: PathSegment[]
}

interface SegmentRun {
  zone: RebarZone['kind'] | null
  segments: Segment[]
}

function pointDistance(from: Point3, to: Point3): number {
  return Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2])
}

function interpolate(from: Point3, to: Point3, ratio: number): Point3 {
  return [
    from[0] + (to[0] - from[0]) * ratio,
    from[1] + (to[1] - from[1]) * ratio,
    from[2] + (to[2] - from[2]) * ratio,
  ]
}

function zoneAt(
  zones: RebarZone[],
  pathDistanceMm: number,
): RebarZone['kind'] | null {
  return (
    zones.find(
      ({ pathFromMm, pathToMm }) =>
        pathDistanceMm >= pathFromMm && pathDistanceMm <= pathToMm,
    )?.kind ?? null
  )
}

/** 누적 domain 경로거리에서 먼저 자른다. 표시 인셋·배치는 이 결과에만 적용한다. */
function pathRuns(rebar: Rebar): PathRun[] {
  const edges: PathSegment[] = rebar.points.slice(1).map((to, index) => ({
    from: rebar.points[index],
    to,
  }))

  if (rebar.closed && rebar.points.length > 1) {
    edges.push({
      from: rebar.points[rebar.points.length - 1],
      to: rebar.points[0],
    })
  }

  const zones = rebar.zones ?? []
  const boundaries = zones.flatMap(({ pathFromMm, pathToMm }) => [
    pathFromMm,
    pathToMm,
  ])
  const runs: PathRun[] = []
  let walked = 0

  for (const edge of edges) {
    const length = pointDistance(edge.from, edge.to)
    if (length === 0) continue

    const edgeEnd = walked + length
    const cuts = [
      walked,
      ...boundaries.filter(
        (boundary) => boundary > walked && boundary < edgeEnd,
      ),
      edgeEnd,
    ].sort((left, right) => left - right)

    for (let index = 1; index < cuts.length; index += 1) {
      const pathFrom = cuts[index - 1]
      const pathTo = cuts[index]
      if (pathTo <= pathFrom) continue

      const segment: PathSegment = {
        from: interpolate(edge.from, edge.to, (pathFrom - walked) / length),
        to: interpolate(edge.from, edge.to, (pathTo - walked) / length),
      }
      const zone = zoneAt(zones, (pathFrom + pathTo) / 2)
      const current = runs[runs.length - 1]

      if (current?.zone === zone) current.segments.push(segment)
      else runs.push({ zone, segments: [segment] })
    }

    walked = edgeEnd
  }

  return runs
}

function rebarSegmentRuns(rebar: Rebar, section: Section): SegmentRun[] {
  const radius = rebarRadius(rebar.size)
  const displayPoint = (point: Point3): Point3 =>
    rebar.shape === 'hoop'
      ? hoopDisplayPoint(point, rebar.points, radius, section)
      : point
  const placements = rebarPlacements(rebar, section)

  return pathRuns(rebar).map(({ zone, segments }) => ({
    zone,
    segments: placements.flatMap((offset) =>
      segments.map(({ from, to }) => ({
        from: translate(displayPoint(from), offset),
        to: translate(displayPoint(to), offset),
        radius,
      })),
    ),
  }))
}

export function rebarSegments(rebar: Rebar, section: Section): Segment[] {
  return rebarSegmentRuns(rebar, section).flatMap(({ segments }) => segments)
}

export interface RebarBatch {
  rowId: string
  layer: RebarLayer
  zone: RebarZone['kind'] | null
  segments: Segment[]
}

/**
 * 3D의 강조 단위는 내역서 **행**이다(DESIGN.md §3.2). zone 색을 보존하기 위해
 * 행 안에서는 연속 경로 run마다 나누지만, 세그먼트마다 메시를 만들지는 않는다.
 * 같은 rowId를 유지하므로 여러 zone 배치도 하나의 행으로 함께 강조할 수 있다.
 */
function shiftAlongAxis(segments: Segment[], offsetMm: number): Segment[] {
  if (offsetMm === 0) return segments

  return segments.map(({ from, to, radius }) => ({
    from: [from[0] + offsetMm, from[1], from[2]] as Point3,
    to: [to[0] + offsetMm, to[1], to[2]] as Point3,
    radius,
  }))
}

export function rebarBatches(
  entries: { rowId: string; rebar: Rebar; originOffsetMm?: number }[],
  section: Section,
): RebarBatch[] {
  const batches = new Map<string, RebarBatch>()

  for (const { rowId, rebar, originOffsetMm = 0 } of entries) {
    const layer = roleToLayer(rebar.role)

    rebarSegmentRuns(rebar, section).forEach(({ zone, segments }, runIndex) => {
      // 같은 row의 대표 철근이 여러 개면 동일 경로 run끼리 합치되, 양단에 같은
      // kind의 zone이 있어도 서로 다른 연속 구간이므로 runIndex로 분리한다.
      const key = JSON.stringify([rowId, layer, runIndex, zone])
      // 오프셋은 **병합 전에** 건다. 連続スパン에서 두 스팬의 あばら筋은 길이·本数가
      // 같아 같은 rowId로 합쳐지므로, 배치 단위로 옮기면 한쪽 오프셋이 사라진다.
      const shifted = shiftAlongAxis(segments, originOffsetMm)
      const batch = batches.get(key)

      if (batch) batch.segments.push(...shifted)
      else batches.set(key, { rowId, layer, zone, segments: shifted })
    })
  }

  return [...batches.values()]
}

function subtract(left: Point3, right: Point3): Point3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]]
}

function dot(left: Point3, right: Point3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2]
}

function cross(left: Point3, right: Point3): Point3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ]
}

function normalize(vector: Point3): Point3 {
  const length = Math.hypot(vector[0], vector[1], vector[2])

  if (!Number.isFinite(length) || length === 0) {
    throw new Error('Cannot normalize an invalid camera vector')
  }

  return [vector[0] / length, vector[1] / length, vector[2] / length]
}

function boundsCorners({ min, max }: Bounds): Point3[] {
  return [min[0], max[0]].flatMap((x) =>
    [min[1], max[1]].flatMap((y) =>
      [min[2], max[2]].map((z): Point3 => [x, y, z]),
    ),
  )
}

function assertBounds(bounds: Bounds): void {
  for (let axis = 0; axis < bounds.min.length; axis += 1) {
    const min = bounds.min[axis]
    const max = bounds.max[axis]

    if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
      throw new Error(`Invalid bounds on axis ${axis}: ${min}..${max}`)
    }
  }
}

export function easeOutCubic(t: number): number {
  const clamped = Math.min(Math.max(t, 0), 1)
  return 1 - (1 - clamped) ** 3
}

export function lerpCameraFit(
  from: CameraFit,
  to: CameraFit,
  t: number,
): CameraFit {
  const mix = (left: Point3, right: Point3): Point3 => [
    left[0] + (right[0] - left[0]) * t,
    left[1] + (right[1] - left[1]) * t,
    left[2] + (right[2] - left[2]) * t,
  ]

  return {
    position: mix(from.position, to.position),
    target: mix(from.target, to.target),
  }
}

/**
 * 플라이인 시작 포즈: 자동 프레이밍 포즈를 타깃 중심으로 yaw 회전시키고
 * 거리를 배율만큼 벌린다. 첫 로드 연출의 출발점이다.
 */
export function flyInStartPose(
  fit: CameraFit,
  yawRadians: number,
  distanceScale: number,
): CameraFit {
  const offset = subtract(fit.position, fit.target)
  const cos = Math.cos(yawRadians)
  const sin = Math.sin(yawRadians)
  const rotated: Point3 = [
    offset[0] * cos + offset[2] * sin,
    offset[1],
    -offset[0] * sin + offset[2] * cos,
  ]

  return {
    position: [
      fit.target[0] + rotated[0] * distanceScale,
      fit.target[1] + rotated[1] * distanceScale,
      fit.target[2] + rotated[2] * distanceScale,
    ],
    target: fit.target,
  }
}

export function fitCamera(bounds: Bounds): CameraFit {
  assertBounds(bounds)

  const target: Point3 = [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ]
  const cameraZ = normalize(CAMERA_DIRECTION)
  const cameraX = normalize(cross([0, 1, 0], cameraZ))
  const cameraY = cross(cameraZ, cameraX)
  const tangent = Math.tan((CAMERA_FOV_DEGREES * Math.PI) / 360)
  const distance = Math.max(
    Number.EPSILON,
    ...boundsCorners(bounds).map((corner) => {
      const relative = subtract(corner, target)
      const projectedRadius = Math.max(
        Math.abs(dot(relative, cameraX)),
        Math.abs(dot(relative, cameraY)),
      )

      return (
        dot(relative, cameraZ) +
        (CAMERA_FRAME_MARGIN * projectedRadius) / tangent
      )
    }),
  )
  const position: Point3 = [
    target[0] + cameraZ[0] * distance,
    target[1] + cameraZ[1] * distance,
    target[2] + cameraZ[2] * distance,
  ]

  return { position, target }
}
