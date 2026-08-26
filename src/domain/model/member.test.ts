import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  BAR_SIZES,
  HIGH_STRENGTH_SHEAR_BAR_SIZES,
  SHEAR_BAR_SIZES,
  decomposeGirderMainRow,
  sectionMarkLabel,
  type BarSize,
  type ColumnSection,
  type GirderSection,
  type HighStrengthShearBarSize,
  type Member,
  type MemberClass,
  type MemberKind,
  type Section,
  type ShearBarSize,
  type SteelGrade,
  type WallSection,
} from './member'

describe('member model', () => {
  it('supports 柱・大梁・耐震壁・床板 as member kinds', () => {
    // 耐震壁は ADR-025、床板は ADR-028 で加わった。壁式構造の壁・基礎・小梁・
    // 雑壁は依然として部材にしない — ここが増えるときは ADR を伴う。
    expectTypeOf<MemberKind>().toEqualTypeOf<
      '柱' | '大梁' | '耐震壁' | '床板'
    >()
    expectTypeOf<MemberClass>().toEqualTypeOf<'躯体'>()
  })

  it('keeps the supported input bar sizes and steel grades explicit', () => {
    expectTypeOf<BarSize>().toEqualTypeOf<
      'D10' | 'D13' | 'D16' | 'D19' | 'D22' | 'D25' | 'D29' | 'D32'
    >()
    expectTypeOf<SteelGrade>().toEqualTypeOf<'SD295' | 'SD345' | 'SD390'>()
  })

  it('discriminates sections by their Japanese member kind', () => {
    const column: ColumnSection = {
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
    const girder: GirderSection = {
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
        cutoffFromSupportFaceMm: 0,
      },
      stirrup: { size: 'D13', pitch: 100, startOffsetMm: 50 },
    }
    const sections: Section[] = [column, girder]
    const members: Member[] = [
      {
        id: '1F-X1Y1',
        kind: '柱',
        memberClass: '躯体',
        sectionId: column.id,
        storyId: '1F',
        position: { ix: 0, iy: 0 },
      },
      {
        id: '1F-G1-X1Y1-X',
        kind: '大梁',
        memberClass: '躯体',
        sectionId: girder.id,
        storyId: '1F',
        position: { axis: 'X', ix: 0, iy: 0 },
      },
    ]

    expect(sections.map(({ kind }) => kind)).toEqual(['柱', '大梁'])
    expect(members.map(({ kind }) => kind)).toEqual(['柱', '大梁'])
  })

  it('composes the story label for display without storing it in mark', () => {
    const base: ColumnSection = {
      id: 'section-C51',
      kind: '柱',
      mark: 'C51',
      shape: '矩形',
      b: 800,
      d: 800,
      fc: 24,
      grade: 'SD345',
      exposure: '屋外',
      finish: '仕上げなし',
      spliceMethod: '重ね継手',
      main: { size: 'D25', count: 18 },
      hoop: { size: 'D13', pitch: 100, startOffsetMm: 0 },
    }

    expect(sectionMarkLabel(base)).toBe('C51')
    expect(sectionMarkLabel({ ...base, storyLabel: '2階' })).toBe('C51(2階)')
    // 内訳書는 이미 階별로 묶인다 — 저장되는 符号에는 階가 들어가지 않는다
    expect({ ...base, storyLabel: '2階' }.mark).toBe('C51')
  })
})

