import {
  BAR_SIZES,
  MEMBER_KINDS,
  type BarSize,
  type ColumnSection,
  type ColumnPosition,
  type GirderPosition,
  type GirderSection,
  type Member,
  type MemberKind,
  type Opening,
  type Section,
  type ShearBarSize,
  type SlabPosition,
} from './member'
import { MemberUnsupportedError } from './unsupported'
import { coverConditions } from '../rules/lookup'

// v2 (2026-08-12): Section에 필수 필드 exposure·finish 추가 — v1 JSON은
// deserializeProject의 버전 게이트에서 명시적으로 거부된다 (영속 v1 데이터 없음).
// v3 (2026-08-12): GirderSection.stirrup에 필수 필드 startOffsetMm 추가. 規準에
// 없는 배치값을 룰팩에 가짜 출처로 넣는 대신 입력으로 받는다 (ADR-012).
// v4 (2026-08-12): ColumnSection.hoop에도 같은 이유로 startOffsetMm 추가.
// 이 값이 帯筋 本数(=물량)를 좌우하므로 제품 상수로 두지 않는다.
// v5 (2026-08-14): Section에 필수 필드 spliceMethod 추가. 継手箇所数와 설계길이
// 산입이 방식마다 다른데(積算基準 1通則4)·5)) 규준에 기본 방식이 없으므로
// 조용한 기본값 대신 입력으로 받는다.
// v6 (2026-08-20): Project에 선택 필드 unitMass 추가. 数量積算基準 1通則 前文은
// 質量을 「設計長さ × JIS G 3112 の単位質量」으로 정의할 뿐 값 자체는 JIS에
// 위임한다. JIS는 유료 규격이라 확보하지 못했고, 읽지 않은 문헌을 룰팩의
// 出典에 세울 수는 없으므로(ADR-003) 값을 입력으로 받는다. 미입력 径은 키가
// 없고, 그 径의 kg은 산출하지 않는다.
// v7 (2026-08-21): GirderSection에 두 갈래 변경이 함께 들어갔다 — 둘 다
// 영속 데이터가 없는 상태에서 같은 판으로 나가므로 버전은 하나다.
//   ① (M3b) main の topCount·bottomCount を位置別 (端部·中央) の GirderMainRow に
//      置き換え、カットオフ位置を必須入力にした。積算基準 2（３）梁1) が定めるのは
//      「梁の全長にわたる主筋」だけで、トップ筋等は設計図書に委ねられる —
//      位置別本数がないと通し筋とカットオフ筋を分けられない。
//   ② (M3c) 任意 필드 widthTie·sideBar 추가. 둘 다 「断面一覧에 없으면 그 배근이
//      없다」를 뜻하는 optional이다 — 있는지 없는지를 제품이 정하지 않는다.
//      腹筋의 余長은 積算基準 1通則6)이 JASS 5에 위임하는데 그 규격이 미확보라
//      룰팩 행이 아니라 입력으로 받는다 (R9②).
// v8 (2026-08-22): 耐震壁を部材として受け取る。MemberKind に '耐震壁'、Section に
//   WallSection が加わり、Member.position は大梁と同じ辺の位置を使う。数量積算基準
//   2（５）壁1)（壁式構造以外）と、躯体の区分（５）壁「柱、梁、床板等に接する垂直材の
//   内法部分」に対応する — 壁式構造の壁（2）は扱わない (ADR-025)。
// v9 (2026-08-22): ColumnSection に必須フィールド shape を追加。円形柱は b・d を
//   ともに直径にする。数量で形状を見るのは 1通則2)「断面の設計寸法による周長」
//   だけで、円形断面ではそれが円周になる — 省略可能にすると「記載なし＝矩形」と
//   いう黙った既定値になるので必須にする (ADR-027)。
// v10 (2026-08-22): 床板（スラブ）を部材として受け取る。MemberKind に '床板'、
//   Section に SlabSection が加わり、Member.position はベイ（通り芯で囲まれた
//   1区画）の原点側格子点を指す。数量積算基準 2（４）床板 と、躯体の区分（４）
//   「柱、梁等に接する水平材の内法部分」に対応する (ADR-028)。SlabSection が
//   exposure を持たないのは表5.3.6 の「スラブ、耐力壁以外の壁」行に屋内・屋外の
//   区別がないからで、省略ではなく原文の構造である。
// v11 (2026-08-22): Member に任意フィールド openings を追加。数量積算基準 1通則8)
//   「窓、出入口等の開口部による鉄筋の欠除は……建具類等開口部の内法寸法による」
//   に対応する。断面ではなく部材に付くのは、同じ符号の壁が何枚も建つのに窓は
//   その1枚に開いているからだ。未指定は「開口なし」で、それが v10 までの JSON の
//   意味とも一致する — それでも版を上げるのは、開口を受け取れる版とそうでない版で
//   同じ案件の数量が変わるからである (ADR-029・R14)。
export const PROJECT_SCHEMA_VERSION = 11

export interface Grid {
  xSpans: number[]
  ySpans: number[]
  /**
   * 通り芯의 이름 (「bX1」「Y3」). 伏図에서 읽은 원문 그대로이고 길이는
   * spans.length + 1이다. 미지정은 「도면에서 읽은 이름이 없다」는 뜻이며,
   * 제품이 index로 이름을 지어내지 않는다 (ADR-004·ADR-030).
   *
   * schemaVersion을 올리지 않는다 — 이 필드는 数量을 바꾸지 않는다. 版을
   * 올리는 기준은 「같은 案件의 数量이 달라지는가」다 (v11 주석 참조).
   */
  xLabels?: string[]
  yLabels?: string[]
}

/** 라벨 배열이 스팬 수와 맞는가. 어긋나면 어느 축의 이름인지 알 수 없다 */
export function isGridLabels(
  labels: unknown,
  spanCount: number,
): labels is string[] {
  return (
    Array.isArray(labels) &&
    labels.length === spanCount + 1 &&
    labels.every((label) => typeof label === 'string')
  )
}

export interface Story {
  id: string
  name: string
  height: number
}

