import type {
  ColumnSection,
  GirderSection,
  Member,
  SlabSection,
  WallSection,
} from './member'
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
export const columnSection: ColumnSection = {
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

export const girderSections: GirderSection[] = [
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
    spliceMethod: '重ね継手',
    main: {
      size: 'D25',
      top: { endCount: 4, centerCount: 4 },
      bottom: { endCount: 4, centerCount: 4 },
      // 設計図書由来の入力 — 規準に値はない (ADR-012)。端部と中央が同数の
      // このサンプルではカットオフ筋が立たないので算出には効かない。
      cutoffFromSupportFaceMm: 1500,
    },
    stirrup: { size: 'D13', pitch: 100, startOffsetMm: 50 },
    // M3c の日本固有詳細。実図面の断面リストにある値をそのまま例に使う
    // （幅止筋 D10@1000・腹筋 2-D10）。腹筋の余長は規準値が取れないので
    // 0＝未入力のまま — 入れない限り計上しない (R9②)。G2 は両方とも
    // 「なし」にして、断面一覧に記載がない梁の見え方も残す。
    widthTie: { size: 'D10', pitch: 1000 },
    sideBar: { size: 'D10', count: 2, extraLengthMm: 0 },
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
    spliceMethod: '重ね継手',
    main: {
      size: 'D22',
      top: { endCount: 4, centerCount: 4 },
      bottom: { endCount: 4, centerCount: 4 },
      // 設計図書由来の入力 — 規準に値はない (ADR-012)。端部と中央が同数の
      // このサンプルではカットオフ筋が立たないので算出には効かない。
      cutoffFromSupportFaceMm: 1500,
    },
    stirrup: { size: 'D13', pitch: 150, startOffsetMm: 50 },
  },
]

// 耐震壁 (ADR-024)。ラーメン構造の壁なので数量積算基準 2（５）壁1)「壁式構造以外」
// で測る。屋内・仕上げありにしてあるのは柱・大梁と別のかぶりセル（表5.3.6 の
// 「柱、梁、耐力壁」行・屋内）を通すためで、壁だけ条件を変えられることの例でもある。
export const wallSection: WallSection = {
  id: 'section-W1',
  kind: '耐震壁',
  mark: 'W1',
  thickness: 200,
  fc: 24,
  grade: 'SD345',
  exposure: '屋内',
  finish: '仕上げあり',
  spliceMethod: '重ね継手',
  // 壁リストの「D13@200 ダブル」そのもの — 層数は規準ではなく図面の記載である。
  layers: 2,
  vertical: { size: 'D13', pitch: 200, startOffsetMm: 100 },
  horizontal: { size: 'D13', pitch: 200, startOffsetMm: 100 },
}

/**
 * 耐震壁は Y1〜Y2 の X1 通りに1枚だけ立てる。全スパンに入れると 3D が壁で埋まって
 * 中の配筋が見えなくなり、「入力したものが合っているか」を確かめるという
 * ビューアの用途 (ADR-016) を潰してしまう。
 */
function createWalls(storyId: string): Member[] {
  return [
    {
      id: `${storyId}-W1-X1Y1-Y`,
      kind: '耐震壁',
      memberClass: '躯体',
      sectionId: wallSection.id,
      storyId,
      position: { axis: 'Y', ix: 0, iy: 0 },
    },
  ]
}

/**
 * 床板（スラブ）(ADR-027)。数量積算基準 2（４）床板 で測る。屋内・屋外の入力を
 * 持たないのは表5.3.6 の「スラブ、耐力壁以外の壁」行に区別がないからで、
 * 仕上げありの 20mm がこの断面の最小かぶりになる — 柱・大梁の 30/40mm より薄い。
 * X方向とY方向で別々に径・ピッチを受け取る。スラブリストの「D13@200 タテヨコ」
 * という記載そのものであって、規準側に本数を定める条文はない (ADR-012)。
 */
export const slabSection: SlabSection = {
  id: 'section-S1',
  kind: '床板',
  mark: 'S1',
  thickness: 200,
  fc: 24,
  grade: 'SD345',
  finish: '仕上げあり',
  spliceMethod: '重ね継手',
  x: {
    top: { size: 'D13', pitch: 200, startOffsetMm: 100 },
    bottom: { size: 'D13', pitch: 200, startOffsetMm: 100 },
  },
  y: {
    top: { size: 'D13', pitch: 200, startOffsetMm: 100 },
    bottom: { size: 'D13', pitch: 200, startOffsetMm: 100 },
  },
}

/**
 * 床板は通り芯で囲まれた全ベイに置く。壁と違って全部置くのは、床板が階の
 * 天井面にしかなく下の配筋を隠さないからだ（壁は立ち上がって中を覆う）。
 * Y方向に2ベイ並ぶので、同じサンプルの中に「連続する床板」（Y方向・2ベイ）と
 * 「単独床板」（X方向・1ベイ）の両方が出る — 継手の条文が切り替わる境目を
 * 画面で確かめられる。
 */
function createSlabs(storyId: string): Member[] {
  const { nx, ny } = gridPointCount(sampleGrid)
  const slabs: Member[] = []

  for (let iy = 0; iy < ny - 1; iy += 1) {
    for (let ix = 0; ix < nx - 1; ix += 1) {
      slabs.push({
        id: `${storyId}-S1-X${ix + 1}Y${iy + 1}`,
        kind: '床板',
        memberClass: '躯体',
        sectionId: slabSection.id,
        storyId,
        position: { ix, iy },
      })
    }
  }

  return slabs
}

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
    sections: [columnSection, ...girderSections, wallSection, slabSection],
    members: sampleStories.flatMap(({ id }) => [
      ...createColumns(id),
      ...createGirders(id),
      ...createWalls(id),
      ...createSlabs(id),
    ]),
  }
}
