import { existsSync } from 'node:fs'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const init = vi.fn()

vi.mock('posthog-js', () => ({ default: { init } }))

describe('instrumentation-client', () => {
  beforeEach(() => {
    init.mockClear()
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = 'phc_test'
    process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://us.i.posthog.com'
    // 동의 게이트 자체의 회귀 방지는 telemetry.test.ts가 맡는다 — 여기서는
    // 재노출이 초기화까지 이어지는지만 본다.
    window.localStorage.setItem('kijun:telemetry-opt-in', 'yes')
  })

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
    delete process.env.NEXT_PUBLIC_POSTHOG_HOST
    window.localStorage.clear()
  })

  // Next.js가 이 파일을 부수 효과만을 위해 import한다 — 실제 초기화 로직은
  // src/lib/telemetry.ts에 있고(회귀 방지 테스트는 telemetry.test.ts), 이
  // 파일은 그걸 그대로 트리거·재노출하는 얇은 진입점이라는 것만 확인한다.
  it('triggers telemetry initialisation as a side effect of import', async () => {
    vi.resetModules()
    const mod = await import('./instrumentation-client')
    await mod.posthogInit

    expect(init).toHaveBeenCalledTimes(1)
  })

  // 이 프로젝트는 src/app을 쓰므로 관례 파일의 자리는 src/다. 리포 루트에도
  // 같은 파일이 남아 있으면 Next.js가 어느 쪽을 진입점으로 잡는지 배치만
  // 보고는 알 수 없고, 옮긴 쪽만 고치는 사고가 난다 (#54).
  it('keeps the convention file only under src/', () => {
    expect(existsSync(new URL('../instrumentation-client.ts', import.meta.url))).toBe(
      false,
    )
  })
})