export interface Project {
  schemaVersion: number
  name: string
  grid: Grid
  stories: Story[]
  sections: Section[]
  members: Member[]
  /** 내역서 備考. QuantityLine.id를 키로 쓴다. 값이 없는 행은 키 자체가 없다. */
  notes?: Record<string, string>
  /**
   * 径별 単位質量 (kg/m) — 利用者入力. 미입력 径은 키가 없다.
   * 규준이 JIS에 위임한 값이라 룰팩이 아니라 프로젝트가 들고 있다.
   */
  unitMass?: Partial<Record<ShearBarSize, number>>
}

export function gridPointCount(grid: Grid): { nx: number; ny: number } {
  return {
    nx: grid.xSpans.length + 1,
    ny: grid.ySpans.length + 1,
  }
}

export function gridPoint(
  grid: Grid,
  ix: number,
  iy: number,
): { x: number; y: number } {
  const { nx, ny } = gridPointCount(grid)

  if (
    !Number.isInteger(ix) ||
    !Number.isInteger(iy) ||
    ix < 0 ||
    ix >= nx ||
    iy < 0 ||
    iy >= ny
  ) {
    throw new RangeError(`Grid point index out of range: (${ix}, ${iy})`)
  }

  return {
    x: grid.xSpans.slice(0, ix).reduce((sum, span) => sum + span, 0),
    y: grid.ySpans.slice(0, iy).reduce((sum, span) => sum + span, 0),
  }
}

/**
 * storyId는 "1F" 같은 letter+digit 라벨이라 룰팩 상수(D25 등)와 값의
 * 모양만으로 구분되지 않는다 — telemetry.ts의 스크러버는 letter+digit
 * 토큰을 통째로 남기므로, 그냥 보간하면 階 라벨이 그대로 새어 나간다(9차
 * 리뷰 critical). JSON 블록으로 감싸면 스크러버의 `{...}` 규칙에 걸린다.
 * 이 포맷을 함수 하나로 고정해 다음 호출부가 규약을 손으로 다시 베끼지
 * 않게 한다(9차 리뷰 minor).
 */
export function storyNotFound(storyId: string): Error {
  return new Error(`Story not found: ${JSON.stringify({ storyId })}`)
}

/** 층 바닥의 누적 표고(mm). stories 배열 순서대로 아래층 height를 누적한다. */
export function storyElevation(stories: Story[], storyId: string): number {
  const index = stories.findIndex(({ id }) => id === storyId)

  if (index < 0) {
    throw storyNotFound(storyId)
  }

  return stories.slice(0, index).reduce((sum, story) => sum + story.height, 0)
}

export function findSection(project: Project, sectionId: string): Section {
  const section = project.sections.find(({ id }) => id === sectionId)

  if (!section) {
    throw new Error(`Section not found: ${sectionId}`)
  }

  return section
}

export function memberGroupKey(project: Project, member: Member): string {
  const story = project.stories.find(({ id }) => id === member.storyId)
  if (!story) {
    throw storyNotFound(member.storyId)
  }

  const section = findSection(project, member.sectionId)
  if (section.kind !== member.kind) {
    throw new Error(
      `Member and section kinds do not match: ${member.id} (${member.kind}/${section.kind})`,
    )
  }

  const memberCode = MEMBER_GROUP_CODE[member.kind]
  return `${story.name}|${memberCode}|${section.mark}`
}

/** 内訳書のグループ鍵に使う部材コード。符号(mark)と階の間に挟まる一文字。 */
const MEMBER_GROUP_CODE: Record<Member['kind'], string> = {
  柱: 'C',
  大梁: 'G',
  耐震壁: 'W',
  床板: 'S',
}

function isColumnPosition(
  position: ColumnPosition | GirderPosition,
): position is ColumnPosition {
  return !('axis' in position)
}

function isGirderPosition(
  position: ColumnPosition | GirderPosition,
): position is GirderPosition {
  return 'axis' in position
}

function touchesColumn(
  girder: GirderPosition,
  column: ColumnPosition,
): boolean {
  if (girder.axis === 'X') {
    return (
      girder.iy === column.iy &&
      (girder.ix === column.ix || girder.ix + 1 === column.ix)
    )
  }

  return (
    girder.ix === column.ix &&
    (girder.iy === column.iy || girder.iy + 1 === column.iy)
  )
}

export interface GirderSpan {
  axis: 'X' | 'Y'
  /** 그리드 교점 간 중심 스팬 (mm) */
  centerSpan: number
  /** 内法長さ (mm) — 양단 柱面 사이 */
  clear: number
  /** 시작 柱 중심 → 大梁 내측 柱面 오프셋 (mm) */
  startFaceOffsetMm: number
  /** 끝 柱 중심 → 大梁 내측 柱面 오프셋 (mm) */
  endFaceOffsetMm: number
  /** 정착 수용성 검사용 — 시작 柱의 축방향 전체 치수 (mm) */
  startSupportLengthAlongAxisMm: number
  /** 정착 수용성 검사용 — 끝 柱의 축방향 전체 치수 (mm) */
  endSupportLengthAlongAxisMm: number
  /** 지점 柱의 かぶり 조회 조건 — 端部条件은 大梁이 아니라 柱의 かぶり로 판정한다 */
  startSupportCover: Record<string, string | boolean>
  endSupportCover: Record<string, string | boolean>
}

export function girderSupportSections(
  project: Project,
  member: Member,
): { start: ColumnSection; end: ColumnSection } {
  if (member.kind !== '大梁' || !isGirderPosition(member.position)) {
    throw new Error(`girderSupportSections requires a 大梁: ${member.id}`)
  }

  const { axis, ix, iy } = member.position
  const endIx = axis === 'X' ? ix + 1 : ix
  const endIy = axis === 'Y' ? iy + 1 : iy

  return {
    start: supportColumnSection(project, member, ix, iy, 'start'),
    end: supportColumnSection(project, member, endIx, endIy, 'end'),
  }
}

function supportColumnSection(
  project: Project,
  supported: Member,
  ix: number,
  iy: number,
  end: 'start' | 'end',
): ColumnSection {
  const support = project.members.find(
    (candidate) =>
      candidate.kind === '柱' &&
      candidate.storyId === supported.storyId &&
      isColumnPosition(candidate.position) &&
      candidate.position.ix === ix &&
      candidate.position.iy === iy,
  )

  if (!support) {
    throw new Error(
      `Missing ${end} support 柱 for ${supported.kind}: ${supported.id}`,
    )
  }

  const section = findSection(project, support.sectionId)
  if (section.kind !== '柱') {
    throw new Error(`柱 member references a non-柱 section: ${support.id}`)
  }

  return section
}

