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
export const CANDIDATE_ISSUES = [
  '主筋解釈不能',
  '主筋位置欠落',
  '主筋位置相違',
  '主筋上下径相違',
  '主筋折返し',
  '主筋ラベル行外',
  '断面矩形不成立',
  '帯筋解釈不能',
  '帯筋折返し',
  '階不明',
  '項目行重複',
] as const

export type CandidateIssue = (typeof CANDIDATE_ISSUES)[number]

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
