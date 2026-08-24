import { describe, expect, it } from 'vitest'

import { makeSegments, recoverRows, verticalRuns } from '@/lib/import/runs'
import type { TextItem } from '@/lib/import/types'

const glyph = (
  str: string,
  x: number,
  y: number,
  rot?: number,
  h = 8,
): TextItem => ({ str, x, y, w: 5, h, ...(rot === undefined ? {} : { rot }) })

describe('makeSegments', () => {
  it('centerY는 세그먼트 자신의 글리프에서 바운딩 박스로 잰다(행 집계와 다른 높이가 섞여도 흔들리지 않는다)', () => {
    const items = [
      glyph('1', 10, 300, undefined, 8),
      glyph('2', 15, 304, undefined, 20),
    ]

    const segments = makeSegments(items)

    expect(segments).toHaveLength(1)
    // top = min(300-8, 304-20) = min(292, 284) = 284, bottom = max(300, 304) = 304
    // centerY = (284+304)/2 = 294
    expect(segments[0].centerY).toBe(294)
  })

  it('좁힌 gapRatio에서는 4pt 고정 하한이 좁힘을 잠식하지 않는다', () => {
    // h=6, gapRatio=0.5 → min(h)*gapRatio=3 (<4). 이전 구현은 하한 4가 이겨
    // threshold=4가 되고, 아래 간격 3.5는 4를 못 넘어 한 세그먼트로 붙는다.
    // 하한도 gapRatio에 맞춰 줄면 threshold≈0.909가 되어 3.5>0.909로 갈린다.
    const items = [
      glyph('A', 0, 0, undefined, 6),
      glyph('B', 8.5, 0, undefined, 6), // gap = 8.5-(0+5) = 3.5
    ]

    const segments = makeSegments(items, 0.5)

    expect(segments).toHaveLength(2)
  })

  it('문턱은 어떤 글자 높이에서도 min(h)*gapRatio 다 — 절대 하한이 정의를 덮지 않는다', () => {
    // 하한 `4*(gapRatio/DEFAULT)` 는 `min(h) < 4/2.2 = 1.8182pt` 일 때만 이긴다
    // (gapRatio 가 양변에서 약분된다 — 배수와 무관한 조건이다). 픽스처 5부의
    // 글자 높이는 4.26~14.16pt 라 모든 호출부에서 죽은 가지였다. 하한이 아직
    // 이기는 유일한 구간(h < 1.8182)에서 문턱의 정의가 무엇인지 못박는다:
    // 「글자 높이의 배수」이지 「그것과 고정 pt 중 큰 쪽」이 아니다.
    const items = [
      glyph('A', 0, 0, undefined, 1.5),
      glyph('B', 8.5, 0, undefined, 1.5), // gap = 8.5-(0+5) = 3.5
    ]

    // min(h)*2.2 = 3.3 < 3.5 → 갈라야 한다. 하한 4가 살아 있으면 붙는다.
    expect(makeSegments(items)).toHaveLength(2)
  })

  it('큰 그룹에서도 spread 없이 x·endX를 구해 RangeError 없이 동작한다', () => {
    // makeSegments의 x·endX가 Math.min(...group.map(...))이던 시절엔 그룹
    // 크기가 스택 한도를 넘으면 RangeError로 죽었다(centerY와 같은 계열의 버그,
    // #32 이월 지적 (b)). 15만 개를 한 그룹(서로 붙은 글자)으로 만들어 재현한다.
    const count = 150000
    const items: TextItem[] = Array.from({ length: count }, (_, index) =>
      glyph(String(index % 10), index * 5, 0),
    )

    let segments: ReturnType<typeof makeSegments> = []
    expect(() => {
      segments = makeSegments(items)
    }).not.toThrow()

    expect(segments).toHaveLength(1)
    expect(segments[0].x).toBe(0)
    expect(segments[0].endX).toBe((count - 1) * 5 + 5)
  })
})