export function girderSpan(project: Project, member: Member): GirderSpan {
  if (member.kind !== '大梁' || !isGirderPosition(member.position)) {
    throw new Error(`girderSpan requires a 大梁: ${member.id}`)
  }

  const { axis, ix, iy } = member.position
  const endIx = axis === 'X' ? ix + 1 : ix
  const endIy = axis === 'Y' ? iy + 1 : iy
  const startPoint = gridPoint(project.grid, ix, iy)
  const endPoint = gridPoint(project.grid, endIx, endIy)
  const { start: startSection, end: endSection } = girderSupportSections(
    project,
    member,
  )
  const centerSpan =
    axis === 'X' ? endPoint.x - startPoint.x : endPoint.y - startPoint.y
  const startSupportLengthAlongAxisMm =
    axis === 'X' ? startSection.b : startSection.d
  const endSupportLengthAlongAxisMm =
    axis === 'X' ? endSection.b : endSection.d
  const startFaceOffsetMm = startSupportLengthAlongAxisMm / 2
  const endFaceOffsetMm = endSupportLengthAlongAxisMm / 2
  const clear = centerSpan - startFaceOffsetMm - endFaceOffsetMm

  if (clear <= 0) {
    throw new MemberUnsupportedError(
      '寸法不成立',
      `大梁 内法長さ must be positive: ${member.id} (${clear} mm)`,
    )
  }

  return {
    axis,
    centerSpan,
    clear,
    startFaceOffsetMm,
    endFaceOffsetMm,
    startSupportLengthAlongAxisMm,
    endSupportLengthAlongAxisMm,
    startSupportCover: coverConditions(startSection),
    endSupportCover: coverConditions(endSection),
  }
}

/**
 * 耐震壁の内法寸法。躯体の区分（第4編第1章第2節（５）壁）が壁を「柱、梁、床板等に
 * 接する垂直材の内法部分」と定めるので、壁の高さも長さも中心間ではなく内法である。
 * 柱・大梁と二重計上しないのはこの定義そのもので、大梁が内法長さなのと同じ形だ。
 */
export interface WallSpan {
  axis: 'X' | 'Y'
  /** 内法長さ (mm) — 両側の柱の内側面の間 */
  clearLengthMm: number
  /** 内法高さ (mm) — 階高 − 上部大梁せい */
  clearHeightMm: number
  /** 始端の柱中心 → 壁端（柱内側面）までのオフセット (mm) */
  startFaceOffsetMm: number
  /** 終端の柱中心 → 壁端（柱内側面）までのオフセット (mm) */
  endFaceOffsetMm: number
  /** 内法高さを決めた上部大梁のせい (mm) */
  girderDepthAboveMm: number
}

/**
 * 壁の上に載る大梁のせい。壁と同じ辺（同じ通り芯・同じスパン）の大梁を見る —
 * 耐震壁は2本の柱の間に立ち、その上の大梁で頭を止められるからである。
 *
 * 見つからなければ入力の不整合なので黙って階高を使わない。大梁のない辺に壁を
 * 置くと内法高さが決まらず、階高で代用すれば大梁と重なった壁を計上してしまう。
 */
function girderDepthAboveWall(project: Project, wall: Member): number {
  const position = wall.position
  if (!isGirderPosition(position)) {
    throw new Error(`girderDepthAboveWall requires an edge position: ${wall.id}`)
  }

  const girder = project.members.find(
    (candidate) =>
      candidate.kind === '大梁' &&
      candidate.storyId === wall.storyId &&
      isGirderPosition(candidate.position) &&
      candidate.position.axis === position.axis &&
      candidate.position.ix === position.ix &&
      candidate.position.iy === position.iy,
  )

  if (!girder) {
    throw new Error(`Missing 大梁 above 耐震壁: ${wall.id}`)
  }

  const section = findSection(project, girder.sectionId)
  if (section.kind !== '大梁') {
    throw new Error(`大梁 member references a non-大梁 section: ${girder.id}`)
  }

  return section.depth
}

export function wallSpan(project: Project, member: Member): WallSpan {
  if (member.kind !== '耐震壁' || !isGirderPosition(member.position)) {
    throw new Error(`wallSpan requires a 耐震壁: ${member.id}`)
  }

  const story = project.stories.find(({ id }) => id === member.storyId)
  if (!story) {
    throw storyNotFound(member.storyId)
  }

  const { axis, ix, iy } = member.position
  const endIx = axis === 'X' ? ix + 1 : ix
  const endIy = axis === 'Y' ? iy + 1 : iy
  const startPoint = gridPoint(project.grid, ix, iy)
  const endPoint = gridPoint(project.grid, endIx, endIy)
  const startSection = supportColumnSection(project, member, ix, iy, 'start')
  const endSection = supportColumnSection(project, member, endIx, endIy, 'end')

  const centerSpan =
    axis === 'X' ? endPoint.x - startPoint.x : endPoint.y - startPoint.y
  const startFaceOffsetMm =
    (axis === 'X' ? startSection.b : startSection.d) / 2
  const endFaceOffsetMm = (axis === 'X' ? endSection.b : endSection.d) / 2
  const clearLengthMm = centerSpan - startFaceOffsetMm - endFaceOffsetMm

  if (clearLengthMm <= 0) {
    throw new MemberUnsupportedError(
      '寸法不成立',
      `耐震壁 内法長さ must be positive: ${member.id} (${clearLengthMm} mm)`,
    )
  }

  const girderDepthAboveMm = girderDepthAboveWall(project, member)
  const clearHeightMm = story.height - girderDepthAboveMm

  if (clearHeightMm <= 0) {
    throw new MemberUnsupportedError(
      '寸法不成立',
      `耐震壁 内法高さ must be positive: ${member.id} ` +
        `(階高 ${story.height} − 上部大梁せい ${girderDepthAboveMm})`,
    )
  }

  return {
    axis,
    clearLengthMm,
    clearHeightMm,
    startFaceOffsetMm,
    endFaceOffsetMm,
    girderDepthAboveMm,
  }
}

