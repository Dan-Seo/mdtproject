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
 * ①②③의 모양을 통째로 지운다. 룰 key(anchorage.L1)나 D25·SD345 같은 철근
 * 규격 표기처럼 문자에 붙은 숫자, env 안내문의 "un-configured"처럼 숫자
 * 없는 하이픈 낱말은 룰팩 상수·정적 문구지 도면 값이 아니므로 남긴다 —
 * 어느 룰이 없는지가 이 계측의 목적이라 PaneBoundary가 그 라벨에 기댄다.
 */
function scrubDrawingText(text: string): string {
  return text
    .replace(/\{.*\}/g, '{REDACTED}') // JSON.stringify(conditions) 블록 (한 줄 출력이라 개행은 없다)
    .replace(/\S*\|\S*/g, '[REDACTED]') // story.name|code|mark 형태의 그룹 id
    .replace(/(?=\S*-)(?=\S*\d)\S+/g, '[REDACTED]') // 1F-G1-X1Y2-X·section-G1 형태의 id
    // 나머지 독립 숫자(소수·범위 포함)를 지운다. 이전에는 lookaround
    // `(?<![\p{L}_])[\d.]+(?![\p{L}_])`로 앞뒤 경계만 봤는데, `+`가 최대
    // 길이를 먼저 그리디하게 시도하다 경계 실패로 한 글자씩 물러날 때
    // run 중간에서 멈추는 backtrack 자체는 막지 못했다 — 그 결과 D25가
    // "D2[REDACTED]"로, SD345가 "SD3[REDACTED]"로 숫자 대부분이 그대로
    // 남는 반쪽짜리 매치가 났다(경계만 봤지 run 내부 분할은 안 봤다).
    // 그래서 문자·숫자·밑줄·점을 먼저 한 토큰으로 통째로 묶고, 그 토큰에
    // 글자가 하나라도 있는지로 한 번에 판정한다 — 글자가 있으면 토큰
    // 전체를 남기고(anchorage.L1·D25는 여전히 남는다), 숫자·점만으로 된
    // 토큰이면 통째로 지운다. 판정이 토큰 전체 단위라 부분 매치가 나올
    // 자리가 없다.
    .replace(/[\p{L}\d_.]+/gu, (token) =>
      /\p{L}/u.test(token) || !/\d/.test(token) ? token : '[REDACTED]',
    )
}

/**
 * posthog-js는 예외 텍스트를 $exception_list[].value 하나에만 담지 않는다 —
 * $exception_message·$exception_type처럼 최상위 속성에도 같은 값을 중복해
 * 싣는다(6차 리뷰 critical). 필드 하나씩 이름으로 짚어 지우면 SDK가 새 중복
 * 필드를 추가할 때마다 또 구멍이 생긴다 — properties를 재귀로 훑어 만나는
 * 모든 문자열에 scrubDrawingText를 적용한다. scrubDrawingText 자체가 값의
 * *모양*(숫자·JSON·id)으로 판정하므로, pane 같은 정적 라벨 문자열이나
 * stacktrace의 filename처럼 도면과 무관한 문자열은 이 재귀를 거쳐도
 * 그대로 남는다 — 지울 자리를 넓히는 것이지 판정 기준을 바꾸는 게 아니다.
 */
function scrubDrawingDeep(value: unknown): unknown {
  if (typeof value === 'string') return scrubDrawingText(value)
  if (Array.isArray(value)) return value.map(scrubDrawingDeep)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        scrubDrawingDeep(entry),
      ]),
    )
  }
  return value
}

/**
 * capture_exceptions가 未捕捉 예외를 스크러빙 없이 잡아 보내면 사용자 도면
 * 데이터가 서버로 나간다 (CLAUDE.md CRITICAL — 이 관문의 근거는 ADR-020).
 * posthog-js의 모든 capture·captureException이 여길 거치므로, 호출부마다
 * 흩어놓지 않고 여기 하나로 모은다. properties를 통째로 재귀 처리하므로
 * $exception_list가 배열이 아닌 모양이어도(SDK 버전 변화 등) 원문을 그대로
 * 통과시키지 않는다(6차 리뷰 major — 이전 코드는 그 경우 fail-open이었다).
 */
const scrubDrawingDigits: BeforeSendFn = (captureResult) => {
  if (captureResult === null) return captureResult
  if (captureResult.event !== '$exception') return captureResult

  return {
    ...captureResult,
    properties: scrubDrawingDeep(captureResult.properties) as typeof captureResult.properties,
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
