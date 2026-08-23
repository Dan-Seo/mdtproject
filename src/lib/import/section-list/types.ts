import type {
  BarSize,
  ColumnShape,
  ShearBarSize,
} from '@/domain/model/member'

export interface TextItem {
  str: string
  x: number
  y: number
  w: number
  h: number
  rot?: number
}

export interface TextPage {
  widthPt: number
  heightPt: number
  items: TextItem[]
}

/**
 * 셀을 빈칸으로 남긴 사유 코드. 파서는 완성 문장이 아니라 코드만 싣고,
 * 표시부가 `sectionImport.issue.*` 키로 번역한다 (UnsupportedReason 패턴).
 */
export const CANDIDATE_ISSUES = [
  '主筋解釈不能',
  '主筋位置欠落',
  '主筋位置相違',
  '主筋端部左右相違',
  '主筋上下径相違',
  '主筋折返し',
  '主筋ラベル行外',
  '断面矩形不成立',
  '帯筋解釈不能',
  '帯筋折返し',
  '帯筋ラベル行外',
  '腹筋解釈不能',
  '階不明',
  '項目行重複',
] as const

export type CandidateIssue = (typeof CANDIDATE_ISSUES)[number]

/** リストから読んだ一つの符号・一つの階の候補。確実な値だけを保持する。 */
export interface SectionCandidate {
  kind: '柱' | '大梁' | '対象外'
  mark: string
  storyLabel?: string
  /** 柱の断面形状。'円形' のとき b・d はともに直径である (ADR-027)。 */
  shape?: ColumnShape
  b?: number
  d?: number
  main?: { size: BarSize; count: number }
  hoop?: { size: ShearBarSize; pitchMm: number }
  depth?: number
  girderMain?: {
    size: BarSize
    /** 中央欄の本数。位置で分かれていない表では全断面の本数 */
    topCount: number
    bottomCount: number
    /**
     * 端部欄の本数。位置で本数を分けている表だけが持ち、両端が同値のときしか
     * 埋めない — 左右で違う表はどちらが始端かを決められない (主筋端部左右相違)。
     */
    endTopCount?: number
    endBottomCount?: number
  }
  stirrup?: { size: ShearBarSize; pitchMm: number }
  /**
   * 幅止め筋。リスト表題の特記から読む — 表のセルではない。
   * 未定義は「その配筋がない」を意味する (ADR-012)。大梁にだけ載る
   * (数量積算基準 1通則3) の列挙に柱がない)。
   */
  widthTie?: { size: BarSize; pitchMm: number }
  /**
   * 腹筋。図面が「2-D10」と書く数そのもの — 1通則7) の割付ではない。
   * 未定義は「その配筋がない」を意味する (ADR-012)。
   * 余長 (extraLengthMm) は図面に無い — 取り込み側が決める (R9②)。
   */
  sideBar?: { size: BarSize; count: number }
  /** 解釈できず空欄にした項目の原文。 */
  raw: Record<string, string>
  issues: CandidateIssue[]
}

/**
 * 표 하나가 통째로 후보를 못 낸 사유. 후보 배열이 비었다는 사실만으로는
 * 「符号을 못 읽었다」와 「符号은 읽었는데 항목 행을 못 읽었다」가 구분되지 않고,
 * 둘은 사용자가 원도에서 볼 곳이 다르다.
 */
export const LIST_ISSUES = ['符号行未認識', '項目行未認識'] as const

export type ListIssue = (typeof LIST_ISSUES)[number]

export interface ParsedSectionList {
  listKind: string
  candidates: SectionCandidate[]
  issue?: ListIssue
}