/**
 * 床板（スラブ）1ベイの内法寸法と、四辺で受ける大梁。
 *
 * 躯体の区分（第4編第1章第2節（４））が床板を「柱、梁等に接する水平材の内法部分」
 * と定めるので、測るのは通り芯間ではなく大梁の内側面の間である。柱・大梁と
 * 二重計上しないのはこの定義そのもので、大梁が内法長さ・壁が内法部分なのと同じ形だ。
 */
export interface SlabBay {
  /** 通り芯間スパン (mm) */
  centerSpanXMm: number
  centerSpanYMm: number
  /** 内法長さ (mm) — X方向は両側の Y通り大梁の内側面の間 */
  clearXMm: number
  clearYMm: number
  /** ベイ原点の格子点から内法域の原点までの距離 (mm) ＝ 受ける大梁幅の1/2 */
  startFaceOffsetXMm: number
  startFaceOffsetYMm: number
  /** 四辺で受ける大梁。X方向の内法を決めるのは minX・maxX（Y通り大梁）である */
  supports: {
    minX: SlabEdgeSupport
    maxX: SlabEdgeSupport
    minY: SlabEdgeSupport
    maxY: SlabEdgeSupport
  }
}

/** 床板筋が定着していく先の大梁1本。 */
export interface SlabEdgeSupport {
  memberId: string
  /** 大梁の幅 b (mm) — 床板筋はこの中へ定着する */
  widthMm: number
  /** 定着が納まるかの判定は支点（大梁）のかぶりで行う — 床板のものではない */
  cover: Record<string, string | boolean>
}

function isSlabPosition(
  position: ColumnPosition | GirderPosition,
): position is SlabPosition {
  return !('axis' in position)
}

function girderSectionAt(
  project: Project,
  storyId: string,
  axis: 'X' | 'Y',
  ix: number,
  iy: number,
  requestedBy: Member,
): { member: Member; section: GirderSection } {
  const girder = project.members.find(
    (candidate) =>
      candidate.kind === '大梁' &&
      candidate.storyId === storyId &&
      isGirderPosition(candidate.position) &&
      candidate.position.axis === axis &&
      candidate.position.ix === ix &&
      candidate.position.iy === iy,
  )

  // 四辺のどれかが欠けると内法が決まらない。通り芯間で代用すれば大梁と重なった
  // 床板を計上してしまうので、黙って埋めない — 壁の上部大梁と同じ扱いである。
  if (!girder) {
    throw new Error(
      `Missing ${axis}通り大梁 beside 床板: ${requestedBy.id} (${ix}, ${iy})`,
    )
  }

  const section = findSection(project, girder.sectionId)
  if (section.kind !== '大梁') {
    throw new Error(`大梁 member references a non-大梁 section: ${girder.id}`)
  }

  return { member: girder, section }
}

export function slabBay(project: Project, member: Member): SlabBay {
  if (member.kind !== '床板' || !isSlabPosition(member.position)) {
    throw new Error(`slabBay requires a 床板: ${member.id}`)
  }

  const { ix, iy } = member.position
  const origin = gridPoint(project.grid, ix, iy)
  const far = gridPoint(project.grid, ix + 1, iy + 1)

  const edge = (
    axis: 'X' | 'Y',
    edgeIx: number,
    edgeIy: number,
  ): SlabEdgeSupport => {
    const { member: girder, section } = girderSectionAt(
      project,
      member.storyId,
      axis,
      edgeIx,
      edgeIy,
      member,
    )
    return {
      memberId: girder.id,
      widthMm: section.b,
      cover: coverConditions(section),
    }
  }

  // X方向の内法を決めるのは Y通り（縦に走る）大梁の幅である — 走る向きと
  // 幅を測る向きが直交するので、ここを取り違えると内法が入れ替わる。
  const supports = {
    minX: edge('Y', ix, iy),
    maxX: edge('Y', ix + 1, iy),
    minY: edge('X', ix, iy),
    maxY: edge('X', ix, iy + 1),
  }

  const centerSpanXMm = far.x - origin.x
  const centerSpanYMm = far.y - origin.y
  const startFaceOffsetXMm = supports.minX.widthMm / 2
  const startFaceOffsetYMm = supports.minY.widthMm / 2
  const clearXMm =
    centerSpanXMm - startFaceOffsetXMm - supports.maxX.widthMm / 2
  const clearYMm =
    centerSpanYMm - startFaceOffsetYMm - supports.maxY.widthMm / 2

  if (clearXMm <= 0 || clearYMm <= 0) {
    throw new MemberUnsupportedError(
      '寸法不成立',
      `床板 内法長さ must be positive: ${member.id} ` +
        `(X ${clearXMm} mm, Y ${clearYMm} mm)`,
    )
  }

  return {
    centerSpanXMm,
    centerSpanYMm,
    clearXMm,
    clearYMm,
    startFaceOffsetXMm,
    startFaceOffsetYMm,
    supports,
  }
}

/**
 * 同一断面の床板が大梁を通して連なる範囲 — 数量積算基準 2（４）床板1) の
 * 「同一の径の主筋が梁、壁等を通して連続する場合」がこれである。
 *
 * 大梁のラン (girderRun) と同じ形だ。1ベイなら長さ1のランで「単独床板」、
 * 2ベイ以上なら「連続する床板」になり、継手箇所数の条文が 2（４）床板2) に
 * 切り替わる。X方向とY方向で別のランを持つ — 床板は2方向に主筋が走るからだ。
 */
export interface SlabRun {
  axis: 'X' | 'Y'
  /** 軸方向の昇順。単独床板なら長さ1 */
  members: Member[]
  /** 通し筋を帰属させる部材 ＝ members[0].id */
  ownerId: string
  /** members と同じ順序 */
  bays: SlabBay[]
  /**
   * ラン原点（始端の大梁の内側面）から各ベイの内法域の始まりまでの距離 (mm)。
   * bays と同じ順序で [0] は 0 である。3D がランを1つの枠に描くとき、
   * 各ベイの箱をここに置く — 描画側で足し直すと配筋とずれる。
   */
  memberOffsetsMm: number[]
  /** ラン芯長 (mm) ＝ Σ内法長さ ＋ Σ中間大梁の幅 */
  coreLengthMm: number
  /** 割付方向（主筋と直交する向き）の内法長さ (mm) — ラン内で共通である */
  distributionClearMm: number
  /** 始端で定着していく大梁 */
  startSupport: SlabEdgeSupport
  /** 終端で定着していく大梁 */
  endSupport: SlabEdgeSupport
  /**
   * ランに開いている開口部 (1通則8))、**ラン原点からの座標**に直したもの。
   *
   * 開口はベイ（＝部材）ごとに入力されるが、床板の鉄筋はランで測るので、
   * 欠除も3Dの切り欠きもラン座標で見る。ここで一度だけ直しておかないと、
   * 数量と表示が別々にベイのオフセットを足し直して食い違う (ADR-029)。
   */
  openings: Opening[]
}

