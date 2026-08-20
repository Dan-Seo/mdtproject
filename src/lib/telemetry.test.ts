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
    // 대부분의 테스트는 동의가 있는 상태의 동작을 본다 — 동의 게이트 자체는
    // 아래 'telemetry consent' describe에서 opt-in 값을 직접 조작해 확인한다.
    window.localStorage.setItem('kijun:telemetry-opt-in', 'yes')
  })

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
    delete process.env.NEXT_PUBLIC_POSTHOG_HOST
    window.localStorage.clear()
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

  // 원격 설정(/flags)이 코드 변경 없이 autocapture 등 수집 동작을 되살릴 수
  // 있다 — 잠금 고정 버전에 더해 이 채널도 끈다 (9차 리뷰 minor).
  it('disables remote feature-flag configuration', async () => {
    await loadTelemetry()

    expect(init.mock.calls[0][1]).toMatchObject({
      advanced_disable_flags: true,
    })
  })

  describe('telemetry consent', () => {
    // 9차 리뷰 major 지적: 동의 게이트 없이 모듈 평가 시점에 무조건
    // 초기화된다. 이 값을 켜는 UI(동의 배너 등)는 이 PR 범위 밖이라 아직
    // 없다 — 그 전까지는 아무도 opt-in 하지 않아 텔레메트리가 통째로
    // 꺼져 있는 게 정상이다.
    it('does not initialise without stored consent', async () => {
      window.localStorage.clear()

      await loadTelemetry()

      expect(init).not.toHaveBeenCalled()
    })

    it('initialises once consent is stored', async () => {
      window.localStorage.setItem('kijun:telemetry-opt-in', 'yes')

      await loadTelemetry()

      expect(init).toHaveBeenCalledTimes(1)
    })

    it('silently drops calls when consent was never granted', async () => {
      window.localStorage.clear()
      const { capture, captureException } = await loadTelemetry()

      expect(() => capture('member_selected')).not.toThrow()
      expect(() => captureException(new Error('boom'))).not.toThrow()
      await Promise.resolve()
      await Promise.resolve()
      expect(capturePosthog).not.toHaveBeenCalled()
    })

    // 10차 리뷰 major 지적: 쿠키·저장소가 차단된 브라우저(Chrome '모든
    // 쿠키 차단', 샌드박스 iframe)에서 localStorage 접근은 SecurityError를
    // 던진다. capture()·captureException()이 에러 바운더리(PaneBoundary·
    // global-error.tsx) 안에서 불리므로, 여기서 안 막으면 예외를 보고하는
    // 호출 자체가 새 예외를 던져 그 바운더리를 깨뜨린다.
    it('does not throw when localStorage access itself throws', async () => {
      const getItem = vi
        .spyOn(Storage.prototype, 'getItem')
        .mockImplementation(() => {
          throw new DOMException('blocked', 'SecurityError')
        })

      try {
        await expect(loadTelemetry()).resolves.toBeDefined()
        expect(init).not.toHaveBeenCalled()
      } finally {
        getItem.mockRestore()
      }
    })

    // 9차 리뷰가 닫은 "동의 없음은 캐시하지 않는다"의 대칭짝: 동의 상태로
    // 한 번 초기화된 뒤 opt-in 값을 지워도, loadClient()는 이미 캐시된
    // client를 그대로 돌려줘 capture()가 계속 나간다.
    it('stops sending once consent is revoked mid-session', async () => {
      const { capture } = await loadTelemetry()

      capture('member_selected')
      await Promise.resolve()
      await Promise.resolve()
      expect(capturePosthog).toHaveBeenCalledTimes(1)

      window.localStorage.clear()
      capture('member_selected')
      await Promise.resolve()
      await Promise.resolve()
      expect(capturePosthog).toHaveBeenCalledTimes(1)
    })
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

  // ADR-020 은 이 관문을 「예외 message 에서 도면 유래 모양을 지우는」 블랙리스트로
  // 뒀다. 그 설계는 지울 모양의 가짓수가 무한해 수렴하지 않았다 — PR #6 의 리뷰
  // 10 회차 중 7 회차가 같은 함수의 새 구멍이었고(문자값 → 하이픈 id → 100..200
  // 범위숫자 → 그리디 backtrack 반쪽매치 → 글자 포함 토큰 → $ 접두 키), 마지막엔
  // distinct_id 까지 지우는 과다삭제로 방향이 뒤집혔다. 실패 방향이 「유출」인
  // 설계라 못 본 모양이 생길 때마다 데이터가 나간다.
  //
  // 관문을 뒤집는다. 자유 텍스트는 지우는 게 아니라 애초에 싣지 않고, 실을 것만
  // 이름으로 못박는다. 목록 밖은 전부 버려지므로 SDK 가 새 필드를 추가하거나
  // 개발자가 새 throw 사이트를 만들어도 기본값이 「안 나간다」이다 — 실패 방향이
  // 유출이 아니라 관측 가치 저하다.
  //
  // 잃는 것: 예외 message 의 라벨(어느 검사가 실패했는지). 스택 프레임의
  // filename·lineno·function 이 그 자리를 대신하고, 그쪽이 더 정확하다 — 라벨은
  // 어느 가드인지만 알려주지만 프레임은 어느 줄인지 알려준다.
  describe('before_send allowlist', () => {
    const beforeSendOf = () => init.mock.calls[0][1].before_send

    // 진원지. `clearMm must be finite: ${clearMm}`(stirrup-layout.ts:14) 같은
    // 자유 텍스트는 라벨과 값이 한 문자열에 섞여 있어 값만 골라낼 방법이 없다.
    // 통째로 버린다.
    it('drops the free-text exception message entirely, label and all', async () => {
      await loadTelemetry()

      const captured = beforeSendOf()({
        uuid: 'u1',
        event: '$exception',
        properties: {
          $exception_list: [
            {
              type: 'Error',
              value: 'clearMm must be finite: 342.5',
              stacktrace: { frames: [{ filename: 'stirrup-layout.ts', lineno: 14 }] },
            },
          ],
        },
      })

      expect(captured.properties.$exception_list[0].value).toBe('[REDACTED]')
      expect(captured.properties.$exception_list[0].type).toBe('Error')
    })

    // message 를 버린 대가로 이쪽이 유일한 위치 정보가 된다. 전부 빌드 산출물
    // 유래라 도면 값이 실릴 자리가 없다.
    it('keeps stack-frame metadata, which replaces the discarded message', async () => {
      await loadTelemetry()

      const captured = beforeSendOf()({
        uuid: 'u2',
        event: '$exception',
        properties: {
          $exception_list: [
            {
              type: 'Error',
              value: 'clearMm must be finite: 342.5',
              stacktrace: {
                type: 'raw',
                frames: [
                  {
                    filename: '/_next/static/chunks/app-page-4f2a1b.js',
                    function: 'stirrupLayout',
                    lineno: 14,
                    colno: 8,
                    in_app: true,
                    platform: 'web:javascript',
                  },
                ],
              },
            },
          ],
        },
      })

      expect(captured.properties.$exception_list[0].stacktrace).toEqual({
        type: 'raw',
        frames: [
          {
            filename: '/_next/static/chunks/app-page-4f2a1b.js',
            function: 'stirrupLayout',
            lineno: 14,
            colno: 8,
            in_app: true,
            platform: 'web:javascript',
          },
        ],
      })
    })

    // 기본값이 「안 나간다」임을 고정하는 테스트다. 블랙리스트에서는 SDK 가 필드를
    // 하나 늘릴 때마다 새 구멍이었다. context_line 은 소스맵을 붙이면 posthog 가
    // 실제로 실을 수 있는 필드이고, 그 한 줄이 곧 throw 문 원문이다.
    it('drops a stack-frame field it does not know, even one that looks harmless', async () => {
      await loadTelemetry()

      const captured = beforeSendOf()({
        uuid: 'u3',
        event: '$exception',
        properties: {
          $exception_list: [
            {
              type: 'Error',
              stacktrace: {
                frames: [
                  {
                    filename: 'a.js',
                    lineno: 1,
                    context_line: 'clearMm must be finite: 342.5',
                  },
                ],
              },
            },
          ],
        },
      })

      expect(captured.properties.$exception_list[0].stacktrace.frames[0]).toEqual({
        filename: 'a.js',
        lineno: 1,
      })
    })

    // $elements_chain 은 autocapture 를 끈 지금은 안 실리지만, 원격 설정이나 SDK
    // 업그레이드로 되살아나면 부재 aria-label 과 平面 SVG 좌표를 담는다. 이름을
    // 모르는 키를 버리는 설계에서는 이 사고가 성립하지 않는다.
    it('drops an unknown top-level property such as a revived $elements_chain', async () => {
      await loadTelemetry()

      const captured = beforeSendOf()({
        uuid: 'u4',
        event: '$exception',
        properties: {
          $session_id: 's1',
          $elements_chain: 'button:text="1F-G1-X1Y2 G1"',
          $exception_list: [],
        },
      })

      expect(captured.properties.$session_id).toBe('s1')
      expect('$elements_chain' in captured.properties).toBe(false)
    })

    // posthog-js 가 예외 텍스트를 $exception_list 밖에 중복으로 싣는 경로.
    // 이름을 모르므로 그냥 없어진다 — 지울 모양을 따로 배울 필요가 없다.
    it('drops a duplicated exception message carried outside $exception_list', async () => {
      await loadTelemetry()

      const captured = beforeSendOf()({
        uuid: 'u5',
        event: '$exception',
        properties: {
          $exception_message: 'Rule not found: anchorage.L1 for {"exposure":"x"}',
          $exception_list: [],
        },
      })

      expect('$exception_message' in captured.properties).toBe(false)
    })

    // distinct_id 가 스크러빙에 지워져 전 이벤트가 한 사용자로 합쳐지던 10 회차
    // major 의 회귀 방지. 허용목록은 통과시킨 값을 손대지 않으므로 원리상
    // 재발하지 않는다.
    it('leaves allowed identity and metadata values byte-for-byte', async () => {
      await loadTelemetry()

      const captured = beforeSendOf()({
        uuid: 'u6',
        event: '$exception',
        properties: {
          distinct_id: '0198f2c1-4d3e-7a00-8b1c-2f9e6a5d4c3b',
          $session_id: '0198f2c1-aaaa',
          $device_id: '0198f2c1-bbbb',
          $lib_version: '1.297.3',
          $browser_version: '141.0.0',
          $exception_list: [],
        },
      })

      expect(captured.properties).toMatchObject({
        distinct_id: '0198f2c1-4d3e-7a00-8b1c-2f9e6a5d4c3b',
        $session_id: '0198f2c1-aaaa',
        $device_id: '0198f2c1-bbbb',
        $lib_version: '1.297.3',
        $browser_version: '141.0.0',
      })
    })

    // 명시 capture 의 속성은 전부 enum·버킷·불리언·룰팩 key 라 호출부에서 이미
    // 안전하다. 관문이 그걸 다시 망가뜨리지 않는지 본다.
    it('keeps the properties the explicit capture call sites send', async () => {
      await loadTelemetry()

      const captured = beforeSendOf()({
        uuid: 'u7',
        event: 'takeoff_exported',
        properties: {
          locale: 'ja',
          source: 'viewer',
          axis: 'x',
          mode: 'building',
          stage: 'takeoff_export',
          pane: 'quantity-body',
          size_bucket: '100-999',
          has_inferred: true,
          inferred_rules: ['anchorage.L1', 'lap.L1'],
        },
      })

      expect(captured.properties).toEqual({
        locale: 'ja',
        source: 'viewer',
        axis: 'x',
        mode: 'building',
        stage: 'takeoff_export',
        pane: 'quantity-body',
        size_bucket: '100-999',
        has_inferred: true,
        inferred_rules: ['anchorage.L1', 'lap.L1'],
      })
    })

    // URL 계열은 허용목록에 넣지 않았다. 이 앱은 단일 경로라 얻는 게 없는데,
    // 나중에 프로젝트 식별자가 쿼리스트링에 실리면 그대로 유출 경로가 된다.
    it('drops url-shaped properties, which buy nothing on a single-page tool', async () => {
      await loadTelemetry()

      const captured = beforeSendOf()({
        uuid: 'u8',
        event: 'section_edited',
        properties: { $current_url: 'https://example.test/?project=1F-G1', $pathname: '/' },
      })

      expect(captured.properties).toEqual({})
    })

    // $exception_list 가 배열이 아닌 모양으로 오면(SDK 버전 변화) 원문을
    // 통과시키지 않고 버린다.
    it('drops a malformed $exception_list instead of passing it through', async () => {
      await loadTelemetry()

      const captured = beforeSendOf()({
        uuid: 'u9',
        event: '$exception',
        properties: { $exception_list: 'clearMm must be finite: 342.5' },
      })

      expect('$exception_list' in captured.properties).toBe(false)
    })

    // capture_exceptions 가 설치하는 posthog 자체 핸들러는 우리 capture() 래퍼를
    // 거치지 않는다 — 래퍼에만 동의 게이트를 두면 세션 중 철회해도 SDK 가 잡은
    // 예외는 계속 나간다. before_send 는 SDK 내부 발화까지 포함해 모든 전송이
    // 반드시 거치는 유일한 관문이라, 게이트를 여기에도 둔다.
    it('drops the event outright once consent is revoked, including SDK-internal sends', async () => {
      await loadTelemetry()
      const beforeSend = beforeSendOf()

      window.localStorage.removeItem('kijun:telemetry-opt-in')

      expect(
        beforeSend({
          uuid: 'u10',
          event: '$exception',
          properties: { $exception_list: [] },
        }),
      ).toBeNull()
    })

    // 허용목록이 properties 만 덮으면 페이로드의 나머지가 무검사로 나간다.
    // $set·$set_once 는 person property 라 posthog 프로필에 영구 저장된다.
    it('drops person properties, which never pass through the properties gate', async () => {
      await loadTelemetry()

      const captured = beforeSendOf()({
        uuid: 'u11',
        event: 'section_edited',
        timestamp: 't',
        properties: { locale: 'ja' },
        $set: { story: '1F', mark: 'G1' },
        $set_once: { first_mark: 'G1' },
      })

      expect(captured).toEqual({
        uuid: 'u11',
        event: 'section_edited',
        timestamp: 't',
        properties: { locale: 'ja' },
      })
    })

    it('passes through a null capture result', async () => {
      await loadTelemetry()

      expect(beforeSendOf()(null)).toBeNull()
    })
  })
})
