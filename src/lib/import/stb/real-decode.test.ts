import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { decodeStbBytes } from './decode'

const cacheDirectory = resolve(process.cwd(), '.cache/stb')
const sourcesPath = resolve(process.cwd(), 'tests/fixtures/stb-import/SOURCES.md')
const files = [
  'dotnet-sample1.stb',
  'diffchecker-filea.stb',
  'hoaryfox-sample.stb',
  'diffchecker-mini210.stb',
] as const

const available = files.filter((file) =>
  existsSync(resolve(cacheDirectory, file)),
)

function expectedSha256(file: string): string {
  const sources = readFileSync(sourcesPath, 'utf8')
  const row = sources
    .split(/\r?\n/u)
    .find((line) => line.includes(`\`${file}\``))
  const sha256 = row?.match(/`([a-f\d]{64})`/u)?.[1]

  if (!sha256) throw new Error(`SHA-256 not found in SOURCES.md: ${file}`)
  return sha256
}

function realDecode(file: string) {
  const data = readFileSync(resolve(cacheDirectory, file))
  expect(createHash('sha256').update(data).digest('hex')).toBe(
    expectedSha256(file),
  )

  const bytes = new Uint8Array(data.byteLength)
  bytes.set(data)
  const result = decodeStbBytes(bytes.buffer)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(`could not decode ${file}`)
  return result
}

function replacementCount(text: string): number {
  return [...text].filter((character) => character === '\uFFFD').length
}

describe.skipIf(available.length === 0)(
  'real-decode: .cache/stb の実物 .stb（ローカル限定）',
  () => {
    it.skipIf(!available.includes('diffchecker-filea.stb'))(
      'diffchecker-filea.stb uses declared Shift_JIS without replacement characters',
      () => {
        const result = realDecode('diffchecker-filea.stb')

        expect(result.encoding).toBe('shift_jis')
        expect(replacementCount(result.text)).toBe(0)
      },
    )

    it.skipIf(!available.includes('dotnet-sample1.stb'))(
      'dotnet-sample1.stb decodes with the declared UTF-8 encoding',
      () => {
        expect(realDecode('dotnet-sample1.stb').encoding).toBe('utf-8')
      },
    )

    it.skipIf(!available.includes('hoaryfox-sample.stb'))(
      'hoaryfox-sample.stb decodes with the declared UTF-8 encoding',
      () => {
        expect(realDecode('hoaryfox-sample.stb').encoding).toBe('utf-8')
      },
    )

    it.skipIf(!available.includes('diffchecker-mini210.stb'))(
      'diffchecker-mini210.stb decodes with the declared UTF-8 encoding',
      () => {
        expect(realDecode('diffchecker-mini210.stb').encoding).toBe('utf-8')
      },
    )
  },
)
