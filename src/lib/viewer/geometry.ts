import {
  decomposeGirderMainRow,
  type ColumnSection,
  type GirderMainRow,
  type GirderSection,
  type Opening,
  type Section,
  type ShearBarSize,
  type SlabBarRow,
  type SlabSection,
  type WallSection,
} from '@/domain/model/member'
import type {
  Rebar,
  RebarPlacement,
  RebarRole,
  RebarZone,
} from '@/domain/model/rebar'
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

export type RebarLayer = 'main' | 'hoop' | 'hidden'

export function roleToLayer(role: RebarRole): RebarLayer {
  switch (role) {
    case '主筋':
    case '上端筋':
    case '下端筋':
    case '上端カットオフ筋':
    case '下端カットオフ筋':
      return 'main'
    case '帯筋':
    case 'あばら筋':
    // 幅止め筋은 あばら筋에 결속되는 가로 방향 보조근이라 같은 레이어에 둔다.
    case '幅止め筋':
      return 'hoop'
    // 腹筋은 스팬 방향으로 흐르는 세로근이라 主筋과 같은 레이어다.
    case '腹筋':
    // 耐震壁의 縦筋은 부재축을 따라 흐르는 세로근이라 主筋과 같다.
    case '縦筋':
      return 'main'
    // 横筋은 그 세로근을 가로지르는 배력근이라 帯筋·あばら筋과 같은 레이어다.
    case '横筋':
      return 'hoop'
    // 床板は主筋が2方向に走るだけでどれも主筋だ — 上下の面をレイヤーで
    // 分けない。分けると「主筋／帯筋」というトグルの意味が部材ごとに変わる。
    case 'X方向上端筋':
    case 'X方向下端筋':
    case 'Y方向上端筋':
    case 'Y方向下端筋':
      return 'main'
    // 開口補強筋は設計図書転記の数量入力であり、3D形状は作図しない (ADR-034)。
    case '開口補強筋':
      return 'hidden'
    default: {
      const unsupported: never = role
      throw new Error(`Unsupported RebarRole: ${unsupported}`)
    }
  }
}

// 呼び名の英字を落とすと呼び径が残る — D13 も高強度せん断補強筋の K13・S13 も
// 同じ規約であって、ここに新しい数値は増えない (ADR-026)。
export function barDiameter(size: ShearBarSize): number {
  const diameter = Number(size.replace(/^[A-Z]+/, ''))

  if (!Number.isFinite(diameter) || diameter <= 0) {
    throw new Error(`Invalid bar size: ${size}`)
  }

  return diameter
}

export function rebarRadius(size: ShearBarSize): number {
  return (
    Math.max(barDiameter(size), MINIMUM_DISPLAY_DIAMETER) *
    DISPLAY_DIAMETER_SCALE
  )
}

/**
 * 呼び名から半径 (mm) を出す。画面は読みやすさのための表示値
 * (`rebarRadius`)を、書き出す模型は実寸を渡す。
 *
 * 半径は太さだけでなく**位置**を決める — 帯筋をすり抜けないよう
 * 主筋を内側へ入れる分がこれだ。実寸の模型に表示値を使うと、
 * D13 帯筋・D25 主筋で 84.8mm 入る—実際は 25.5mm だ — 主筋が設計より
 * 深く埋まった模型を渡すことになる。
 */
