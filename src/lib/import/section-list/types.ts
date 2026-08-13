import type { BarSize } from '@/domain/model/member'

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
export type CandidateIssue =
  | '主筋解釈不能'
  | '主筋位置欠落'
  | '主筋位置相違'
  | '主筋折返し'
  | '断面矩形不成立'
  | '帯筋解釈不能'

/** リストから読んだ一つの符号・一つの階の候補。確実な値だけを保持する。 */
export interface SectionCandidate {
  kind: '柱' | '大梁' | '対象外'
  mark: string
  storyLabel?: string
  b?: number
  d?: number
  main?: { size: BarSize; count: number }
  hoop?: { size: BarSize; pitchMm: number }
  depth?: number
  girderMain?: {
    size: BarSize
    topCount: number
    bottomCount: number
  }
  stirrup?: { size: BarSize; pitchMm: number }
  /** 解釈できず空欄にした項目の原文。 */
  raw: Record<string, string>
  issues: CandidateIssue[]
}

export interface ParsedSectionList {
  listKind: string
  candidates: SectionCandidate[]
}
