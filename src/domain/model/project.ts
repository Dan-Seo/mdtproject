import type {
  ColumnSection,
  ColumnPosition,
  GirderPosition,
  Member,
  Section,
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
// v6 (2026-08-21): GirderSection에 두 갈래 변경이 함께 들어갔다 — 둘 다
// 영속 데이터가 없는 상태에서 같은 판으로 나가므로 버전은 하나다.
//   ① (M3b) main の topCount·bottomCount を位置別 (端部·中央) の GirderMainRow に
//      置き換え、カットオフ位置を必須入力にした。積算基準 2（３）梁1) が定めるのは
//      「梁の全長にわたる主筋」だけで、トップ筋等は設計図書に委ねられる —
//      位置別本数がないと通し筋とカットオフ筋を分けられない。
//   ② (M3c) 任意 필드 widthTie·sideBar 추가. 둘 다 「断面一覧에 없으면 그 배근이
//      없다」를 뜻하는 optional이다 — 있는지 없는지를 제품이 정하지 않는다.
//      腹筋의 余長은 積算基準 1通則6)이 JASS 5에 위임하는데 그 규격이 미확보라
//      룰팩 행이 아니라 입력으로 받는다 (R9②).
export const PROJECT_SCHEMA_VERSION = 6

export interface Grid {
  xSpans: number[]
  ySpans: number[]
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

  const memberCode = member.kind === '柱' ? 'C' : 'G'
  return `${story.name}|${memberCode}|${section.mark}`
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
  girder: Member,
  ix: number,
  iy: number,
  end: 'start' | 'end',
): ColumnSection {
  const support = project.members.find(
    (candidate) =>
      candidate.kind === '柱' &&
      candidate.storyId === girder.storyId &&
      isColumnPosition(candidate.position) &&
      candidate.position.ix === ix &&
      candidate.position.iy === iy,
  )

  if (!support) {
    throw new Error(`Missing ${end} support 柱 for 大梁: ${girder.id}`)
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

export function serializeProject(project: Project): string {
  return JSON.stringify(project)
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

  return parsed as Project
}