export type RadiusOf = (size: ShearBarSize) => number

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
  radiusOf: RadiusOf,
): Point3[] {
  if (rebar.shape === 'hoop') {
    return columnHoopPlacements(rebar)
  }

  const [insetX, , insetZ] = rebar.points[0]
  const inward = 2 * radiusOf(section.hoop.size) + radiusOf(rebar.size)

  // 円形柱: 帯筋 안쪽 **원**을 등간격으로 돈다. 대표 배근이 시작 각도다.
  if (section.shape === '円形') {
    const centre = section.b / 2
    const coverRadius = centre - insetX
    const radius = Math.max(0, coverRadius - inward)
    // 代表配筋は かぶり円の -X 側の点なので、そこを角度の基準にする。
    const start = Math.PI

    return Array.from({ length: rebar.count }, (_, index): Point3 => {
      const angle = start + (2 * Math.PI * index) / rebar.count
      return [
        centre + radius * Math.cos(angle) - insetX,
        0,
        centre + radius * Math.sin(angle) - insetZ,
      ]
    })
  }

  // 矩形柱: 帯筋 안쪽 사각형 둘레를 등간격으로 돈다. 대표 배근이 시작 모서리다.
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

/** 主筋 1段の枠割り。通し筋とカットオフ筋が同じ段を分け合う。 */
function girderMainRowOf(
  role: RebarRole,
  section: GirderSection,
): { row: GirderMainRow; upper: boolean; cutoff: boolean } {
  switch (role) {
    case '上端筋':
      return { row: section.main.top, upper: true, cutoff: false }
    case '上端カットオフ筋':
      return { row: section.main.top, upper: true, cutoff: true }
    case '下端筋':
      return { row: section.main.bottom, upper: false, cutoff: false }
    case '下端カットオフ筋':
      return { row: section.main.bottom, upper: false, cutoff: true }
    default:
      throw new Error(`Unsupported 大梁 main role: ${role}`)
  }
}

function girderMainPlacements(
  rebar: Rebar,
  section: GirderSection,
  radiusOf: RadiusOf,
): Point3[] {
  const { row, upper, cutoff } = girderMainRowOf(rebar.role, section)
  const decomposition = decomposeGirderMainRow(row)
  // 段の総本数は始端・中央・終端の最大値だ。通し筋が手前の枠を取り、
  // nesting 分解で決まった各カットオフ筋が残りの枠を取る — 行ごとに全幅へ
  // 広げると同じ枠に二重に描かれる。
  const slots = Math.max(
    row.startCount ?? row.endCount,
    row.centerCount,
    row.endCount,
  )
  const [, , insetZ] = rebar.points[0]
  const inward = 2 * radiusOf(section.stirrup.size) + radiusOf(rebar.size)
  const width = Math.max(0, section.b - 2 * (insetZ + inward))
  const y = upper ? -inward : inward
  // 数量の count は「1か所あたり本数 × 位置数」なので、枠の数は位置で割る。
  const offsets = rebar.axisOffsetsMm ?? [0]
  const perPlacement = rebar.count / offsets.length
  const firstSlot = cutoff
    ? rebar.axisSlotStart ?? decomposition.throughCount
    : 0

  return offsets.flatMap((offsetMm) =>
    Array.from({ length: perPlacement }, (_, index): Point3 => {
      const slot = firstSlot + index
      const z =
        slots === 1
          ? inward + width / 2
          : inward + (slot * width) / (slots - 1)

      return [offsetMm, y, z]
    }),
  )
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
    // 上端筋・下端筋の「間」を均等に割る。tiers-1 で割ると最初の段が下端筋の
    // 位置に、最後の段が上端筋の位置に立ってしまい、4-D10 のようなありふれた
    // 入力で腹筋が主筋の列に重なる。区間を tiers+1 に割って内側の点だけ使う。
    const spanMm = section.depth - 2 * nearFaceZ
    const y = nearFaceZ + ((tier + 1) * spanMm) / (tiers + 1) - midDepthMm
    const z = index % 2 === 0 ? 0 : farFaceZ - nearFaceZ

    return [0, y, z]
  })
}

/**
 * 壁筋의 표시 반경. `rebarRadius`는 보이라고 실제 지름을 과장하므로, 얇은 벽에서는
 * 縦筋·横筋 2겹이 壁厚에 들어가지 않는다 — 벽 밖으로 삐져나오든 층끼리 파고들든
 * 둘 중 하나가 된다. 들어가는 크기까지 일률로 줄인다.
 */