export function slabRun(
  project: Project,
  member: Member,
  axis: 'X' | 'Y',
): SlabRun {
  if (member.kind !== '床板' || !isSlabPosition(member.position)) {
    throw new Error(`slabRun requires a 床板: ${member.id}`)
  }

  const { ix, iy } = member.position
  const slabAt = (
    candidateIx: number,
    candidateIy: number,
  ): Member | undefined =>
    project.members.find(
      (candidate) =>
        candidate.kind === '床板' &&
        candidate.storyId === member.storyId &&
        // 同一断面であることを連続の条件にする。条文は「同一の径の主筋が」と
        // 言うが、径が同じでもピッチが違えば全部の鉄筋が通るわけではない —
        // 断面が同じことはその十分条件であって、図面にない連続を作らない。
        candidate.sectionId === member.sectionId &&
        isSlabPosition(candidate.position) &&
        candidate.position.ix === candidateIx &&
        candidate.position.iy === candidateIy,
    )

  const step = (offset: number): [number, number] =>
    axis === 'X' ? [ix + offset, iy] : [ix, iy + offset]

  const members: Member[] = [member]
  for (let offset = -1; ; offset -= 1) {
    const previous = slabAt(...step(offset))
    if (!previous) break
    members.unshift(previous)
  }
  for (let offset = 1; ; offset += 1) {
    const next = slabAt(...step(offset))
    if (!next) break
    members.push(next)
  }

  const bays = members.map((candidate) => slabBay(project, candidate))
  const clearAlong = (bay: SlabBay): number =>
    axis === 'X' ? bay.clearXMm : bay.clearYMm
  const clearAcross = (bay: SlabBay): number =>
    axis === 'X' ? bay.clearYMm : bay.clearXMm

  // 割付本数は 1通則7) が「その部分の長さ」を鉄筋の間隔で除して求める1つの数だ。
  // ランの途中で直交方向の内法が変われば、その1つの数がどちらのベイでも正しく
  // ならない — 一部だけ通る鉄筋を製品が表現できないので、作らずに落とす。
  const distributionClearMm = clearAcross(bays[0])
  const uneven = bays.findIndex(
    (bay) => clearAcross(bay) !== distributionClearMm,
  )
  if (uneven > 0) {
    throw new MemberUnsupportedError(
      '寸法不成立',
      `床板ラン内で割付方向の内法長さが揃わない: ${members[0].id} ` +
        `(${distributionClearMm} mm) と ${members[uneven].id} ` +
        `(${clearAcross(bays[uneven])} mm)`,
    )
  }

  // 中間大梁の幅は「幅の1/2」が両側から来て1本分になる — 2（４）床板1) の
  // 但書がそう定める。大梁のラン芯長が中間柱せいを足すのと同じ形だ。
  // ベイの始まりを一度だけ累積し、最後のベイの始まり ＋ その内法を芯長とする —
  // 二つを別々に数えるとすぐ食い違う（大梁のランと同じ約束）。
  const memberOffsetsMm: number[] = []
  let offsetMm = 0
  for (const bay of bays) {
    memberOffsetsMm.push(offsetMm)
    offsetMm +=
      clearAlong(bay) +
      (axis === 'X' ? bay.supports.maxX : bay.supports.maxY).widthMm
  }
  const coreLengthMm =
    memberOffsetsMm[memberOffsetsMm.length - 1] +
    clearAlong(bays[bays.length - 1])

  const first = bays[0]
  const last = bays[bays.length - 1]

  // ベイ局所の開口をラン座標へ移す。走る向きにだけベイのオフセットが乗る —
  // 直交方向の内法はラン内で共通なので（上でそれを検査している）そのままだ。
  const openings = members.flatMap((candidate, index) =>
    (candidate.openings ?? []).map((opening) => ({
      ...opening,
      xMm: opening.xMm + (axis === 'X' ? memberOffsetsMm[index] : 0),
      yMm: opening.yMm + (axis === 'Y' ? memberOffsetsMm[index] : 0),
    })),
  )

  return {
    axis,
    members,
    ownerId: members[0].id,
    bays,
    memberOffsetsMm,
    coreLengthMm,
    distributionClearMm,
    startSupport: axis === 'X' ? first.supports.minX : first.supports.minY,
    endSupport: axis === 'X' ? last.supports.maxX : last.supports.maxY,
    openings,
  }
}

export interface GirderRun {
  axis: 'X' | 'Y'
  /** 축방향 오름차순. 단일 스팬이면 길이 1 */
  members: Member[]
  /** 通し筋을 귀속시킬 부재 = members[0].id */
  ownerId: string
  /** members와 같은 순서 */
  spans: GirderSpan[]
  /**
   * 런 원점(시작 柱の内側面)에서 각 스팬 시작면까지의 거리 (mm). members와 같은
   * 순서이고 [0]은 0이다.
   *
   * 通し筋은 런 전체를 한 프레임에 덮지만 あばら筋은 각 부재 자기 스팬 로컬(0 기준)
   * 이다. 런을 한 프레임에 그리는 쪽이 이 오프셋을 모르면 2번째 이후 스팬의
   * あばら筋이 1번째 스팬 위에 겹친다.
   */
  memberOffsetsMm: number[]
  /** 通し筋 코어 길이 (mm) = Σ内法 ＋ Σ中間柱の軸方向せい */
  coreLengthMm: number
}

function girderAxisIndex(position: GirderPosition): number {
  return position.axis === 'X' ? position.ix : position.iy
}

