export type MemberKind = '柱' | '大梁'

export type MemberClass = '躯体'

export type BarSize =
  | 'D10'
  | 'D13'
  | 'D16'
  | 'D19'
  | 'D22'
  | 'D25'
  | 'D29'
  | 'D32'

export type SteelGrade = 'SD295' | 'SD345' | 'SD390'

export interface ColumnSection {
  id: string
  kind: '柱'
  mark: string
  b: number
  d: number
  fc: number
  grade: SteelGrade
  main: {
    size: BarSize
    count: number
  }
  hoop: {
    size: BarSize
    pitch: number
  }
}

export interface GirderSection {
  id: string
  kind: '大梁'
  mark: string
  b: number
  depth: number
  fc: number
  grade: SteelGrade
  main: {
    size: BarSize
    topCount: number
    bottomCount: number
  }
  stirrup: {
    size: BarSize
    pitch: number
  }
}

export type Section = ColumnSection | GirderSection

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