function wallDisplayRadius(
  size: ShearBarSize,
  section: WallSection,
  radiusOf: RadiusOf,
): number {
  const pair =
    radiusOf(section.vertical.size) + radiusOf(section.horizontal.size)
  // ダブル은 한 면당 縦筋＋横筋이라 壁厚의 1/4, シングル은 1조뿐이라 1/2에 담는다.
  const limit = section.thickness / (section.layers === 1 ? 2 : 4)

  return radiusOf(size) * (pair > limit ? limit / pair : 1)
}

/**
 * 壁厚 방향으로 그 役割이 서는 면 (mm). 도메인 `points`는 縦筋도 横筋도 かぶり면에
 * 두지만(柱의 主筋·帯筋과 같다), 그대로 그리면 교차점마다 서로를 관통한다. 柱와
 * 같은 약속으로 表示 반경만큼 안쪽으로 밀어 縦筋의 바깥면이 かぶり면에, 横筋이
 * 그 안쪽면에 접하게 한다.
 *
 * 縦筋을 かぶり면 쪽에 두는 데에 근거는 없다 — **두 원문 어디에도 정함이 없다.**
 * 標準仕様書 5章에는 「縦筋」·「横筋」이라는 말 자체가 없고(나오는 것은 組積工事
 * 장이다), 数量積算基準 2（５）壁도 内外를 말하지 않는다. 数量에는 영향이 없으므로
 * (ADR-019) 도면이 흔들리지 않게 作図規則으로 고정한다 — 腹筋의 段割り와 같다.
 */
function wallBarDepths(
  role: RebarRole,
  section: WallSection,
  coverZ: number,
  radiusOf: RadiusOf,
): number[] {
  const verticalRadius = wallDisplayRadius(
    section.vertical.size,
    section,
    radiusOf,
  )
  const horizontalRadius = wallDisplayRadius(
    section.horizontal.size,
    section,
    radiusOf,
  )
  const atFace = role === '縦筋'

  if (section.layers === 1) {
    // シングル은 かぶり면이 아니라 壁厚 중앙을 사이에 두고 등을 맞댄다.
    return [
      section.thickness / 2 + (atFace ? -horizontalRadius : verticalRadius),
    ]
  }

  // 表示 반경만큼 두꺼워진 2층이 중앙에서 겹치지 않도록 かぶり를 죈다.
  const cover = Math.min(
    coverZ,
    section.thickness / 2 - 2 * (verticalRadius + horizontalRadius),
  )
  const near =
    cover + (atFace ? verticalRadius : 2 * verticalRadius + horizontalRadius)

  return [near, section.thickness - near]
}

/**
 * 繰り返し配置の位置 (mm)。ふだんは断面一覧の初期オフセットから `stirrupPositions`
 * が作るが、開口部のある壁・床板ではドメインが位置そのものを渡してくる —
 * 欠除で1つの役割が複数の内訳行に分かれるので、行ごとに「どの位置の本か」を
 * 決めておかないと同じ場所へ二度描くことになる (ADR-029)。
 */
function repeatPositions(placement: RebarPlacement): number[] {
  return (
    placement.positionsMm ??
    stirrupPositions(
      placement.clearMm,
      placement.pitchMm,
      placement.startOffsetMm,
    ).positionsMm
  )
}

/**
 * 耐震壁의 縦筋·横筋 전개. 되풀이 축은 도메인 `placement`가, 壁厚 방향은
 * `wallBarDepths`가 준다 — 표시부가 かぶり를 다시 조회하면 룰팩 조회가 두 곳에
 * 박히므로, 대표점의 z(＝かぶり면)만 받아서 거기서 유도한다.
 */
function wallRebarPlacements(
  rebar: Rebar,
  section: WallSection,
  radiusOf: RadiusOf,
): Point3[] {
  const placement = rebar.placement
  if (!placement) {
    throw new Error(`${rebar.role} placement is missing: ${rebar.id}`)
  }

  const positions = repeatPositions(placement)

  if (positions.length !== placement.positionCount) {
    throw new Error(
      `${rebar.role} placement count mismatch: ${positions.length} !== ` +
        `${placement.positionCount}`,
    )
  }

  const coverZ = rebar.points[0][2]

  return wallBarDepths(rebar.role, section, coverZ, radiusOf).flatMap((z) =>
    positions.map((value): Point3 =>
      placement.axis === 'x'
        ? [value, 0, z - coverZ]
        : [0, value, z - coverZ],
    ),
  )
}

