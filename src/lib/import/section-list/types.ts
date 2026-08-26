import type {
  BarSize,
  ColumnShape,
  ShearBarSize,
} from '@/domain/model/member'

import type { TextItem } from '@/lib/import/types'

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
  '幅止め筋解釈不能',
  '階不明',
  '項目行重複',
  '壁筋解釈不能',
  '壁厚相違',
  '床板筋解釈不能',
] as const

export type CandidateIssue = (typeof CANDIDATE_ISSUES)[number]

/** リストから読んだ一つの符号・一つの階の候補。確実な値だけを保持する。 */
export interface SectionCandidate {
  kind: '柱' | '大梁' | '耐震壁' | '床板' | '対象外'
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
     * 端部欄の本数。位置で本数を分けている表だけが持ち、両端が同値のときに
     * 使う。左右で異なる表は asymmetricEnds に載せる。
     */
    endTopCount?: number
    endBottomCount?: number
    /**
     * 左右の端部本数が異なる表だけが持つ。labels は表の左端・右端の原文順で、
     * 上下どちらか一方だけが非対称な場合はその側の counts だけを持つ。
     */
    asymmetricEnds?: {
      labels: [string, string]
      topCounts?: [number, number]
      bottomCounts?: [number, number]
    }
    /** 端部のカットオフ寸法。左右が異なる場合は確定せず raw に残す。 */
    cutoffFromSupportFaceMm?: number
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
  /** 耐震壁の壁厚 (mm)。 */
  thickness?: number
  /** 耐震壁の配筋層数。図面のシングル/ダブル表記をそのまま受ける。 */
  layers?: 1 | 2
  /** 耐震壁の縦筋・横筋。 */
  vertical?: { size: BarSize; pitchMm: number }
  horizontal?: { size: BarSize; pitchMm: number }
  /** 床板の方向は、軸の決定前なので短辺・長辺のまま保持する。 */
  shortSide?: {
    top?: { size: BarSize; pitchMm: number }
    bottom?: { size: BarSize; pitchMm: number }
  }
  longSide?: {
    top?: { size: BarSize; pitchMm: number }
    bottom?: { size: BarSize; pitchMm: number }
  }
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
