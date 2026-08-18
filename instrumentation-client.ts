import posthog from 'posthog-js'
import type { BeforeSendFn } from 'posthog-js'

/**
 * 도면 유래 값은 예외 message에 세 모양으로 실린다.
 * ① 独立 숫자 — `clearMm must be finite: ${clearMm}` (stirrup-layout.ts).
 * ② 문자값 — lookupRule의 `Rule not found: ${key} for ${JSON.stringify(conditions)}`가
 *   담는 exposure·finish(lookup.ts)와, memberGroupKey가 만드는
 *   `${story.name}|C|${section.mark}` 형태의 그룹 id(project.ts)의 층 이름·符号.
 * ③ 하이픈 id — `Member not found for Rebar: ${rebar.memberId}`(quantity/index.ts)와
 *   `Member and section kinds do not match: ${member.id}`(project.ts)가 담는
 *   `1F-G1-X1Y2-X`·`section-G1` 형태. 断面リスト 취입이 부재 id에 符号을
 *   넣는 순간 이 경로로 유출된다.
 * ④ 범위 숫자 — `assertBounds`(geometry.ts)의 `Invalid bounds on axis ${axis}:
 *   ${min}..${max}`처럼 두 독립 숫자를 `.`로 잇는 모양. `.`을 숫자 판정에서
 *   완전히 배제하면 지워지지만, ①의 소수점(`342.5`)까지 갈라 반쪽만 지우게 된다.
 *
 * ①②③의 모양을 통째로 지운다. 룰 key(anchorage.L1)처럼 문자에 붙은 숫자,
 * env 안내문의 "un-configured"처럼 숫자 없는 하이픈 낱말은 룰팩 상수·정적
 * 문구지 도면 값이 아니므로 남긴다 — 어느 룰이 없는지가 이 계측의 목적이라
 * PaneBoundary가 그 라벨에 기댄다.
 */
function scrubDrawingText(text: string): string {
  return text
    .replace(/\{.*\}/g, '{REDACTED}') // JSON.stringify(conditions) 블록 (한 줄 출력이라 개행은 없다)
    .replace(/\S*\|\S*/g, '[REDACTED]') // story.name|code|mark 형태의 그룹 id
    .replace(/(?=\S*-)(?=\S*\d)\S+/g, '[REDACTED]') // 1F-G1-X1Y2-X·section-G1 형태의 id
    // 나머지 독립 숫자. `.`을 lookaround 제외 문자에 넣으면 "342.5" 같은
    // 소수 하나는 지키지만 "100..200"처럼 두 숫자를 `.`로 이은 범위는 양쪽
    // 다 `.`에 막혀 못 지운다(geometry.ts의 bounds 메시지가 실제 사례) — 그래서
    // `.`은 매치 문자 클래스 안에 넣어 숫자·점의 연속 run을 통째로 잡고,
    // lookaround는 글자·밑줄만 배제한다(anchorage.L1의 L1은 여전히 남는다).
    .replace(/(?<![\p{L}_])[\d.]+(?![\p{L}_])/gu, '[REDACTED]')
}

/**
 * capture_exceptions가 未捕捉 예외를 스크러빙 없이 잡아 보내면 사용자 도면
 * 데이터가 서버로 나간다 (CLAUDE.md CRITICAL — 이 관문의 근거는 ADR-020).
 * posthog-js의 모든 capture·captureException이 여길 거치므로, 호출부마다
 * 흩어놓지 않고 여기 하나로 모은다.
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
            ? scrubDrawingText(exception.value)
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

    // .gitignore가 .env*를 막아 새로 클론한 리포에는 이 값이 없다. throw하면
    // 계측 설정 실패만으로 npm run dev의 클라이언트 모듈 평가가 멎어, 텔레메트리가
    // 제품 기동의 전제가 된다 — 경고만 하고 계속 진행한다.
    console.warn(
      `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This warning stops appearing once ${missingVariable} is configured`,
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
    // heatmap·dead click도 DOM을 훑는 수집기다 — autocapture만 끄면 defaults
    // 프리셋이나 PostHog 원격 설정이 코드 변경 없이 다시 켤 수 있다.
    capture_heatmaps: false,
    capture_dead_clicks: false,
    // 초기화 후 세션 리플레이·서베이 번들을 CDN에서 지연 로드할 수 있다 —
    // 잠금파일 밖의 코드가 페이지에서 실행되지 않게 막는다.
    disable_external_dependency_loading: true,
    // 모든 capture·captureException 호출이 여길 거친다 — 스크러빙 지점을
    // 호출부마다 흩어놓지 않고 여기 하나로 모은다.
    before_send: scrubDrawingDigits,
  })
}