/**
 * この鉄筋のかぶり面の高さ (mm)。折れ曲がった上端筋は下へ落ちる点も持つので、
 * 直線部（最も高い点）で代表させる。下端筋は折れないので全点が同じ高さである。
 */
function slabCoverZ(rebar: Rebar): number {
  return Math.max(...rebar.points.map(([, , z]) => z))
}

/**
 * 床板筋の表示半径。`rebarRadius` は見せるために実際の径を誇張するので、板厚
 * 200・かぶり 30 の普通のスラブでも 2方向×2面の4層が入らない — 板の外へ
 * 突き出すか層どうしが食い込む。入る大きさまで一律に縮める（壁の
 * `wallDisplayRadius` と同じ扱い）。
 *
 * かぶりの内側に残る `厚さ − かぶり×2` を4層で分けるので、縦横1組の半径の和が
 * その1/4に収まればよい。
 */
function slabDisplayRadius(
  size: ShearBarSize,
  section: SlabSection,
  coverMm: number,
  radiusOf: RadiusOf,
): number {
  const pair =
    radiusOf(slabRowFor(section, 'X', '下端').size) +
    radiusOf(slabRowFor(section, 'Y', '下端').size)
  const limit = Math.max(0, (section.thickness - 2 * coverMm) / 4)

  return radiusOf(size) * (pair > limit ? limit / pair : 1)
}

/** かぶり面から測ったかぶり厚さ — 上端筋は板の上から測る。 */
function slabCoverMm(coverZ: number, section: SlabSection): number {
  return Math.min(coverZ, section.thickness - coverZ)
}

function slabRowFor(
  section: SlabSection,
  axis: 'X' | 'Y',
  face: '上端' | '下端',
): SlabBarRow {
  return (axis === 'X' ? section.x : section.y)[
    face === '上端' ? 'top' : 'bottom'
  ]
}

function slabRoleParts(role: RebarRole): {
  axis: 'X' | 'Y'
  face: '上端' | '下端'
} {
  switch (role) {
    case 'X方向上端筋':
      return { axis: 'X', face: '上端' }
    case 'X方向下端筋':
      return { axis: 'X', face: '下端' }
    case 'Y方向上端筋':
      return { axis: 'Y', face: '上端' }
    case 'Y方向下端筋':
      return { axis: 'Y', face: '下端' }
    default:
      throw new Error(`Unsupported 床板 role: ${role}`)
  }
}

/**
 * 床板筋が板厚のどこに立つか (mm)。ドメインの `points` は上端筋も下端筋も
 * かぶり面に置く（柱の主筋・帯筋と同じ）が、そのまま描くと交点ごとに 2方向が
 * 互いを貫通する。表示半径のぶんだけ内側へ押し、X方向の外面がかぶり面に、
 * Y方向がその内側面に接するようにする。
 *
 * X方向をかぶり面側に置くことに根拠はない — **両原文のどこにも定めがない。**
 * 数量積算基準 2（４）床板 は方向を区別せず「主筋」と呼ぶだけで、標準仕様書5章
 * にも上下の重なり順の記述はない。数量には影響しないので (ADR-019)、図面が
 * 揺れないように作図規則として固定する — 壁の縦筋・横筋と同じ判断である。
 */
function slabBarDepthMm(
  role: RebarRole,
  section: SlabSection,
  coverZ: number,
  radiusOf: RadiusOf,
): number {
  const { axis, face } = slabRoleParts(role)
  const coverMm = slabCoverMm(coverZ, section)
  const outer = slabDisplayRadius(
    slabRowFor(section, 'X', face).size,
    section,
    coverMm,
    radiusOf,
  )
  const inner = slabDisplayRadius(
    slabRowFor(section, 'Y', face).size,
    section,
    coverMm,
    radiusOf,
  )
  const depth = axis === 'X' ? outer : 2 * outer + inner

  return face === '上端' ? coverZ - depth : coverZ + depth
}

