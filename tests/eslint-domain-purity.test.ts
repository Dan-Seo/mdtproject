import { createRequire } from 'node:module'

import { beforeAll, describe, expect, it } from 'vitest'

/**
 * `src/domain/` 은 순수 TypeScript 라는 규칙(CLAUDE.md CRITICAL)을 강제하는 장치는
 * eslint.config.mjs 의 `no-restricted-imports` 하나뿐이다. 그 가드가 별칭(`@/lib/*`)만
 * 막고 상대경로(`../../lib/telemetry`)를 통과시키던 구멍을 회귀로 고정한다 (#53).
 *
 * ESLint 8 의 flat config 는 Node API 로는 아직 `FlatESLint` 로만 열린다 — `eslint .`
 * (npm run lint)가 쓰는 것과 같은 설정 파일을 그대로 읽어 실제 판정을 확인한다.
 */
const require = createRequire(import.meta.url)

interface LintResult {
  messages: Array<{ ruleId: string | null; message: string }>
}
interface FlatESLintInstance {
  lintText(code: string, options: { filePath: string }): Promise<LintResult[]>
}
const { FlatESLint } = require('eslint/use-at-your-own-risk') as {
  FlatESLint: new (options: { overrideConfigFile: string }) => FlatESLintInstance
}

let eslint: FlatESLintInstance

async function ruleIdsFor(filePath: string, source: string): Promise<string[]> {
  const [result] = await eslint.lintText(`${source}\n`, { filePath })
  return result.messages.map(({ ruleId }) => ruleId ?? '(파서 오류)')
}

describe('src/domain 순수성 가드', () => {
  // 첫 lintText 가 eslint 본체와 flat config 의 플러그인 트리를 통째로 읽어들인다 —
  // 콜드 캐시에서 6 초가 넘어 기본 타임아웃(5 초)에 걸린다. 그 비용이 첫 케이스의
  // 예산에 청구되면 부하가 걸린 머신에서 그 케이스만 죽는다(로컬 4 회 중 3 회).
  // 워밍업을 여기서 한 번 치러, 각 테스트는 실제 판정 시간만 재게 한다.
  beforeAll(async () => {
    eslint = new FlatESLint({ overrideConfigFile: 'eslint.config.mjs' })
    await eslint.lintText('export {}\n', { filePath: 'src/domain/probe.ts' })
  }, 60_000)

  it('별칭으로 들어오는 @/lib 를 막는다', async () => {
    const ruleIds = await ruleIdsFor(
      'src/domain/rebar/probe.ts',
      "import { capture } from '@/lib/telemetry'\nexport const x = () => capture",
    )

    expect(ruleIds).toContain('no-restricted-imports')
  })

  // 별칭만 막던 시절의 실제 우회 경로다 — 이 세 모양이 통과하면 가드는 사실상 없다
  it.each([
    ['src/domain/probe.ts', '../lib/telemetry'],
    ['src/domain/rebar/probe.ts', '../../lib/telemetry'],
    ['src/domain/model/nested/probe.ts', '../../../lib/telemetry'],
  ])('상대경로로 들어오는 lib 도 막는다 (%s ← %s)', async (filePath, specifier) => {
    const ruleIds = await ruleIdsFor(
      filePath,
      `import { capture } from '${specifier}'\nexport const x = () => capture`,
    )

    expect(ruleIds).toContain('no-restricted-imports')
  })

  it('도메인 안끼리의 상대 import 는 막지 않는다', async () => {
    const ruleIds = await ruleIdsFor(
      'src/domain/rebar/probe.ts',
      "import { lookupRule } from '../rules/lookup'\nexport const x = () => lookupRule",
    )

    expect(ruleIds).not.toContain('no-restricted-imports')
  })

  it('도메인 밖에서는 lib 상대 import 를 막지 않는다', async () => {
    const ruleIds = await ruleIdsFor(
      'src/components/probe.ts',
      "import { capture } from '../lib/telemetry'\nexport const x = () => capture",
    )

    expect(ruleIds).not.toContain('no-restricted-imports')
  })
})
