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
  issues: string[]
}

export interface ParsedSectionList {
  listKind: string
  candidates: SectionCandidate[]
}