/**
 * 床板筋の展開。面内の繰り返し軸はドメインの `placement` が、板厚方向は
 * `slabBarDepthMm` が与える。X方向の鉄筋は局所 x に伸びて y へ、Y方向は
 * その逆に並ぶ。
 */
function slabRebarPlacements(
  rebar: Rebar,
  section: SlabSection,
  radiusOf: RadiusOf,
): Point3[] {
  const placement = rebar.placement
  if (!placement) {
    throw new Error(`${rebar.role} placement is missing: ${rebar.id}`)
  }

  const positions = repeatPositions(placement)

  if (positions.length !== placement.positionCount) {
    throw new Error(
      `${rebar.role} placement count mismatch: ${positions.length} !== ` +
        `${placement.positionCount}`,
    )
  }

  const coverZ = slabCoverZ(rebar)
  const shiftZ = slabBarDepthMm(rebar.role, section, coverZ, radiusOf) - coverZ

  return positions.map((value): Point3 =>
    placement.axis === 'x' ? [value, 0, shiftZ] : [0, value, shiftZ],
  )
}

export function rebarPlacements(
  rebar: Rebar,
  section: Section,
  radiusOf: RadiusOf = rebarRadius,
): Point3[] {
  if (section.kind === '柱') {
    return columnRebarPlacements(rebar, section, radiusOf)
  }
  if (section.kind === '耐震壁') {
    return wallRebarPlacements(rebar, section, radiusOf)
  }
  if (section.kind === '床板') {
    return slabRebarPlacements(rebar, section, radiusOf)
  }
  if (rebar.role === 'あばら筋' || rebar.role === '幅止め筋') {
    return girderRepeatedPlacements(rebar)
  }
  if (rebar.role === '腹筋') {
    return girderSideBarPlacements(rebar, section)
  }

  return girderMainPlacements(rebar, section, radiusOf)
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
  if (section.kind === '柱' && section.shape === '円形') {
    // 円は辺ごとに詰められない — 中心からの距離を表示半径だけ縮める。
    const centre = section.b / 2
    const [x, y, z] = point
    const distance = Math.hypot(x - centre, z - centre)
    if (distance === 0) return point
    const scale = Math.max(0, distance - radius) / distance

    return [centre + (x - centre) * scale, y, centre + (z - centre) * scale]
  }

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

  if (rebar.hookTails !== undefined && rebar.points.length > 0) {
    for (const tail of rebar.hookTails) {
      edges.push({ from: rebar.points[0], to: tail })
    }
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

export interface AxisAlignedBox {
  center: Point3
  size: Point3
}

/** 箱の2軸に写した開口部の矩形。軸の対応は呼ぶ側が決める（部材ごとに違う） */
export interface BoxHole {
  minA: number
  maxA: number
  minB: number
  maxB: number
}

/**
 * 開口部でコンクリートの箱をくり抜く (数量積算基準 1通則8))。
 *
 * 開口は部材の厚さを貫くので、見るのは `axes` が指す2軸だけだ。1つの開口は箱を
 * 最大4つに割る（手前・奥・下・上）。複数あれば割った箱をさらに割る — 冗長な
 * 分割が出ることはあるが、重なった開口でも欠けが正しく残る。
 *
 * くり抜きは表示だけの話である。数量の欠除は `openingDeduction` が鉄筋について
 * 数えるもので、コンクリート・型枠の数量はそもそも製品が出さない (ADR-005)。
 */
export function carveBox<T extends AxisAlignedBox>(
  box: T,
  axes: [number, number],
  holes: BoxHole[],
): T[] {
  return holes.reduce<T[]>(
    (boxes, hole) => boxes.flatMap((one) => carveOne(one, axes, hole)),
    [box],
  )
}

function carveOne<T extends AxisAlignedBox>(
  box: T,
  [axisA, axisB]: [number, number],
  hole: BoxHole,
): T[] {
  const minA = box.center[axisA] - box.size[axisA] / 2
  const maxA = box.center[axisA] + box.size[axisA] / 2
  const minB = box.center[axisB] - box.size[axisB] / 2
  const maxB = box.center[axisB] + box.size[axisB] / 2

  const cutMinA = Math.max(minA, hole.minA)
  const cutMaxA = Math.min(maxA, hole.maxA)
  const cutMinB = Math.max(minB, hole.minB)
  const cutMaxB = Math.min(maxB, hole.maxB)

  if (cutMinA >= cutMaxA || cutMinB >= cutMaxB) return [box]

  const piece = (
    fromA: number,
    toA: number,
    fromB: number,
    toB: number,
  ): T => {
    const center = [...box.center] as Point3
    const size = [...box.size] as Point3
    center[axisA] = (fromA + toA) / 2
    size[axisA] = toA - fromA
    center[axisB] = (fromB + toB) / 2
    size[axisB] = toB - fromB
    return { ...box, center, size }
  }

  const pieces: T[] = []
  if (minA < cutMinA) pieces.push(piece(minA, cutMinA, minB, maxB))
  if (cutMaxA < maxA) pieces.push(piece(cutMaxA, maxA, minB, maxB))
  if (minB < cutMinB) pieces.push(piece(cutMinA, cutMaxA, minB, cutMinB))
  if (cutMaxB < maxB) pieces.push(piece(cutMinA, cutMaxA, cutMaxB, maxB))

  return pieces
}

/** 部材局所の開口を、箱の2軸における絶対座標の矩形に写す。 */
export function boxHoles(
  openings: Opening[],
  originA: number,
  originB: number,
): BoxHole[] {
  return openings.map((opening) => ({
    minA: originA + opening.xMm,
    maxA: originA + opening.xMm + opening.widthMm,
    minB: originB + opening.yMm,
    maxB: originB + opening.yMm + opening.heightMm,
  }))
}

/**
 * 開口部が鉄筋を断つ区間 (数量積算基準 1通則8))。
 *
 * 開口は部材の厚さを貫くので、判定は局所 x・y の2軸だけで足りる。境界にちょうど
 * 載る鉄筋は断たない — 数量側の欠除判定と同じ約束で、開口の外の鉄筋を欠かせない
 * ためである (`openingDeduction`)。
 *
 * 数量が「何本が何mm欠けるか」を言うのに対し、ここが決めるのは「どこで切れて
 * 見えるか」だ。欠ける位置は本ごとに違うので `Rebar.points` には入れられない —
 * 代表1本の折れ線は開口を知らない全長の経路である (ADR-029)。
 */
function openingCut(
  from: Point3,
  to: Point3,
  opening: Opening,
): [number, number] | null {
  let enter = 0
  let leave = 1

  for (const axis of [0, 1] as const) {
    const minimum = axis === 0 ? opening.xMm : opening.yMm
    const maximum =
      minimum + (axis === 0 ? opening.widthMm : opening.heightMm)
    const start = from[axis]
    const delta = to[axis] - start

    if (Math.abs(delta) < 1e-9) {
      // この軸に動かない鉄筋は、開口の内側にいるか外にいるかのどちらかだ。
      if (start <= minimum || start >= maximum) return null
      continue
    }

    const first = (minimum - start) / delta
    const second = (maximum - start) / delta
    enter = Math.max(enter, Math.min(first, second))
    leave = Math.min(leave, Math.max(first, second))
  }

  return leave > enter ? [enter, leave] : null
}

function lerpPoint(from: Point3, to: Point3, t: number): Point3 {
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
  ]
}

function clipSegment(segment: Segment, openings: Opening[]): Segment[] {
  const cuts = openings
    .map((opening) => openingCut(segment.from, segment.to, opening))
    .filter((cut): cut is [number, number] => cut !== null)
    .sort(([left], [right]) => left - right)

  if (cuts.length === 0) return [segment]

  const pieces: Segment[] = []
  let walked = 0

  for (const [enter, leave] of cuts) {
    if (enter > walked) {
      pieces.push({
        from: lerpPoint(segment.from, segment.to, walked),
        to: lerpPoint(segment.from, segment.to, enter),
        radius: segment.radius,
      })
    }
    walked = Math.max(walked, leave)
  }

  if (walked < 1) {
    pieces.push({
      from: lerpPoint(segment.from, segment.to, walked),
      to: segment.to,
      radius: segment.radius,
    })
  }

  // 端が開口の縁にちょうど載ると長さ0の破片が出る。描いても見えないうえ、
  // three.js の円柱ジオメトリが向きを決められない。
  return pieces.filter(
    ({ from, to }) =>
      Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]) > 1e-6,
  )
}

