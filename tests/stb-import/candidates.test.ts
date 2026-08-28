import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { toSkeletonCandidate } from '@/lib/import/stb/candidates'
import type { StbDocument, StbSkeletonCandidate } from '@/lib/import/stb/types'

const documentDirectory = resolve(
  process.cwd(),
  'tests/fixtures/stb-import/document',
)
const expectedDirectory = resolve(
  process.cwd(),
  'tests/fixtures/stb-import/expected',
)

const fixtureFiles = [
  'mini.json',
  'dotnet-sample1.json',
  'diffchecker-filea.json',
  'hoaryfox-sample.json',
  'diffchecker-mini210.json',
] as const

function withoutPrivateKeys<T>(value: T): T {
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([key]) => !key.startsWith('_'),
    ),
  ) as T
}

function readJson<T>(directory: string, file: string): T {
  return JSON.parse(
    readFileSync(resolve(directory, file), 'utf8'),
  ) as T
}

describe('ST-Bridge skeleton candidates against committed IR', () => {
  for (const file of fixtureFiles) {
    it(`${file} matches its independently derived candidate fixture`, () => {
      const document = withoutPrivateKeys(readJson<StbDocument>(documentDirectory, file))
      const expected = withoutPrivateKeys(
        readJson<StbSkeletonCandidate>(expectedDirectory, file),
      )

      expect(toSkeletonCandidate(document)).toEqual(expected)
    })
  }

  it('keeps absolute regression values independent from the expected fixtures', () => {
    const hoaryfox = toSkeletonCandidate(
      withoutPrivateKeys(
        readJson<StbDocument>(documentDirectory, 'hoaryfox-sample.json'),
      ),
    )
    expect(hoaryfox.grids[0]?.spansMm).toEqual([
      3600,
      3600,
      3600,
      3600,
      3600,
      3600,
    ])

    const filea = toSkeletonCandidate(
      withoutPrivateKeys(
        readJson<StbDocument>(documentDirectory, 'diffchecker-filea.json'),
      ),
    )
    expect(filea.stories.map((story) => story.heightMm)).toEqual([
      4500,
      4000,
      4000,
      3800,
    ])

    const mini210 = toSkeletonCandidate(
      withoutPrivateKeys(
        readJson<StbDocument>(documentDirectory, 'diffchecker-mini210.json'),
      ),
    )
    expect(mini210.grids).toEqual([])
  })
})
