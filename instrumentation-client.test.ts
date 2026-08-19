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
      // heatmap·dead click도 DOM을 훑는 수집기다 — autocapture만 끄면
      // defaults 프리셋이나 원격 설정이 코드 변경 없이 다시 켤 수 있다.
      capture_heatmaps: false,
      capture_dead_clicks: false,
      // posthog-js는 초기화 후 세션 리플레이·서베이 번들을 CDN에서 지연
      // 로드할 수 있다 — 잠금파일 밖의 코드가 페이지에서 실행되지 않게 막는다.
      disable_external_dependency_loading: true,
    })
  })

  it('does not initialise when the project token is missing', async () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN

    await loadInstrumentation()

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
      await expect(loadInstrumentation()).resolves.not.toThrow()
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN'),
      )
      expect(init).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
      warn.mockRestore()
    }
  })

  // src/domain/rebar/의 조회 실패 메시지는 도면 유래 mm 치수를 문자열 보간으로
  // 담는다(예: `clearMm must be finite: ${clearMm}`). capture_exceptions가 이걸
  // 스크러빙 없이 잡아 보내면 CLAUDE.md CRITICAL을 어긴다. before_send가 그
  // 유일한 관문이다(ADR-020).
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

  // src/domain/rules/lookup.ts:40의 `Rule not found: ${key} for ${JSON.stringify(conditions)}`는
  // conditions에 exposure·finish 같은 문자값을 담는다. 숫자만 지우면 이 값들은
  // 그대로 살아 나간다 — 문자값을 담는 모양(JSON 블록)도 지워야 한다.
  it('redacts the JSON conditions blob in rule-lookup failures, not just digits', async () => {
    await loadInstrumentation()

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

  // memberGroupKey(project.ts)가 만드는 그룹 id는 `${story.name}|C|${section.mark}`
  // 형태다. 층 이름·符号은 문자라 숫자 스크러빙을 통과해 그대로 나간다.
  it('redacts pipe-joined group ids in quantity aggregation failures', async () => {
    await loadInstrumentation()

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

  // 룰 key(anchorage.L1)처럼 문자에 붙은 숫자는 룰팩 상수지 도면 값이 아니다 —
  // 「어느 룰이 없는지」를 알려주는 이 계측의 목적을 함께 깎으면 안 된다.
  it('keeps digits attached to letters, like rule keys and bar sizes', async () => {
    await loadInstrumentation()

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

  // quantity/index.ts:210의 `Member not found for Rebar: ${rebar.memberId}`와
  // project.ts:105의 `Member and section kinds do not match: ${member.id}`는
  // 하이픈+숫자 id(예: `1F-G1-X1Y2-X`·`section-G1`)를 담는다. {}·파이프·독립
  // 숫자 세 규칙 어디에도 이 모양이 안 걸린다 — 断面リスト 취입이 부재 id에
  // 符号을 넣는 순간 그대로 유출된다.
  it('redacts hyphenated ids that carry digits, like member and section ids', async () => {
    await loadInstrumentation()

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

  // 순수 문자 하이픈 낱말(숫자 없음)은 도면 데이터가 아니므로 남긴다 —
  // env 안내 메시지의 "un-configured"가 실제 사례다.
  it('keeps hyphenated words that carry no digits', async () => {
    await loadInstrumentation()

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

  // geometry.ts:479의 `Invalid bounds on axis ${axis}: ${min}..${max}`는 두
  // 독립 숫자를 `..`로 잇는다. 앞 숫자 뒤·뒤 숫자 앞 모두 `.`이 있어, `.`을
  // 「문자에 붙은 숫자」 판정에 쓰던 이전 규칙(양옆 lookaround가 `.`을 제외)이
  // 둘 다 통과시켰다 — 도면 유래 mm 경계값이 원문 그대로 나갔다.
  it('redacts a numeric range joined by two dots', async () => {
    await loadInstrumentation()

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

  // 5차 리뷰 지적: `(?<![\p{L}_])[\d.]+(?![\p{L}_])`는 경계(앞뒤)만 보고
  // `+`의 backtrack은 막지 않는다 — 탐욕적으로 최대 길이를 먼저 시도하다
  // 경계 실패로 한 글자씩 물러나던 중 남은 부분이 우연히 경계 조건을
  // 통과하면 거기서 매치가 성립해, D25 같은 값이 "D2[REDACTED]"로(숫자
  // "5"만 지워지고 "D2"는 그대로), SD345가 "SD3[REDACTED]"로 반쪽만
  // 지워졌다 — 지운 척하면서 값 대부분을 그대로 흘려보내는, 안 지우느니만
  // 못한 결과다. 문자가 하나라도 붙은 토큰은 부분 매치 없이 통째로
  // 남아야 한다.
  it('does not leak a partial digit when a multi-digit value directly touches a letter', async () => {
    await loadInstrumentation()

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

  // 6차 리뷰 critical 지적: posthog-js는 exception 텍스트를 $exception_list[].value
  // 뿐 아니라 $exception_message 같은 최상위 필드에도 중복해서 싣는다. 이전
  // 스크러버는 $exception_list 경로만 봐서 이 중복 경로로 도면 값이 그대로 나갔다.
  it('redacts drawing-derived text that posthog-js duplicates outside $exception_list', async () => {
    await loadInstrumentation()

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

  // 6차 리뷰 major 지적: $exception_list가 배열이 아니면(다른 필드에만 텍스트가
  // 실린 경우 포함) 이전 코드는 스크러빙 없이 원문 그대로 통과시켰다(fail-open).
  it('still scrubs drawing-derived text when $exception_list is absent or malformed', async () => {
    await loadInstrumentation()

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
