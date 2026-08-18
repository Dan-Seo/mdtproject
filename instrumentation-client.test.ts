import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const init = vi.fn()

vi.mock('posthog-js', () => ({ default: { init } }))

async function loadInstrumentation(): Promise<void> {
  vi.resetModules()
  await import('./instrumentation-client')
}

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

  // 자동수집은 $elements_chain에 부재 aria-label과 平面 SVG 좌표를 실어 보낸다.
  // 도면 데이터를 서버로 보내지 않는다는 규칙의 회귀 방지 테스트다.
  it('keeps autocapture and session recording off so drawing data never leaves the browser', async () => {
    await loadInstrumentation()

    expect(init).toHaveBeenCalledTimes(1)
    expect(init.mock.calls[0][1]).toMatchObject({
      autocapture: false,
      disable_session_recording: true,
    })
  })

  it('does not initialise when the project token is missing', async () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN

    await loadInstrumentation()

    expect(init).not.toHaveBeenCalled()
  })

  // src/domain/rebar/의 조회 실패 메시지는 도면 유래 mm 치수를 문자열 보간으로
  // 담는다(예: `clearMm must be finite: ${clearMm}`). capture_exceptions가 이걸
  // 스크러빙 없이 잡아 보내면 ADR-017을 어긴다. before_send가 그 유일한 관문이다.
  it('redacts drawing-derived digits from exception messages before they leave the browser', async () => {
    await loadInstrumentation()

    const beforeSend = init.mock.calls[0][1].before_send
    const captured = beforeSend({
      uuid: 'u1',
      event: '$exception',
      properties: {
        pane: 'quantity-body',
        $exception_list: [
          {
            type: 'Error',
            value: 'clearMm must be finite: 342.5',
            stacktrace: { frames: [{ filename: 'stirrup-layout.ts', lineno: 14 }] },
          },
        ],
      },
    })

    expect(captured.properties.$exception_list[0].value).toBe(
      'clearMm must be finite: [REDACTED]',
    )
    // type과 stacktrace(파일·행)는 도면 데이터가 아니라 진단에 필요하므로 남긴다.
    expect(captured.properties.$exception_list[0].type).toBe('Error')
    expect(captured.properties.$exception_list[0].stacktrace).toEqual({
      frames: [{ filename: 'stirrup-layout.ts', lineno: 14 }],
    })
    // pane 같은 정적 라벨은 도면 데이터가 아니므로 그대로 둔다.
    expect(captured.properties.pane).toBe('quantity-body')
  })

  it('leaves non-exception events untouched', async () => {
    await loadInstrumentation()

    const beforeSend = init.mock.calls[0][1].before_send
    const event = {
      uuid: 'u2',
      event: 'member_selected',
      properties: { source: 'viewer' },
    }

    expect(beforeSend(event)).toEqual(event)
  })

  it('passes through a null capture result', async () => {
    await loadInstrumentation()

    const beforeSend = init.mock.calls[0][1].before_send

    expect(beforeSend(null)).toBeNull()
  })
})