describe('recoverRows', () => {
  it('가로로 인접한 글자를 한 세그먼트로 되돌린다', () => {
    const items = [
      glyph('6', 100, 50),
      glyph(',', 105, 50),
      glyph('0', 110, 50),
      glyph('0', 115, 50),
      glyph('0', 120, 50),
    ]

    const rows = recoverRows(items)

    expect(rows).toHaveLength(1)
    expect(rows[0].segments.map((segment) => segment.text)).toEqual(['6,000'])
  })
})

describe('verticalRuns', () => {
  it('rot=-90 의 글자를 아래에서 위로 읽어 되돌린다', () => {
    // 도면의 세로 치수는 아래에서 위로 읽는다 — `verticalRuns`가 y 내림차순으로
    // 읽으므로, 첫 글자 '1'이 가장 아래(y가 가장 큼)에 있어야 '16,500'이 된다.
    // 글자 간격 8 ≤ w(5) × PROXIMITY_MULTIPLIER(2) 라 한 런으로 묶인다.
    const items = [
      glyph('1', 40, 120, -90),
      glyph('6', 40, 112, -90),
      glyph(',', 40, 104, -90),
      glyph('5', 40, 96, -90),
      glyph('0', 40, 88, -90),
      glyph('0', 40, 80, -90),
    ]

    const runs = verticalRuns(items)

    expect(runs.map((run) => run.text)).toEqual(['16,500'])
  })

  it('gapRatio를 생략하면 기본 배수(2)로 붙인다 — 섹션리스트 파서의 동작이 바뀌지 않는다', () => {
    // 간격 10 ＝ 정확히 2w. 기본 배수의 문턱이 딱 2w라 `<=`로 붙는다.
    // 이 테스트는 새 매개변수가 **기본 경로를 건드리지 않는다**는 것만 고정한다.
    const items = [
      glyph('1', 40, 200, -90),
      glyph('5', 40, 195, -90),
      glyph('0', 40, 190, -90),
      glyph('5', 40, 180, -90),
      glyph('0', 40, 175, -90),
    ]

    expect(verticalRuns(items).map((run) => run.text)).toEqual(['15050'])
  })

  it('gapRatio를 좁히면 토큰 사이(2w)는 가르고 토큰 내부(1w)는 붙인 채로 둔다', () => {
    // 실측(kani-p38·ojkk-p2·ojkk-p3 회전 문자열 307쌍)에서 토큰 **내부** 간격은
    // 예외 없이 정확히 1w이고, 토큰 **사이**의 최솟값은 정확히 2w다. 쓸 수 있는
    // 창은 (1w, 2w) 열린 구간이고, 1.5w는 그 한가운데다 — 양쪽에서 0.5w씩 떨어진다.
    const items = [
      glyph('1', 40, 200, -90),
      glyph('5', 40, 195, -90),
      glyph('0', 40, 190, -90),
      glyph('5', 40, 180, -90),
      glyph('0', 40, 175, -90),
    ]

    expect(verticalRuns(items, 1.5).map((run) => run.text)).toEqual(['150', '50'])
  })

  it('y는 원점들의 단순 중점이 아니라 바운딩 박스의 세로 중심이다', () => {
    // rot=-90에서 y는 진행 방향(-y) 기준 뒤쪽 끝(원점)이고, 앞쪽 끝은 자신의
    // w(진행량)만큼 더 나간 y-w다(textitems.ts: directionY=-1이므로 다음 글자의
    // y는 이 글자의 y-w). 원점만 평균 내면(구 구현) 마지막 글자 폭의 절반만큼
    // 중심이 뒤(y가 큰 쪽)로 치우친다.
    // 원점: 120,112,104,96,88,80(각 w=5) → 구 구현 y=(80+120)/2=100.
    // 참 바운딩 박스: [80-5, 120]=[75,120] → y=(75+120)/2=97.5.
    const items = [
      glyph('1', 40, 120, -90),
      glyph('0', 40, 112, -90),
      glyph(',', 40, 104, -90),
      glyph('5', 40, 96, -90),
      glyph('0', 40, 88, -90),
      glyph('0', 40, 80, -90),
    ]

    const runs = verticalRuns(items)

    expect(runs).toHaveLength(1)
    expect(runs[0].y).toBe(97.5)
  })
})