export function clipSegments(
  segments: Segment[],
  openings: Opening[],
): Segment[] {
  if (openings.length === 0) return segments
  return segments.flatMap((segment) => clipSegment(segment, openings))
}

function rebarSegmentRuns(
  rebar: Rebar,
  section: Section,
  radiusOf: RadiusOf = rebarRadius,
  openings: Opening[] = [],
): SegmentRun[] {
  if (roleToLayer(rebar.role) === 'hidden') return []

  // 壁と床板だけ表示半径が部材厚に縛られる。配置と描画で別々の半径を使うと、
  // 詰めたはずの層が描くときにまた太って食い込む。
  const radius =
    section.kind === '耐震壁'
      ? wallDisplayRadius(rebar.size, section, radiusOf)
      : section.kind === '床板'
        ? slabDisplayRadius(
            rebar.size,
            section,
            slabCoverMm(slabCoverZ(rebar), section),
            radiusOf,
          )
        : radiusOf(rebar.size)
  const displayPoint = (point: Point3): Point3 =>
    rebar.shape === 'hoop'
      ? hoopDisplayPoint(point, rebar.points, radius, section)
      : point
  const placements = rebarPlacements(rebar, section, radiusOf)

  return pathRuns(rebar).map(({ zone, segments }) => ({
    zone,
    // 開口部は 3D でだけ鉄筋を断つ。数量は `Rebar.length` が別に持っている
    // ので、ここで切っても本数・質量は動かない (ADR-029)。
    segments: clipSegments(
      placements.flatMap((offset) =>
        segments.map(({ from, to }) => ({
          from: translate(displayPoint(from), offset),
          to: translate(displayPoint(to), offset),
          radius,
        })),
      ),
      openings,
    ),
  }))
}

