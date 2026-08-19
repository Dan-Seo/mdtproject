import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const init = vi.fn()
const capturePosthog = vi.fn()
const captureExceptionPosthog = vi.fn()

vi.mock('posthog-js', () => ({
  default: {
    init,
    capture: capturePosthog,
    captureException: captureExceptionPosthog,
  },
}))

async function loadTelemetry(): Promise<
  typeof import('./telemetry')
> {
  vi.resetModules()
  // posthog-js는 동적 import로 별도 청크에서 로드된다 — posthogInit을
  // await해야 posthog.init 호출이 끝난 뒤 단정할 수 있다.
  const mod = await import('./telemetry')
  await mod.posthogInit
  return mod
}

describe('telemetry', () => {
  beforeEach(() => {
    init.mockClear()
    capturePosthog.mockClear()
    captureExceptionPosthog.mockClear()
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
    await loadTelemetry()

    expect(init).toHaveBeenCalledTimes(1)
    expect(init.mock.calls[0][1]).toMatchObject({
      autocapture: false,
      disable_session_recording: true,
      capture_heatmaps: false,
      capture_dead_clicks: false,
      disable_external_dependency_loading: true,
    })
  })

  it('does not initialise when the project token is missing', async () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN

    await loadTelemetry()

    expect(init).not.toHaveBeenCalled()
  })

  // .gitignore가 .env*를 막으므로 새로 클론한 리포에는 이 변수가 없다. 그
  // 상태에서 throw하면 계측 설정 실패만으로 npm run dev의 클라이언트 모듈
  // 평가가 중단돼, 텔레메트리가 제품 기동의 전제가 된다 — 경고로 알리고
  // 계속 진행한다.
  it('warns instead of blocking dev startup when the token is missing', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    delete process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      await expect(loadTelemetry()).resolves.toBeDefined()
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN'),
      )
      expect(init).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
      warn.mockRestore()
    }
  })

  describe('capture and captureException', () => {
    // capture()·captureException()은 posthog-js를 직접 import하지 않는
    // 호출부(AppShell 등 7개 컴포넌트)가 쓰는 유일한 경로다 — SDK 로드가
    // 끝나기 전에 불려도 로드가 끝난 뒤 실제로 전달돼야 한다.
    it('queues capture() until the lazily-loaded client is ready', async () => {
      const { capture } = await loadTelemetry()

      capture('member_selected', { source: 'viewer' })
      await Promise.resolve()
      await Promise.resolve()

      expect(capturePosthog).toHaveBeenCalledWith('member_selected', {
        source: 'viewer',
      })
    })

    it('queues captureException() until the lazily-loaded client is ready', async () => {
      const { captureException } = await loadTelemetry()
      const error = new Error('boom')

      captureException(error, { pane: 'quantity-body' })
      await Promise.resolve()
      await Promise.resolve()

      expect(captureExceptionPosthog).toHaveBeenCalledWith(error, {
        pane: 'quantity-body',
      })
    })

    // 토큰이 없으면(dev 미설정) 이벤트는 조용히 버려진다 — throw해서 호출부의
    // 렌더를 막지 않는다.
    it('silently drops calls when the client never initialised', async () => {
      delete process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
      const { capture, captureException } = await loadTelemetry()

      expect(() => capture('member_selected')).not.toThrow()
      expect(() => captureException(new Error('boom'))).not.toThrow()
    })

    // 9차 리뷰 major 지적: 청크 로드·init 실패가 캐시된 rejected promise가 되면
    // instrumentation-client.ts의 부수 효과 import(아무도 안 기다림)부터 이후
    // capture()·captureException() 호출마다 unhandled rejection이 난다 —
    // loadClient()가 실패를 삼켜 null로 떨어뜨려야 한다. loadTelemetry() 헬퍼는
    // posthogInit을 내부에서 await하므로(실패하면 헬퍼 자체가 reject한다) 이
    // 테스트는 그 헬퍼를 쓰지 않고 모듈을 직접 불러 posthogInit 자체가
    // reject하지 않는지 확인한다.
    it('does not leave an unhandled rejection when posthog.init throws', async () => {
      init.mockImplementationOnce(() => {
        throw new Error('network unreachable')
      })
      vi.resetModules()

      const mod = await import('./telemetry')

      await expect(mod.posthogInit).resolves.not.toBeInstanceOf(Error)
      expect(() => mod.capture('member_selected')).not.toThrow()
    })
  })

  describe('before_send scrubbing', () => {
    // src/domain/rebar/의 조회 실패 메시지는 도면 유래 mm 치수를 문자열 보간으로
    // 담는다(예: `clearMm must be finite: ${clearMm}`). capture_exceptions가 이걸
    // 스크러빙 없이 잡아 보내면 CLAUDE.md CRITICAL을 어긴다. before_send가 그
    // 유일한 관문이다(ADR-020).
    it('redacts drawing-derived digits from exception messages before they leave the browser', async () => {
      await loadTelemetry()

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
      expect(captured.properties.$exception_list[0].type).toBe('Error')
      expect(captured.properties.$exception_list[0].stacktrace).toEqual({
        frames: [{ filename: 'stirrup-layout.ts', lineno: 14 }],
      })
      expect(captured.properties.pane).toBe('quantity-body')
    })

    it('redacts the JSON conditions blob in rule-lookup failures, not just digits', async () => {
      await loadTelemetry()

      const beforeSend = init.mock.calls[0][1].before_send
      const captured = beforeSend({
        uuid: 'u3',
        event: '$exception',
        properties: {
          $exception_list: [
            {
              type: 'Error',
              value:
                'Rule not found: measure.splice.interval for {"exposure":"屋外","finish":"打放し"}',
            },
          ],
        },
      })

      expect(captured.properties.$exception_list[0].value).toBe(
        'Rule not found: measure.splice.interval for {REDACTED}',
      )
    })

    it('redacts pipe-joined group ids in quantity aggregation failures', async () => {
      await loadTelemetry()

      const beforeSend = init.mock.calls[0][1].before_send
      const captured = beforeSend({
        uuid: 'u4',
        event: '$exception',
        properties: {
          $exception_list: [
            {
              type: 'Error',
              value:
                'Inconsistent size or shape in quantity group 1階|C|C1|主筋|1000|12',
            },
          ],
        },
      })

      expect(captured.properties.$exception_list[0].value).toBe(
        'Inconsistent size or shape in quantity group [REDACTED]',
      )
    })

    // 9차 리뷰 critical 지적: letter+digit 토큰(D25·anchorage.L1 같은 룰팩
    // 상수)을 통째로 남기는 규칙이, 같은 모양인 階 라벨(1F 등)도 함께
    // 살려 보낸다 — project.ts 등 10곳의 "Story not found: ${storyId}"가
    // 정확히 이 모양이었다. 룰팩 상수와 도면 라벨은 값의 모양만으로
    // 구분할 수 없으므로(둘 다 letter+digit), 스크러버가 아니라 호출부를
    // 고쳐 JSON 블록으로 감싼다 — lookupRule의 Rule not found 메시지가
    // 이미 쓰는 관례와 같다.
    it('redacts a story id wrapped as a JSON block, unlike a bare letter+digit label', async () => {
      await loadTelemetry()

      const beforeSend = init.mock.calls[0][1].before_send
      const captured = beforeSend({
        uuid: 'u15',
        event: '$exception',
        properties: {
          $exception_list: [
            {
              type: 'Error',
              value: 'Story not found: {"storyId":"1F"}',
            },
          ],
        },
      })

      expect(captured.properties.$exception_list[0].value).toBe(
        'Story not found: {REDACTED}',
      )
    })

    it('keeps digits attached to letters, like rule keys and bar sizes', async () => {
      await loadTelemetry()

      const beforeSend = init.mock.calls[0][1].before_send
      const captured = beforeSend({
        uuid: 'u5',
        event: '$exception',
        properties: {
          $exception_list: [
            { type: 'Error', value: 'Rule not found: anchorage.L1' },
          ],
        },
      })

      expect(captured.properties.$exception_list[0].value).toBe(
        'Rule not found: anchorage.L1',
      )
    })

    it('redacts hyphenated ids that carry digits, like member and section ids', async () => {
      await loadTelemetry()

      const beforeSend = init.mock.calls[0][1].before_send
      const captured = beforeSend({
        uuid: 'u6',
        event: '$exception',
        properties: {
          $exception_list: [
            { type: 'Error', value: 'Member not found for Rebar: 1F-G1-X1Y2-X' },
          ],
        },
      })

      expect(captured.properties.$exception_list[0].value).toBe(
        'Member not found for Rebar: [REDACTED]',
      )
    })

    it('keeps hyphenated words that carry no digits', async () => {
      await loadTelemetry()

      const beforeSend = init.mock.calls[0][1].before_send
      const captured = beforeSend({
        uuid: 'u7',
        event: '$exception',
        properties: {
          $exception_list: [{ type: 'Error', value: 'value is un-configured' }],
        },
      })

      expect(captured.properties.$exception_list[0].value).toBe(
        'value is un-configured',
      )
    })

    it('redacts a numeric range joined by two dots', async () => {
      await loadTelemetry()

      const beforeSend = init.mock.calls[0][1].before_send
      const captured = beforeSend({
        uuid: 'u8',
        event: '$exception',
        properties: {
          $exception_list: [
            { type: 'Error', value: 'Invalid bounds on axis 0: 100.25..200.5' },
          ],
        },
      })

      expect(captured.properties.$exception_list[0].value).toBe(
        'Invalid bounds on axis [REDACTED]: [REDACTED]',
      )
    })

    it('does not leak a partial digit when a multi-digit value directly touches a letter', async () => {
      await loadTelemetry()

      const beforeSend = init.mock.calls[0][1].before_send
      const captured = beforeSend({
        uuid: 'u9',
        event: '$exception',
        properties: {
          $exception_list: [
            { type: 'Error', value: 'Invalid BarSize: D25, grade SD345' },
          ],
        },
      })

      expect(captured.properties.$exception_list[0].value).toBe(
        'Invalid BarSize: D25, grade SD345',
      )
    })

    it('redacts drawing-derived text that posthog-js duplicates outside $exception_list', async () => {
      await loadTelemetry()

      const beforeSend = init.mock.calls[0][1].before_send
      const captured = beforeSend({
        uuid: 'u10',
        event: '$exception',
        properties: {
          $exception_message: 'clearMm must be finite: 342.5',
          $exception_type: 'Error',
          $exception_list: [
            { type: 'Error', value: 'clearMm must be finite: 342.5' },
          ],
        },
      })

      expect(captured.properties.$exception_message).toBe(
        'clearMm must be finite: [REDACTED]',
      )
      expect(captured.properties.$exception_type).toBe('Error')
    })

    it('still scrubs drawing-derived text when $exception_list is absent or malformed', async () => {
      await loadTelemetry()

      const beforeSend = init.mock.calls[0][1].before_send
      const captured = beforeSend({
        uuid: 'u11',
        event: '$exception',
        properties: {
          $exception_message: 'Member not found for Rebar: 1F-G1-X1Y2-X',
        },
      })

      expect(captured.properties.$exception_message).toBe(
        'Member not found for Rebar: [REDACTED]',
      )
    })

    it('leaves static, non-drawing labels on non-exception events unchanged', async () => {
      await loadTelemetry()

      const beforeSend = init.mock.calls[0][1].before_send
      const event = {
        uuid: 'u2',
        event: 'member_selected',
        properties: { source: 'viewer' },
      }

      expect(beforeSend(event)).toEqual(event)
    })

    it('also scrubs drawing-derived text on non-exception events, not only $exception', async () => {
      await loadTelemetry()

      const beforeSend = init.mock.calls[0][1].before_send
      const captured = beforeSend({
        uuid: 'u12',
        event: 'member_selected',
        properties: { groupId: '1階|C|C1' },
      })

      expect(captured.properties.groupId).toBe('[REDACTED]')
    })

    it('preserves stack-frame metadata even when filenames look like hyphenated ids', async () => {
      await loadTelemetry()

      const beforeSend = init.mock.calls[0][1].before_send
      const captured = beforeSend({
        uuid: 'u13',
        event: '$exception',
        properties: {
          $exception_list: [
            {
              type: 'Error',
              value: 'clearMm must be finite: 342.5',
              stacktrace: {
                frames: [
                  {
                    filename: '/_next/static/chunks/app-page-4f2a1b.js',
                    function: 'stirrupLayout',
                    lineno: 14,
                    colno: 8,
                    in_app: true,
                  },
                ],
              },
            },
          ],
        },
      })

      expect(captured.properties.$exception_list[0].value).toBe(
        'clearMm must be finite: [REDACTED]',
      )
      expect(captured.properties.$exception_list[0].stacktrace).toEqual({
        frames: [
          {
            filename: '/_next/static/chunks/app-page-4f2a1b.js',
            function: 'stirrupLayout',
            lineno: 14,
            colno: 8,
            in_app: true,
          },
        ],
      })
    })

    it('preserves PostHog reserved $-prefixed properties like session and device ids', async () => {
      await loadTelemetry()

      const beforeSend = init.mock.calls[0][1].before_send
      const captured = beforeSend({
        uuid: 'u14',
        event: '$exception',
        properties: {
          $session_id: '018f4b2a-7e3d-7000-8000-1234567890ab',
          $device_id: '018f4b2a-7e3d-7000-8000-abcdef123456',
          $lib_version: '1.417.4',
          $exception_list: [{ type: 'Error', value: 'boom: 42' }],
        },
      })

      expect(captured.properties.$session_id).toBe(
        '018f4b2a-7e3d-7000-8000-1234567890ab',
      )
      expect(captured.properties.$device_id).toBe(
        '018f4b2a-7e3d-7000-8000-abcdef123456',
      )
      expect(captured.properties.$lib_version).toBe('1.417.4')
      expect(captured.properties.$exception_list[0].value).toBe(
        'boom: [REDACTED]',
      )
    })

    // 9차 리뷰 major 지적: "$ 접두 키는 항상 SDK 예약 속성"이라는 면제가
    // 깊이와 무관하게 적용되면, properties 안쪽 어딘가에 우연히 $로
    // 시작하는 키가 있어도(도면 데이터를 담고 있어도) 그대로 샌다. 예외
    // 없이 스크러빙되는지 top-level이 아닌 자리에서 확인한다.
    it('does not exempt a $-prefixed key that appears below the top level', async () => {
      await loadTelemetry()

      const beforeSend = init.mock.calls[0][1].before_send
      const captured = beforeSend({
        uuid: 'u16',
        event: '$exception',
        properties: {
          context: { $sectionMark: 'Member not found for Rebar: 1F-G1-X1Y2-X' },
        },
      })

      expect(captured.properties.context.$sectionMark).toBe(
        'Member not found for Rebar: [REDACTED]',
      )
    })

    // 같은 지적의 또 다른 면: type·filename처럼 stacktrace 프레임에서 쓰는
    // 흔한 이름의 키가 $exception_list 밖에 있으면 스크러빙 대상이어야
    // 한다 — scrubExceptionListEntry는 오직 $exception_list의 원소에만
    // 적용되므로, 밖에서는 "이름이 겹친다"는 이유로 면제되지 않는다.
    it('does not exempt a generic stack-frame-like key outside $exception_list', async () => {
      await loadTelemetry()

      const beforeSend = init.mock.calls[0][1].before_send
      const captured = beforeSend({
        uuid: 'u17',
        event: 'member_selected',
        properties: { filename: 'Rule not found: anchorage.L1 for 1F-G1' },
      })

      expect(captured.properties.filename).toBe(
        'Rule not found: anchorage.L1 for [REDACTED]',
      )
    })

    it('passes through a null capture result', async () => {
      await loadTelemetry()

      const beforeSend = init.mock.calls[0][1].before_send

      expect(beforeSend(null)).toBeNull()
    })
  })
})
