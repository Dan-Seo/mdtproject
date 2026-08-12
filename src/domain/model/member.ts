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

/** 表5.3.6 のかぶり厚さセルを特定する入力 (屋内・屋外 × 仕上げの有無)。 */
export type Exposure = '屋内' | '屋外'

export type Finish = '仕上げあり' | '仕上げなし'

export interface ColumnSection {
  id: string
  kind: '柱'
  mark: string
  b: number
  d: number
  fc: number
  grade: SteelGrade
  exposure: Exposure
  finish: Finish
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

export interface GirderSection {
  id: string
  kind: '大梁'
  mark: string
  b: number
  depth: number
  fc: number
  grade: SteelGrade
  exposure: Exposure
  finish: Finish
  main: {
    size: BarSize
    topCount: number
    bottomCount: number
  }
  stirrup: {
    size: BarSize
    pitch: number
    /** 両端の柱面から第1・最終あばら筋をどれだけ離すか。規準に値はない — 断面一覧の入力である (ADR-012) */
    startOffsetMm: number
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
