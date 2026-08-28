import { describe, expect, it } from 'vitest'

import type { StbDocument } from './types'
import { toSkeletonCandidate } from './candidates'

function axis(
  name: string | undefined,
  distance: string | undefined,
  nodeIds: string[] = [],
) {
  return { name, distance, nodeIds }
}

function document(
  overrides: Partial<StbDocument> = {},
): StbDocument {
  return {
    version: '2.0.2',
    encoding: 'utf-8',
    axisGroups: [
      {
        groupName: 'X',
        angle: '270.0',
        axes: [axis('X1', '0'), axis('X2', '6000')],
      },
      {
        groupName: 'Y',
        angle: '0.0',
        axes: [axis('Y1', '0'), axis('Y2', '5000')],
      },
    ],
    stories: [
      { name: '1FL', height: '0', kind: 'GENERAL' },
      { name: 'RFL', height: '4000', kind: 'ROOF' },
    ],
    nodes: [],
    unsupportedAxisKinds: [],
    unreadElements: [],
    issues: [],
    ...overrides,
  }
}

describe('toSkeletonCandidate', () => {
  it('maps directions from angles, never from group names', () => {
    const candidate = toSkeletonCandidate(
      document({
        axisGroups: [
          {
            groupName: 'X',
            angle: '0.0',
            axes: [axis('Y1', '0'), axis('Y2', '5000')],
          },
          {
            groupName: 'Y',
            angle: '270.0',
            axes: [axis('X1', '0'), axis('X2', '6000')],
          },
        ],
      }),
    )

    expect(candidate.grids).toEqual([
      { direction: 'X', groupName: 'Y', axes: [{ label: 'X1' }, { label: 'X2' }], spansMm: [6000] },
      { direction: 'Y', groupName: 'X', axes: [{ label: 'Y1' }, { label: 'Y2' }], spansMm: [5000] },
    ])

    const unnamed = toSkeletonCandidate(
      document({
        axisGroups: [
          {
            groupName: '通り',
            angle: '90.0',
            axes: [axis('X1', '0'), axis('X2', '6000')],
          },
          {
            groupName: 'other',
            angle: '180.0',
            axes: [axis('Y1', '0'), axis('Y2', '5000')],
          },
        ],
      }),
    )
    expect(unnamed.grids.map((grid) => grid.direction)).toEqual(['X', 'Y'])
  })

  it('rejects the whole grid when either group is non-orthogonal and recovers when fixed', () => {
    const nonOrthogonal = document({
      axisGroups: [
        {
          groupName: 'X',
          angle: '45.0',
          axes: [axis('X1', '0'), axis('X2', '6000')],
        },
        {
          groupName: 'Y',
          angle: '0.0',
          axes: [axis('Y1', '0'), axis('Y2', '5000')],
        },
      ],
    })

    expect(toSkeletonCandidate(nonOrthogonal).grids).toEqual([])
    expect(toSkeletonCandidate(nonOrthogonal).issues).toEqual(['非直交通り芯'])

    nonOrthogonal.axisGroups[0]!.angle = '270.0'
    expect(toSkeletonCandidate(nonOrthogonal).grids).toHaveLength(2)
  })

  it('deduplicates issue codes when both axis groups fail the same rule', () => {
    const bothNonOrthogonal = document({
      axisGroups: [
        { groupName: 'X', angle: '45.0', axes: [axis('X1', '0'), axis('X2', '6000')] },
        { groupName: 'Y', angle: '135.0', axes: [axis('Y1', '0'), axis('Y2', '5000')] },
      ],
    })
    expect(toSkeletonCandidate(bothNonOrthogonal).issues).toEqual(['非直交通り芯'])

    const bothInvalidDistance = document({
      axisGroups: [
        { groupName: 'X', angle: '270.0', axes: [axis('X1', undefined), axis('X2', '6000')] },
        { groupName: 'Y', angle: '0.0', axes: [axis('Y1', 'abc'), axis('Y2', '5000')] },
      ],
    })
    expect(toSkeletonCandidate(bothInvalidDistance).issues).toEqual(['通り芯距離解釈不能'])
  })

  it('rejects missing or non-pair axis groups without inventing a grid', () => {
    const empty = toSkeletonCandidate(document({ axisGroups: [] }))
    expect(empty.grids).toEqual([])
    expect(empty.issues).toEqual(['通り芯未検出'])

    const one = toSkeletonCandidate(
      document({ axisGroups: [document().axisGroups[0]!] }),
    )
    expect(one.grids).toEqual([])
    expect(one.issues).toEqual(['通り芯グループ数不一致'])

    const three = toSkeletonCandidate(
      document({ axisGroups: [...document().axisGroups, document().axisGroups[0]!] }),
    )
    expect(three.grids).toEqual([])
    expect(three.issues).toEqual(['通り芯グループ数不一致'])
  })

  it('accepts right angles within the documented tolerance', () => {
    const candidate = toSkeletonCandidate(
      document({
        axisGroups: [
          { groupName: 'X', angle: '0.0', axes: [axis('Y1', '0'), axis('Y2', '5000')] },
          { groupName: 'Y', angle: '89.9995', axes: [axis('X1', '0'), axis('X2', '6000')] },
        ],
      }),
    )
    expect(candidate.issues).toEqual([])
    expect(candidate.grids.map((grid) => grid.direction)).toEqual(['X', 'Y'])
  })

  it('rejects parallel axes and arc/radial axes, but ignores drawing axes while continuing', () => {
    const parallel = toSkeletonCandidate(
      document({
        axisGroups: [
          { groupName: 'one', angle: '0', axes: [axis('A1', '0'), axis('A2', '100')] },
          { groupName: 'two', angle: '0', axes: [axis('B1', '0'), axis('B2', '200')] },
        ],
      }),
    )
    expect(parallel.grids).toEqual([])
    expect(parallel.issues).toEqual(['通り芯方向不明'])

    const arc = toSkeletonCandidate(
      document({
        unsupportedAxisKinds: [{ name: 'StbArcAxes', count: 1 }],
      }),
    )
    expect(arc.grids).toEqual([])
    expect(arc.issues).toEqual(['非直交通り芯'])

    const drawing = toSkeletonCandidate(
      document({
        unsupportedAxisKinds: [{ name: 'StbDrawingAxes', count: 1 }],
      }),
    )
    expect(drawing.grids).toHaveLength(2)
    expect(drawing.issues).toEqual(['未対応通り芯種別'])
  })

  it('rejects invalid, missing, duplicate, and insufficient axis positions without inventing labels', () => {
    const invalidDistance = toSkeletonCandidate(
      document({
        axisGroups: [
          { groupName: 'X', angle: '270', axes: [axis('X1', undefined), axis('X2', '6000')] },
          { groupName: 'Y', angle: '0', axes: [axis('Y1', '0'), axis('Y2', '5000')] },
        ],
      }),
    )
    expect(invalidDistance.grids).toEqual([
      { direction: 'Y', groupName: 'Y', axes: [{ label: 'Y1' }, { label: 'Y2' }], spansMm: [5000] },
    ])
    expect(invalidDistance.issues).toEqual(['通り芯距離解釈不能'])

    const missingLabel = toSkeletonCandidate(
      document({
        axisGroups: [
          { groupName: 'X', angle: '270', axes: [axis(undefined, '0'), axis('X2', '6000')] },
          { groupName: 'Y', angle: '0', axes: [axis('Y1', '0'), axis('Y2', '5000')] },
        ],
      }),
    )
    expect(missingLabel.grids).toEqual([
      { direction: 'Y', groupName: 'Y', axes: [{ label: 'Y1' }, { label: 'Y2' }], spansMm: [5000] },
    ])
    expect(missingLabel.issues).toEqual(['通り芯ラベル欠落'])

    const duplicate = toSkeletonCandidate(
      document({
        axisGroups: [
          { groupName: 'X', angle: '270', axes: [axis('X1', '0'), axis('X2', '0')] },
          { groupName: 'Y', angle: '0', axes: [axis('Y1', '0'), axis('Y2', '5000')] },
        ],
      }),
    )
    expect(duplicate.grids).toEqual([
      { direction: 'Y', groupName: 'Y', axes: [{ label: 'Y1' }, { label: 'Y2' }], spansMm: [5000] },
    ])
    expect(duplicate.issues).toEqual(['通り芯位置重複'])

    const insufficient = toSkeletonCandidate(
      document({
        axisGroups: [
          { groupName: 'X', angle: '270', axes: [axis('X1', '0')] },
          { groupName: 'Y', angle: '0', axes: [axis('Y1', '0'), axis('Y2', '5000')] },
        ],
      }),
    )
    expect(insufficient.grids).toEqual([
      { direction: 'Y', groupName: 'Y', axes: [{ label: 'Y1' }, { label: 'Y2' }], spansMm: [5000] },
    ])
    expect(insufficient.issues).toEqual(['通り芯未検出'])
  })

  it('reports node mismatches without discarding the grid and includes the group origin', () => {
    const mismatch = toSkeletonCandidate(
      document({
        axisGroups: [
          {
            groupName: 'X',
            angle: '270',
            originX: '100',
            axes: [axis('X1', '0', ['x1']), axis('X2', '6000', ['x2'])],
          },
          {
            groupName: 'Y',
            angle: '0',
            originY: '200',
            axes: [axis('Y1', '0', ['y1']), axis('Y2', '5000', ['y2'])],
          },
        ],
        nodes: [
          { id: 'x1', x: '100', y: '0' },
          { id: 'x2', x: '6500', y: '0' },
          { id: 'y1', x: '0', y: '200' },
          { id: 'y2', x: '0', y: '5000' },
        ],
      }),
    )
    expect(mismatch.grids).toHaveLength(2)
    expect(mismatch.issues).toEqual(['通り芯位置と節点の不一致'])

    const match = toSkeletonCandidate(
      document({
        axisGroups: [
          {
            groupName: 'X',
            angle: '270',
            originX: '100',
            axes: [axis('X1', '0', ['x1']), axis('X2', '6000', ['x2'])],
          },
          {
            groupName: 'Y',
            angle: '0',
            originY: '200',
            axes: [axis('Y1', '0', ['y1']), axis('Y2', '5000', ['y2'])],
          },
        ],
        nodes: [
          { id: 'x1', x: '100', y: '0' },
          { id: 'x2', x: '6100', y: '0' },
          { id: 'y1', x: '0', y: '200' },
          { id: 'y2', x: '0', y: '5200' },
        ],
      }),
    )
    expect(match.issues).not.toContain('通り芯位置と節点の不一致')
  })

  it('rejects an incomplete story stack as a whole and derives adjacent heights', () => {
    const candidate = toSkeletonCandidate(
      document({
        stories: [
          { name: '1FL', height: '200', kind: 'GENERAL' },
          { name: '2FL', height: '4700', kind: 'GENERAL' },
          { name: 'RFL', height: '8700', kind: 'ROOF' },
        ],
      }),
    )
    expect(candidate.stories).toEqual([
      { name: '1FL', heightMm: 4500 },
      { name: '2FL', heightMm: 4000 },
    ])

    const basement = toSkeletonCandidate(
      document({
        stories: [
          { name: 'B1F', height: '-3000', kind: 'BASEMENT' },
          { name: '1FL', height: '0', kind: 'GENERAL' },
          { name: 'RFL', height: '4000', kind: 'ROOF' },
        ],
      }),
    )
    expect(basement.stories).toEqual([])
    expect(basement.issues).toEqual(['地下レベル未対応'])

    const unsupportedKind = toSkeletonCandidate(
      document({
        stories: [
          { name: '1FL', height: '0', kind: 'GENERAL' },
          { name: 'ISO', height: '4000', kind: 'ISOLATION' },
          { name: 'RFL', height: '8000', kind: 'ROOF' },
        ],
      }),
    )
    expect(unsupportedKind.stories).toEqual([])
    expect(unsupportedKind.issues).toEqual(['対応外の階種別'])

    const twoUnsupportedKinds = toSkeletonCandidate(
      document({
        stories: [
          { name: 'B1F', height: '-3000', kind: 'BASEMENT' },
          { name: 'ISO', height: '0', kind: 'ISOLATION' },
          { name: 'RFL', height: '4000', kind: 'ROOF' },
        ],
      }),
    )
    expect(twoUnsupportedKinds.stories).toEqual([])
    expect(twoUnsupportedKinds.issues).toEqual([
      '地下レベル未対応',
      '対応外の階種別',
    ])
  })

  it('accepts ROOF and PENTHOUSE, rejects invalid heights/names/duplicates/short stacks', () => {
    expect(
      toSkeletonCandidate(
        document({
          stories: [
            { name: '1FL', height: '0', kind: 'GENERAL' },
            { name: 'PH', height: '4000', kind: 'PENTHOUSE' },
            { name: 'RFL', height: '8000', kind: 'ROOF' },
          ],
        }),
      ).issues,
    ).toEqual([])

    const invalidHeight = toSkeletonCandidate(
      document({
        stories: [
          { name: '1FL', height: undefined, kind: 'GENERAL' },
          { name: 'RFL', height: '4000', kind: 'ROOF' },
        ],
      }),
    )
    expect(invalidHeight.stories).toEqual([])
    expect(invalidHeight.issues).toEqual(['階レベル解釈不能'])
    expect(JSON.stringify(invalidHeight)).not.toContain('heightMm":0')

    const duplicate = toSkeletonCandidate(
      document({
        stories: [
          { name: '1FL', height: '0', kind: 'GENERAL' },
          { name: '2FL', height: '4000', kind: 'GENERAL' },
          { name: 'RFL', height: '4000', kind: 'ROOF' },
        ],
      }),
    )
    expect(duplicate.stories).toEqual([])
    expect(duplicate.issues).toEqual(['階レベル重複'])

    const insufficient = toSkeletonCandidate(
      document({ stories: [{ name: '1FL', height: '0', kind: 'GENERAL' }] }),
    )
    expect(insufficient.stories).toEqual([])
    expect(insufficient.issues).toEqual(['階不足'])

    const empty = toSkeletonCandidate(document({ stories: [] }))
    expect(empty.stories).toEqual([])
    expect(empty.issues).toEqual(['階不足'])

    const negative = toSkeletonCandidate(
      document({
        stories: [
          { name: 'B1F', height: '-3000', kind: 'GENERAL' },
          { name: '1FL', height: '0', kind: 'GENERAL' },
        ],
      }),
    )
    expect(negative.stories).toEqual([])
    expect(negative.issues).toEqual(['地下レベル未対応'])

    const missingName = toSkeletonCandidate(
      document({
        stories: [
          { name: undefined, height: '0', kind: 'GENERAL' },
          { name: 'RFL', height: '4000', kind: 'ROOF' },
        ],
      }),
    )
    expect(missingName.stories).toEqual([])
    expect(missingName.issues).toEqual(['階レベル解釈不能'])
  })

  it('copies document failures and unsupported elements without producing candidates', () => {
    const failed = toSkeletonCandidate(
      document({
        issues: ['対応外バージョン'],
        unsupportedAxisKinds: [{ name: 'StbArcAxes', count: 2 }],
        unreadElements: [{ name: 'StbColumn', count: 3 }],
      }),
    )
    expect(failed.grids).toEqual([])
    expect(failed.stories).toEqual([])
    expect(failed.issues).toEqual(['対応外バージョン'])
    expect(failed.unsupported).toEqual([
      { name: 'StbArcAxes', count: 2 },
      { name: 'StbColumn', count: 3 },
    ])
  })

  it('returns a JSON-only candidate', () => {
    const candidate = toSkeletonCandidate(document({ projectName: 'demo' }))
    expect(JSON.parse(JSON.stringify(candidate))).toEqual(candidate)
  })
})
