import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8'))

describe('project scaffold', () => {
  it('defines every required npm script', () => {
    const packageJson = readJson('package.json') as {
      scripts?: Record<string, string>
    }

    expect(packageJson.scripts).toMatchObject({
      dev: 'next dev',
      build: 'next build',
      lint: 'eslint .',
      test: 'vitest run',
      'test:golden': 'vitest run tests/golden',
    })
  })

  it('enables TypeScript strict mode', () => {
    const tsconfig = readJson('tsconfig.json') as {
      compilerOptions?: { strict?: boolean }
    }

    expect(tsconfig.compilerOptions?.strict).toBe(true)
  })
})
