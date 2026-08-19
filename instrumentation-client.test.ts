import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const init = vi.fn()

vi.mock('posthog-js', () => ({ default: { init } }))

describe('instrumentation-client', () => {
  beforeEach(() => {
    init.mockClear()
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = 'phc_test'
    process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://us.i.posthog.com'
  })

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
    delete process.env.NEXT_PUBLIC_POSTHOG_HOST
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
})
