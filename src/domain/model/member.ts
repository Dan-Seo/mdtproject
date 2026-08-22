/** BAR_SIZES と同じく、実行時に検められるよう配列から型を起こす。 */
export const MEMBER_KINDS = ['柱', '大梁'] as const

export type MemberKind = (typeof MEMBER_KINDS)[number]

export type MemberClass = '躯体'

/** 허용 철근 경의 단일 출처 — UI 셀렉트·断面リスト 파서가 여기서 파생한다. */
export const BAR_SIZES = [
  'D10',
  'D13',
  'D16',
  'D19',
  'D22',
  'D25',
  'D29',
  'D32',
] as const

export type BarSize = (typeof BAR_SIZES)[number]

export type SteelGrade = 'SD295' | 'SD345' | 'SD390'

/**
 * 主筋の継手方式。断面一覧の入力であって製品が決めない (ADR-012)。
 *
 * 数量積算基準 1通則4)・5) が名指すのは重ね継手とガス圧接継手だけなので、
 * 機械式・溶接の扱いはルールパック側で `inferred` の行になる — 選べるが
 * 未確認として警告が付く (ADR-015)。
 */
export const SPLICE_METHODS = [
  '重ね継手',
  'ガス圧接',
  '機械式',
  '溶接',
] as const

export type SpliceMethod = (typeof SPLICE_METHODS)[number]

/** 表5.3.6 のかぶり厚さセルを特定する入力 (屋内・屋外 × 仕上げの有無)。 */
export type Exposure = '屋内' | '屋外'

export type Finish = '仕上げあり' | '仕上げなし'

export interface ColumnSection {
  id: string
  kind: '柱'
  mark: string
  /**
   * 断面リスト에서 취입할 때 어느 階 행에서 왔는지. 符号(mark)에 붙이면 도면에 없는
   * 符号이 内訳書에 그대로 나가고 内訳書는 이미 階별로 묶여 있어 階가 두 번 표시된다.
   * 제품의 Story와는 아직 연결되지 않는다 — 표시·취입 매칭용이다.
   */
  storyLabel?: string
  b: number
  d: number
  fc: number
  grade: SteelGrade
  exposure: Exposure
  finish: Finish
  /** 主筋の継手方式 — 継手箇所数と設計長さへの算入を決める (積算基準 1通則4)・5)) */
  spliceMethod: SpliceMethod
  main: {
    size: BarSize
    count: number
  }
  hoop: {
    size: BarSize
    pitch: number
    /**
     * 配置区間의 양 끝면에서 第1·最終帯筋을 얼마나 띄우는지. 規準에 값이 없고
     * 本数를 좌우하므로 제품이 정하지 않는다 — 断面一覧의 입력이다 (ADR-012).
     */
    startOffsetMm: number
  }
}

/** 大梁 主筋 1段（上端または下端）の位置別本数。断面リストの端部・中央行に対応する。 */
export interface GirderMainRow {
  /** 端部（支点側）の本数 */
  endCount: number
  /** 中央の本数 */
  centerCount: number
}

/**
 * 位置別本数を「梁の全長にわたる主筋」と「そうでない主筋」に分けた結果。
 *
 * 数量積算基準 2（３）梁1) が長さを定めるのは全長にわたる主筋だけで、トップ筋・
 * 補強筋等は設計図書に委ねられる。両位置に共通して立つ本数（少ない方）が通し筋、
 * 差がカットオフ筋である。
 */
export interface GirderMainSplit {
  throughCount: number
  cutoffCount: number
  /** カットオフ筋が立つ側。cutoffCount が 0 なら意味を持たない */
  cutoffAt: '端部' | '中央'
}

export function splitGirderMainRow(row: GirderMainRow): GirderMainSplit {
  return {
    throughCount: Math.min(row.endCount, row.centerCount),
    cutoffCount: Math.abs(row.endCount - row.centerCount),
    cutoffAt: row.endCount >= row.centerCount ? '端部' : '中央',
  }
}

export interface GirderSection {
  id: string
  kind: '大梁'
  mark: string
  /** ColumnSection.storyLabel과 같다. */
  storyLabel?: string
  b: number
  depth: number
  fc: number
  grade: SteelGrade
  exposure: Exposure
  finish: Finish
  /** ColumnSection.spliceMethod と同じ。通し筋の継手箇所数に効く */
  spliceMethod: SpliceMethod
  main: {
    size: BarSize
    /** 上端筋の位置別本数 — 断面リストの端部・中央行がそのまま入る */
    top: GirderMainRow
    /** 下端筋の位置別本数 */
    bottom: GirderMainRow
    /**
     * カットオフ筋を柱面から梁の内側へ何 mm で切り止めるか。
     *
     * 数量積算基準 2（３）梁1) が「トップ筋、ハンチ部分の主筋、補強筋等は設計図書
     * による」と委ねるので規準側に値がない — 断面一覧の入力である (ADR-012)。
     * 端部と中央が同数（カットオフ筋がない）断面では使われない。
     */
    cutoffFromSupportFaceMm: number
  }
  stirrup: {
    size: BarSize
    pitch: number
    /** 両端の柱面から第1・最終あばら筋をどれだけ離すか。規準に値はない — 断面一覧の入力である (ADR-012) */
    startOffsetMm: number
  }
  /**
   * 幅止め筋。断面一覧に記載のない梁には無い配筋なので任意項目とし、
   * `undefined` は「配筋なし」を意味する — 製品が勝手に足さない (ADR-012)。
   * 設計長さは数量積算基準 1通則3) が断面の設計幅と定めるので入力は径とピッチだけ。
   */
  widthTie?: {
    size: BarSize
    pitch: number
  }
  /**
   * 腹筋。`undefined` は「配筋なし」。本数は図面が「2-D10」と記載する数そのもの
   * なので 1通則7) の割付ではない。
   */
  sideBar?: {
    size: BarSize
    count: number
    /**
     * 梁の両端で内法を越えて伸びる余長 (mm)。数量積算基準 2（３）梁3) は
     * これを 1通則6) に委ね、同項は設計図書に記載がなければ JASS 5 準用と
     * する。JASS 5 は有料規格で未確保、標準仕様書5章には腹筋の記述が一切
     * ないため規準値を取れない — 設計図書の値を入力として受け取る (R9②)。
     */
    extraLengthMm: number
  }
}

export type Section = ColumnSection | GirderSection

/**
 * 화면 표시·aria-label용 이름. 같은 符号이 階별로 여러 断面이 될 수 있으므로
 * 階를 여기서 붙인다 — 저장되는 `mark`는 도면의 符号 그대로 둔다.
 */
export function sectionMarkLabel(section: Section): string {
  return section.storyLabel
    ? `${section.mark}(${section.storyLabel})`
    : section.mark
}

export interface ColumnPosition {
  ix: number
  iy: number
}

export interface GirderPosition {
  axis: 'X' | 'Y'
  ix: number
  iy: number
}

export interface Member {
  id: string
  kind: MemberKind
  memberClass: MemberClass
  sectionId: string
  storyId: string
  position: ColumnPosition | GirderPosition
}