export function girderRun(project: Project, member: Member): GirderRun {
  if (member.kind !== '大梁' || !isGirderPosition(member.position)) {
    throw new Error(`girderRun requires a 大梁: ${member.id}`)
  }

  const position = member.position
  const candidates = project.members
    .filter((candidate) => {
      if (
        candidate.kind !== '大梁' ||
        candidate.storyId !== member.storyId ||
        !isGirderPosition(candidate.position) ||
        candidate.position.axis !== position.axis
      ) {
        return false
      }

      return position.axis === 'X'
        ? candidate.position.iy === position.iy
        : candidate.position.ix === position.ix
    })
    .sort((left, right) => {
      if (!isGirderPosition(left.position) || !isGirderPosition(right.position)) {
        throw new Error('大梁 run contains a non-girder position')
      }
      return girderAxisIndex(left.position) - girderAxisIndex(right.position)
    })
  const memberIndex = candidates.findIndex(({ id }) => id === member.id)

  if (memberIndex < 0) {
    throw new Error(`大梁 member not found in project: ${member.id}`)
  }

  let first = memberIndex
  let last = memberIndex
  while (
    first > 0 &&
    girderAxisIndex(candidates[first - 1].position as GirderPosition) ===
      girderAxisIndex(candidates[first].position as GirderPosition) - 1
  ) {
    first -= 1
  }
  while (
    last + 1 < candidates.length &&
    girderAxisIndex(candidates[last + 1].position as GirderPosition) ===
      girderAxisIndex(candidates[last].position as GirderPosition) + 1
  ) {
    last += 1
  }

  const members = candidates.slice(first, last + 1)
  const sectionId = members[0].sectionId
  if (members.some((candidate) => candidate.sectionId !== sectionId)) {
    throw new Error(
      `大梁 run contains mixed sections: ${members.map(({ id, sectionId: idOfSection }) => `${id}:${idOfSection}`).join(', ')}`,
    )
  }

  const spans = members.map((candidate) => girderSpan(project, candidate))
  // 스팬 시작면들의 누적 위치. 마지막 스팬 시작면 ＋ 그 内法이 코어 길이다 —
  // 두 값을 따로 세면 곧 어긋나므로 한 번만 누적한다.
  const memberOffsetsMm: number[] = []
  let offsetMm = 0
  for (const span of spans) {
    memberOffsetsMm.push(offsetMm)
    offsetMm += span.clear + span.endSupportLengthAlongAxisMm
  }
  const lastSpan = spans[spans.length - 1]
  const coreLengthMm =
    memberOffsetsMm[memberOffsetsMm.length - 1] + lastSpan.clear

  return {
    axis: position.axis,
    members,
    ownerId: members[0].id,
    spans,
    memberOffsetsMm,
    coreLengthMm,
  }
}

/**
 * 柱主筋の端部条件 (R7①・R9①)。
 *
 * 定着(bottom)은 스택의 **최하단**(기초)에만 붙는다. 中間 접합부는 철근이
 * 그대로 지나가므로 なし다.
 *
 * top은 定着을 붙이지 않는다 — 항상 なし(중간 접합부, 위층으로 통과) 아니면
 * 先端(스택 최상단, 위에 柱가 없음)이다. 数量積算基準 1通則1)「先端で止まる
 * 鉄筋は、コンクリートの設計寸法をその部分の鉄筋の長さとする」＋（２）柱1)
 * 但書「最上階柱の主筋については、１通則１）による」가 最上階柱主筋을 명시적으로
 * 1通則1)에 걸어두므로, 스택 최상단은 定着 없이 콘크리트 설계 치수까지만
 * 간다(R9①). 이전에는 스택 최상단에도 定着을 붙였는데, 이는 조문과 어긋났다.
 *
 * 접합부의 **継手는 여기서 다루지 않는다.** 数量積算基準 2（２）柱2)가
 * 「各階柱の全長にわたる主筋については各階ごとに1か所」로 정하므로 층마다
 * 조문대로 1か所이고, 그 배분을 제품이 정할 여지가 없다. 예전에는 접합부의
 * 継手를 위층 부재에 귀속시키는 관행을 코드가 들고 있었는데(그래서 최하층은
 * 継手가 0이었다), 조문이 그 자리를 대신한다.
 *
 * 스택 순서는 `stories` 배열 순서를 그대로 신뢰한다 — Story에 레벨 값이 없다.
 */
export interface ColumnEnds {
  bottom: '定着' | 'なし'
  top: 'なし' | '先端'
}

export function columnEnds(project: Project, member: Member): ColumnEnds {
  const { position } = member

  if (member.kind !== '柱' || !isColumnPosition(position)) {
    throw new Error(`columnEnds requires a 柱: ${member.id}`)
  }

  const level = project.stories.findIndex(({ id }) => id === member.storyId)
  if (level < 0) {
    throw storyNotFound(member.storyId)
  }

  const hasColumnAtLevel = (candidateLevel: number): boolean => {
    const story = project.stories[candidateLevel]
    if (story === undefined) return false

    return project.members.some(
      (candidate) =>
        candidate.kind === '柱' &&
        candidate.storyId === story.id &&
        isColumnPosition(candidate.position) &&
        candidate.position.ix === position.ix &&
        candidate.position.iy === position.iy,
    )
  }

  return {
    bottom: hasColumnAtLevel(level - 1) ? 'なし' : '定着',
    top: hasColumnAtLevel(level + 1) ? 'なし' : '先端',
  }
}

export function beamDepthAbove(project: Project, member: Member): number {
  if (member.kind !== '柱' || !isColumnPosition(member.position)) {
    throw new Error(`beamDepthAbove requires a 柱: ${member.id}`)
  }

  const depths = project.members
    .filter(
      (candidate) =>
        candidate.kind === '大梁' &&
        candidate.storyId === member.storyId &&
        isGirderPosition(candidate.position) &&
        touchesColumn(candidate.position, member.position),
    )
    .map((girder) => {
      const section = findSection(project, girder.sectionId)
      if (section.kind !== '大梁') {
        throw new Error(
          `大梁 member references a non-大梁 section: ${girder.id}`,
        )
      }
      return section.depth
    })

  if (depths.length === 0) {
    throw new Error(`No touching 大梁 found above 柱: ${member.id}`)
  }

  return Math.max(...depths)
}

export function setNote(
  project: Project,
  lineId: string,
  note: string,
): Project {
  const notes = { ...project.notes }

  if (note === '') delete notes[lineId]
  else notes[lineId] = note

  return { ...project, notes }
}