export function rebarSegments(
  rebar: Rebar,
  section: Section,
  radiusOf: RadiusOf = rebarRadius,
  openings: Opening[] = [],
): Segment[] {
  return rebarSegmentRuns(rebar, section, radiusOf, openings).flatMap(
    ({ segments }) => segments,
  )
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
  entries: {
    rowId: string
    rebar: Rebar
    originOffsetMm?: number
    /** この鉄筋の局所座標系に直した開口部 (1通則8))。3D だけがこれを見る */
    openings?: Opening[]
  }[],
  section: Section,
): RebarBatch[] {
  const batches = new Map<string, RebarBatch>()

  for (const { rowId, rebar, originOffsetMm = 0, openings = [] } of entries) {
    const layer = roleToLayer(rebar.role)

    rebarSegmentRuns(rebar, section, rebarRadius, openings).forEach(
      ({ zone, segments }, runIndex) => {
      // 같은 row의 대표 철근이 여러 개면 동일 경로 run끼리 합치되, 양단에 같은
      // kind의 zone이 있어도 서로 다른 연속 구간이므로 runIndex로 분리한다.
        const key = JSON.stringify([rowId, layer, runIndex, zone])
        // 오프셋은 **병합 전에** 건다. 連続スパン에서 두 스팬의 あばら筋은 길이·本数가
        // 같아 같은 rowId로 합쳐지므로, 배치 단위로 옮기면 한쪽 오프셋이 사라진다.
        const shifted = shiftAlongAxis(segments, originOffsetMm)
        const batch = batches.get(key)

        if (batch) batch.segments.push(...shifted)
        else batches.set(key, { rowId, layer, zone, segments: shifted })
      },
    )
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
