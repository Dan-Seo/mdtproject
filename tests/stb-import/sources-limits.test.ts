import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(process.cwd(), 'tests/fixtures/stb-import/SOURCES.md'),
  'utf8',
)

function limitsSection(): string {
  const heading = '## 이 코퍼스가 대표하지 못하는 것'
  const headingStart = source.indexOf(heading)
  expect(headingStart, 'ST-Bridge 코퍼스 한계 절이 없다').toBeGreaterThanOrEqual(
    0,
  )

  const bodyStart = headingStart + heading.length
  const nextHeading = source.indexOf('\n## ', bodyStart)
  return source.slice(bodyStart, nextHeading < 0 ? undefined : nextHeading)
}

describe('ST-Bridge corpus source limits', () => {
  it('keeps the measured limits section filled and tied to all real files', () => {
    const section = limitsSection()

    expect(section, 'step 5 자리표시가 남아 있다').not.toContain(
      'step 5에서 실측으로 채운다',
    )

    for (const file of [
      'dotnet-sample1.stb',
      'diffchecker-filea.stb',
      'hoaryfox-sample.stb',
      'diffchecker-mini210.stb',
    ]) {
      expect(section, `코퍼스 한계 절에 ${file}이 없다`).toContain(file)
    }

    for (const term of [
      'kind_structure',
      'StbSecColumn_RC',
      'StbWall',
      'StbNodeIdList',
    ]) {
      expect(section, `코퍼스 한계 절에 ${term} 실측이 없다`).toContain(term)
    }
  })

  it('keeps hashes for the four real files and every registered XSD', () => {
    const hashes = [...source.matchAll(/`([a-f\d]{64})`/gu)]

    expect(hashes.length, '실물 4건과 XSD/zip 해시가 빠졌다').toBeGreaterThanOrEqual(
      12,
    )
  })
})
