import type { BarSize, ColumnSection } from '@/domain/model/member'
import type { Rebar } from '@/domain/model/rebar'

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

export interface CameraFit {
  position: Point3
  target: Point3
}

export const CAMERA_FOV_DEGREES = 38
export const CAMERA_FRAME_MARGIN = 1.08
export const CAMERA_DIRECTION: Point3 = [0.72, 0.34, 0.86]

const MINIMUM_DISPLAY_DIAMETER = 14
const DISPLAY_DIAMETER_SCALE = 1.6

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
export function rebarPlacements(
  rebar: Rebar,
  section: ColumnSection,
): Point3[] {
  if (rebar.shape === 'hoop') {
    return Array.from({ length: rebar.count }, (_, index) => [
      0,
      index * section.hoop.pitch,
      0,
    ])
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

// 帯筋 중심선을 かぶり면에서 표시 반경만큼 안쪽으로 넣는다. 퇴화 단면에서
// 사각형이 반전되지 않도록 반폭으로 클램프한다.
function hoopDisplayPoints(points: Point3[], radius: number): Point3[] {
  const xs = points.map((point) => point[0])
  const zs = points.map((point) => point[2])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minZ = Math.min(...zs)
  const maxZ = Math.max(...zs)
  const insetX = Math.min(radius, (maxX - minX) / 2)
  const insetZ = Math.min(radius, (maxZ - minZ) / 2)

  return points.map(([x, y, z]) => [
    Math.min(Math.max(x, minX + insetX), maxX - insetX),
    y,
    Math.min(Math.max(z, minZ + insetZ), maxZ - insetZ),
  ])
}

function translate(point: Point3, offset: Point3): Point3 {
  return [point[0] + offset[0], point[1] + offset[1], point[2] + offset[2]]
}

export function rebarSegments(
  rebar: Rebar,
  section: ColumnSection,
): Segment[] {
  const radius = rebarRadius(rebar.size)
  const points =
    rebar.shape === 'hoop'
      ? hoopDisplayPoints(rebar.points, radius)
      : rebar.points

  return rebarPlacements(rebar, section).flatMap((offset) => {
    const placed = points.map((point) => translate(point, offset))
    const segments = placed.slice(1).map((to, index) => ({
      from: placed[index],
      to,
      radius,
    }))

    if (rebar.closed && placed.length > 1) {
      segments.push({
        from: placed[placed.length - 1],
        to: placed[0],
        radius,
      })
    }

    return segments
  })
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