/** 빈 입력은 키를 지운다 — 0 kg/m는 입력이 아니라 없는 값이다. */
export function setUnitMass(
  project: Project,
  size: ShearBarSize,
  value: number | null,
): Project {
  const unitMass = { ...project.unitMass }

  if (value === null) delete unitMass[size]
  else unitMass[size] = value

  return { ...project, unitMass }
}

export function serializeProject(project: Project): string {
  return JSON.stringify(project)
}

const isString = (value: unknown): boolean => typeof value === 'string'

const isFiniteNumber = (value: unknown): boolean =>
  typeof value === 'number' && Number.isFinite(value)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasShape(
  value: unknown,
  fields: Record<string, (field: unknown) => boolean>,
): boolean {
  return (
    isRecord(value) &&
    Object.entries(fields).every(([key, check]) => check(value[key]))
  )
}

const isNumberArray = (value: unknown): boolean =>
  Array.isArray(value) && value.every(isFiniteNumber)

/** 呼び名＋本数のような小さな組を検める。 */
const shapedAs =
  (fields: Record<string, (field: unknown) => boolean>) =>
  (value: unknown): boolean =>
    hasShape(value, fields)

const isMainRow = (value: unknown): boolean => {
  if (
    !hasShape(value, {
      endCount: isFiniteNumber,
      centerCount: isFiniteNumber,
    })
  ) {
    return false
  }

  const row = value as Record<string, unknown>
  return row.startCount === undefined || isFiniteNumber(row.startCount)
}

const isAxis = (value: unknown): boolean => value === 'X' || value === 'Y'

/**
 * 種別ごとに、**取り込んだ直後の計算が見守りなしに参照する**場だけを並べる。
 *
 * ここに無い場 (fc・grade・exposure・spliceMethod など) は、欠けてもルールパック
 * 引きが名前のある例外で止める — どこで何が足りないかが画面に出る。
 * 選んであるのは TypeError になる場 — それだけが「何が起きたか言えない落ち方」をする。
 */
const isBarRow = shapedAs({
  size: isString,
  pitch: isFiniteNumber,
  startOffsetMm: isFiniteNumber,
})

/**
 * 寸法の鍵は種別で違う。柱・大梁は b とせいだが、耐震壁・床板は thickness 一つ
 * だ — 躯体の区分が壁を「内法部分」、床板を「内法部分」と定めるので、長さは
 * 位置と隣の部材から出て断面には無い (ADR-025・ADR-028)。共通の場所で b を
 * 求めると、正しい壁の記録が形違いとして弾かれる。
 */
const SECTION_FIELDS: Record<
  MemberKind,
  Record<string, (field: unknown) => boolean>
> = {
  柱: {
    b: isFiniteNumber,
    d: isFiniteNumber,
    main: shapedAs({ size: isString, count: isFiniteNumber }),
    hoop: isBarRow,
  },
  大梁: {
    b: isFiniteNumber,
    depth: isFiniteNumber,
    main: shapedAs({
      size: isString,
      top: isMainRow,
      bottom: isMainRow,
      cutoffFromSupportFaceMm: isFiniteNumber,
    }),
    stirrup: isBarRow,
  },
  耐震壁: {
    thickness: isFiniteNumber,
    // 層数はそのまま本数の倍率だ。欠けると縦筋・横筋の本数が NaN になる。
    layers: isFiniteNumber,
    vertical: isBarRow,
    horizontal: isBarRow,
  },
  床板: {
    thickness: isFiniteNumber,
    x: shapedAs({ top: isBarRow, bottom: isBarRow }),
    y: shapedAs({ top: isBarRow, bottom: isBarRow }),
  },
}

/**
 * 位置の形も種別で違う。床板は格子点ではなく**ベイ**を指すので (ix, iy) と
 * (ix+1, iy+1) の両方を引く — 形は柱と同じでも意味が違う。
 */
const POSITION_FIELDS: Record<
  MemberKind,
  Record<string, (field: unknown) => boolean>
> = {
  柱: { ix: isFiniteNumber, iy: isFiniteNumber },
  大梁: { axis: isAxis, ix: isFiniteNumber, iy: isFiniteNumber },
  耐震壁: { axis: isAxis, ix: isFiniteNumber, iy: isFiniteNumber },
  床板: { ix: isFiniteNumber, iy: isFiniteNumber },
}

const isOpening = shapedAs({
  id: isString,
  xMm: isFiniteNumber,
  yMm: isFiniteNumber,
  widthMm: isFiniteNumber,
  heightMm: isFiniteNumber,
})

const isBarSize = (value: unknown): value is BarSize =>
  BAR_SIZES.includes(value as BarSize)

const isPositiveInteger = (value: unknown): boolean =>
  typeof value === 'number' && Number.isInteger(value) && value > 0

const isNonNegativeFiniteNumber = (value: unknown): boolean =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

const isOpeningReinforcement = shapedAs({
  size: isBarSize,
  count: isPositiveInteger,
  // 0 is the persisted 未転記 state. The rebar generators omit it until the
  // design-document transcription supplies a length.
  lengthMm: isNonNegativeFiniteNumber,
})

const isOpeningWithReinforcements = (value: unknown): boolean => {
  if (!isOpening(value)) return false

  const reinforcements = (value as { reinforcements?: unknown }).reinforcements
  return (
    reinforcements === undefined ||
    (Array.isArray(reinforcements) &&
      reinforcements.every(isOpeningReinforcement))
  )
}

const isMemberKind = (value: unknown): boolean =>
  MEMBER_KINDS.includes(value as MemberKind)

/**
 * 骨格だけを検める。取り込む案件は他人が作った文字列で、schemaVersion しか
 * 見ずに通すと形の違う JSON が Project として奥まで入る — 数量が NaN になるか
 * 画面が落ちるかで、どちらも「読み込めなかった」より悪い。
 *
 * 検めるのは製品がすぐ添字を引く場所 (stories・members・sections・grid) と、
 * 内訳書のセルにそのまま出る文字列だけだ。値の妥当性 (径が実在するか、
 * 本数が正か) はここでは見ない — それは断面一覧の入力検査の持ち場で、
 * ここで二重に持つと規準が二か所に分かれる。
 */