describe('decomposeGirderMainRow', () => {
  it.each([
    [
      'G51 上端筋の stub 型',
      { startCount: 8, centerCount: 8, endCount: 13 },
      {
        throughCount: 8,
        startStubCount: 0,
        endStubCount: 5,
        centerOnlyCount: 0,
        oneSidedCount: 0,
      },
    ],
    [
      'G51 下端筋の stub 型',
      { startCount: 8, centerCount: 8, endCount: 11 },
      {
        throughCount: 8,
        startStubCount: 0,
        endStubCount: 3,
        centerOnlyCount: 0,
        oneSidedCount: 0,
      },
    ],
    [
      'G55 上端筋の mixed 型',
      { startCount: 4, centerCount: 5, endCount: 8 },
      {
        throughCount: 4,
        startStubCount: 0,
        endStubCount: 3,
        centerOnlyCount: 0,
        oneSidedCount: 1,
        oneSidedAnchor: '終端',
      },
    ],
    [
      'G55 下端筋の mixed 型',
      { startCount: 4, centerCount: 5, endCount: 5 },
      {
        throughCount: 4,
        startStubCount: 0,
        endStubCount: 0,
        centerOnlyCount: 0,
        oneSidedCount: 1,
        oneSidedAnchor: '終端',
      },
    ],
    [
      '両側 stub 型',
      { startCount: 6, centerCount: 4, endCount: 9 },
      {
        throughCount: 4,
        startStubCount: 2,
        endStubCount: 5,
        centerOnlyCount: 0,
        oneSidedCount: 0,
      },
    ],
    [
      '中央型',
      { startCount: 2, centerCount: 4, endCount: 2 },
      {
        throughCount: 2,
        startStubCount: 0,
        endStubCount: 0,
        centerOnlyCount: 2,
        oneSidedCount: 0,
      },
    ],
    [
      '対称 stub 型',
      { startCount: 5, centerCount: 3, endCount: 5 },
      {
        throughCount: 3,
        startStubCount: 2,
        endStubCount: 2,
        centerOnlyCount: 0,
        oneSidedCount: 0,
      },
    ],
  ])('%sをADR-032のnesting分解にする', (_name, row, expected) => {
    expect(decomposeGirderMainRow(row)).toEqual(expected)
  })

  it('omits oneSidedAnchor when no one-sided group exists', () => {
    expect(
      Object.prototype.hasOwnProperty.call(
        decomposeGirderMainRow({ startCount: 6, centerCount: 4, endCount: 9 }),
        'oneSidedAnchor',
      ),
    ).toBe(false)
  })

  it('preserves each position count and never creates both one-sided anchors', () => {
    for (let startCount = 0; startCount <= 12; startCount += 1) {
      for (let centerCount = 0; centerCount <= 12; centerCount += 1) {
        for (let endCount = 0; endCount <= 12; endCount += 1) {
          const split = decomposeGirderMainRow({
            startCount,
            centerCount,
            endCount,
          })
          const oneSidedAtStart =
            split.oneSidedCount > 0 && split.oneSidedAnchor === '始端'
          const oneSidedAtEnd =
            split.oneSidedCount > 0 && split.oneSidedAnchor === '終端'

          expect(startCount).toBe(
            split.throughCount +
              split.startStubCount +
              (oneSidedAtStart ? split.oneSidedCount : 0),
          )
          expect(centerCount).toBe(
            split.throughCount +
              split.centerOnlyCount +
              (oneSidedAtStart ? split.oneSidedCount : 0) +
              (oneSidedAtEnd ? split.oneSidedCount : 0),
          )
          expect(endCount).toBe(
            split.throughCount +
              split.endStubCount +
              (oneSidedAtEnd ? split.oneSidedCount : 0),
          )
          expect(oneSidedAtStart && oneSidedAtEnd).toBe(false)
          expect(split.throughCount).toBeGreaterThanOrEqual(0)
          expect(split.startStubCount).toBeGreaterThanOrEqual(0)
          expect(split.endStubCount).toBeGreaterThanOrEqual(0)
          expect(split.centerOnlyCount).toBeGreaterThanOrEqual(0)
          expect(split.oneSidedCount).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })

  it('keeps symmetric ends free of one-sided groups', () => {
    for (let endCount = 0; endCount <= 12; endCount += 1) {
      for (let centerCount = 0; centerCount <= 12; centerCount += 1) {
        const row = { endCount, centerCount, startCount: endCount }
        const decomposed = decomposeGirderMainRow(row)

        expect(decomposed.oneSidedCount).toBe(0)
        if (endCount >= centerCount) {
          expect(decomposed.startStubCount).toBe(endCount - centerCount)
          expect(decomposed.endStubCount).toBe(endCount - centerCount)
          expect(decomposed.centerOnlyCount).toBe(0)
        } else {
          expect(decomposed.startStubCount).toBe(0)
          expect(decomposed.endStubCount).toBe(0)
          expect(decomposed.centerOnlyCount).toBe(centerCount - endCount)
        }
      }
    }
  })
})

describe('高強度せん断補強筋 (大臣認定品)', () => {
  it('はせん断補強筋にだけ許され、主筋・壁筋には型として入らない', () => {
    // 主筋・壁筋の径は表5.3.2(重ね継手)・表5.3.4(定着)を引く。その表に
    // 高強度せん断補強筋の行はないので、入れれば規準にない値を引くことになる。
    // フープ・スタラップだけが 1通則2) の断面周長で決まり径を引かない。
    expectTypeOf<HighStrengthShearBarSize>().toEqualTypeOf<'K13' | 'S13'>()
    expectTypeOf<ShearBarSize>().toEqualTypeOf<BarSize | HighStrengthShearBarSize>()
    expectTypeOf<ColumnSection['main']['size']>().toEqualTypeOf<BarSize>()
    expectTypeOf<ColumnSection['hoop']['size']>().toEqualTypeOf<ShearBarSize>()
    expectTypeOf<GirderSection['stirrup']['size']>().toEqualTypeOf<ShearBarSize>()
    expectTypeOf<WallSection['vertical']['size']>().toEqualTypeOf<BarSize>()
    expectTypeOf<WallSection['horizontal']['size']>().toEqualTypeOf<BarSize>()
  })

  it('は呼び名がそのまま呼び径である — 新しい数値を持たない', () => {
    // D13 の 13 と同じ規約だ。両原文に高強度せん断補強筋の記述は一度もなく
    // (ADR-026)、製品が持てるのは図面が書いた呼び名だけである。
    expect(SHEAR_BAR_SIZES).toEqual([
      ...BAR_SIZES,
      ...HIGH_STRENGTH_SHEAR_BAR_SIZES,
    ])
    for (const size of HIGH_STRENGTH_SHEAR_BAR_SIZES) {
      expect(size).toMatch(/^[A-Z]\d+(\.\d+)?$/)
      expect(BAR_SIZES).not.toContain(size)
    }
  })
})
