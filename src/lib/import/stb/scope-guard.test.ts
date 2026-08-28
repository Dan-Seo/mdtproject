import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const stbDirectory = resolve(process.cwd(), 'src/lib/import/stb')

function nonTestTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return nonTestTypeScriptFiles(path)
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) {
      return []
    }
    return [path]
  })
}

function decodeUnicodeEscapes(source: string): string {
  return source.replace(
    /\\u\{([0-9a-fA-F]+)\}|\\u([0-9a-fA-F]{4})/g,
    (_match, codePoint: string | undefined, codeUnit: string | undefined) =>
      String.fromCodePoint(parseInt(codePoint ?? codeUnit!, 16)),
  )
}

describe('ST-Bridge document import scope', () => {
  it('keeps the IR parser free of rule, section, network, and store concerns', () => {
    const actualFiles = nonTestTypeScriptFiles(stbDirectory).sort()
    const scannedFiles = actualFiles.map((file) => ({
      file,
      source: readFileSync(file, 'utf8'),
    }))

    expect(scannedFiles.length).toBeGreaterThanOrEqual(3)
    expect(scannedFiles.map(({ file }) => file).sort()).toEqual(actualFiles)

    const forbidden = [
      '定着',
      '重ね継手',
      '折曲',
      'かぶり',
      'depth_cover',
      'anchorage',
      'cut_off',
      'center_',
      'StbSec',
      'StbApply',
      'StbColumn',
      'StbGirder',
      'StbBeam',
      'StbWall',
      'StbSlab',
      'StbBrace',
      'StbPile',
      'StbFooting',
      'fetch',
      'XMLHttpRequest',
      'WebSocket',
      'sendBeacon',
      'applyFramingPlan',
      'applyElevation',
      'updateProject',
      'loadProject',
      'useAppStore',
      'zustand',
      'createSampleProject',
    ]

    for (const { file, source } of scannedFiles) {
      const sourceVariants = [
        { label: 'original source', source },
        {
          label: 'unicode-decoded source',
          source: decodeUnicodeEscapes(source),
        },
      ]

      for (const { label, source: variant } of sourceVariants) {
        for (const term of forbidden) {
          expect(
            variant,
            `${file} (${label}) contains forbidden term ${term}; unicode escapes in identifiers can bypass this check, so the same check also runs on a decoded copy`,
          ).not.toContain(term)
        }
      }
    }
  })
})
