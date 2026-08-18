import posthog from 'posthog-js'
import type { BeforeSendFn } from 'posthog-js'

/**
 * src/domain/rebar/의 조회 실패 메시지는 도면 유래 mm 치수를 문자열 보간으로
 * 담는다(예: `clearMm must be finite: ${clearMm}`). capture_exceptions가 이걸
 * 스크러빙 없이 잡아 보내면 사용자 도면 데이터가 서버로 나간다 (ADR-017 위반).
 * 숫자만 지운다 — 앞의 라벨(어느 검사가 실패했는지)은 룰팩 공백을 찾는 유일한
 * 신호라 PaneBoundary가 남긴다.
 */
const scrubDrawingDigits: BeforeSendFn = (captureResult) => {
  if (captureResult === null) return captureResult
  if (captureResult.event !== '$exception') return captureResult

  const exceptionList = captureResult.properties.$exception_list
  if (!Array.isArray(exceptionList)) return captureResult

  return {
    ...captureResult,
    properties: {
      ...captureResult.properties,
      $exception_list: exceptionList.map((exception) => ({
        ...exception,
        value:
          typeof exception.value === 'string'
            ? exception.value.replace(/\d+(\.\d+)?/g, '[REDACTED]')
            : exception.value,
      })),
    },
  }
}

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST

if (!projectToken || !host) {
  if (process.env.NODE_ENV === 'development') {
    const missingVariable = projectToken
      ? 'NEXT_PUBLIC_POSTHOG_HOST'
      : 'NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN'

    throw new Error(
      `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`,
    )
  }
} else {
  posthog.init(projectToken, {
    api_host: host,
    defaults: '2026-01-30',
    capture_exceptions: true,
    debug: process.env.NODE_ENV === 'development',
    // 자동수집은 $elements_chain에 부재 aria-label과 平面 SVG 좌표를 실어 보낸다.
    // 도면 데이터를 서버로 보내지 않기 위해 끈다 — 계측은 명시적 capture만.
    autocapture: false,
    disable_session_recording: true,
    // 모든 capture·captureException 호출이 여길 거친다 — 스크러빙 지점을
    // 호출부마다 흩어놓지 않고 여기 하나로 모은다.
    before_send: scrubDrawingDigits,
  })
}
