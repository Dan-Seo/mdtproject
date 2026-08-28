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
      for (const term of forbidden) {
        expect(source, `${file} contains forbidden term ${term}`).not.toContain(
          term,
        )
      }
    }
  })
})