/**
 * 形だけ通って中身の参照が切れている記録を切る。
 *
 * ここで見ないと、後から描画の途中で落ちる — useProjectPersistence の
 * catch は loadProject が触った所 (最初の柱) しか見ないので、大梁の断面が
 * 欠けている記録はそこを素通りして PaneBoundary に出る。
 */
interface ReferencedPosition {
  axis?: 'X' | 'Y'
  ix: number
  iy: number
}

function hasIntactReferences(
  grid: Grid,
  sections: { id: string; kind: MemberKind }[],
  stories: { id: string }[],
  members: {
    kind: MemberKind
    sectionId: string
    storyId: string
    position: ReferencedPosition
  }[],
): boolean {
  const sectionKinds = new Map(sections.map(({ id, kind }) => [id, kind]))
  const storyIds = new Set(stories.map(({ id }) => id))
  const { nx, ny } = gridPointCount(grid)

  // 大梁・耐震壁は隣の交点まで伸びるので、その軸だけ一つ手前までだ。床板は
  // ベイなので両軸とも一つ手前 — slabBay が (ix+1, iy+1) を引く。
  const inGrid = (
    kind: MemberKind,
    { axis, ix, iy }: ReferencedPosition,
  ): boolean => {
    const spansX = kind === '床板' || axis === 'X'
    const spansY = kind === '床板' || axis === 'Y'

    return (
      Number.isInteger(ix) &&
      Number.isInteger(iy) &&
      ix >= 0 &&
      iy >= 0 &&
      ix < nx - (spansX ? 1 : 0) &&
      iy < ny - (spansY ? 1 : 0)
    )
  }

  return members.every(
    (member) =>
      // 種別違いも切る。大梁が柱の断面を指すと buildingLayout が投げる。
      sectionKinds.get(member.sectionId) === member.kind &&
      storyIds.has(member.storyId) &&
      // グリッドの外を指す位置は gridPoint が RangeError で投げ、全ペインが落ちる。
      // その案件を自動保存が書くので、次の訪問でも同じ所で落ちる。
      inGrid(member.kind, member.position),
  )
}

function hasGridLabels(grid: unknown): boolean {
  if (!isRecord(grid)) return false
  const { xSpans, ySpans, xLabels, yLabels } = grid
  if (!Array.isArray(xSpans) || !Array.isArray(ySpans)) return false

  return (
    (xLabels === undefined || isGridLabels(xLabels, xSpans.length)) &&
    (yLabels === undefined || isGridLabels(yLabels, ySpans.length))
  )
}

function isProjectShape(value: unknown): boolean {
  if (!isRecord(value)) return false

  const { stories, sections, members, notes, unitMass } = value

  return (
    isString(value.name) &&
    hasShape(value.grid, { xSpans: isNumberArray, ySpans: isNumberArray }) &&
    // 라벨은 없어도 되지만, 있으면 축의 본수와 맞아야 한다 — 어긋난 배열은
    // 「어느 通り芯의 이름인가」를 잃은 기록이고, 그대로 두면 화면이 엉뚱한
    // 축에 이름을 붙인다
    hasGridLabels(value.grid) &&
    // 空の stories は「階が無い案件」ではなく壊れた記録だ。製品は至る所で
    // stories[0] を既定値に使う。
    Array.isArray(stories) &&
    stories.length > 0 &&
    stories.every((story) =>
      hasShape(story, { id: isString, name: isString, height: isFiniteNumber }),
    ) &&
    Array.isArray(sections) &&
    sections.every(
      (section) =>
        hasShape(section, {
          id: isString,
          // 判別子は特別だ。ここが union の外の値だと、形は通ったまま
          // 断面の枝分かれが選べず、算定の途中で落ちる。
          kind: isMemberKind,
          mark: isString,
        }) &&
        // せいも配筋の入力も種別で鍵が違う。共通の場所だけで済ませると、
        // せい の欠けた断面が通って帯筋の加工寸法が NaN のまま内訳書の合計まで
        // 流れ、main/hoop/stirrup の欠けた断面は generateColumnRebar の中で
        // TypeError になる—どちらもこの関数が止めたかった結果そのものだ。
        // 枝を選べるのは上で判別子を検めてあるからだ。
        hasShape(section, SECTION_FIELDS[(section as Section).kind]),
    ) &&
    Array.isArray(members) &&
    members.every(
      (member) =>
        hasShape(member, {
          id: isString,
          kind: isMemberKind,
          sectionId: isString,
          storyId: isString,
        }) &&
        // position が無ければ buildingLayout の `'axis' in member.position` が
        // その場で TypeError になる。軸は 'X'/'Y' 以外を通さない —
        // 三項演算子で Y に落ちて、図面に無い向きの大梁を黙って作る。
        hasShape(member, {
          position: shapedAs(POSITION_FIELDS[(member as Member).kind]),
        }) &&
        // 開口は無くてよい (「開口なし」の意) が、有るなら配列でなければ
        // ならない — openingDeduction が中を読んで欠除量を出すからだ。
        ((member as { openings?: unknown }).openings === undefined ||
          (Array.isArray((member as { openings?: unknown }).openings) &&
            ((member as { openings: unknown[] }).openings).every(
              isOpeningWithReinforcements,
            ))),
    ) &&
    (notes === undefined ||
      (isRecord(notes) && Object.values(notes).every(isString))) &&
    (unitMass === undefined ||
      (isRecord(unitMass) && Object.values(unitMass).every(isFiniteNumber))) &&
    // ここまでで 3 つの配列は形が済んでいる。残るのは互いの指し合いだ。
    hasIntactReferences(
      value.grid as Grid,
      sections as { id: string; kind: MemberKind }[],
      stories as { id: string }[],
      members as {
        kind: MemberKind
        sectionId: string
        storyId: string
        position: ReferencedPosition
      }[],
    )
  )
}

export function deserializeProject(json: string): Project {
  const parsed: unknown = JSON.parse(json)

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('schemaVersion' in parsed) ||
    parsed.schemaVersion !== PROJECT_SCHEMA_VERSION
  ) {
    throw new Error(
      `Unsupported Project schemaVersion; expected ${PROJECT_SCHEMA_VERSION}`,
    )
  }

  if (!isProjectShape(parsed)) {
    throw new Error('Project shape mismatch')
  }

  return parsed as Project
}
