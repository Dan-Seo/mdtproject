import type { BeforeSendFn, PostHog } from 'posthog-js'

/**
 * 이 관문은 「나가면 안 되는 것을 지운다」가 아니라 「나가도 되는 것만 싣는다」로
 * 동작한다. 목록에 없는 키는 값을 보지 않고 버린다.
 *
 * 방향을 뒤집은 이유는 앞선 설계가 수렴하지 않았기 때문이다. 예외 message 에서
 * 도면 유래 모양을 지우는 블랙리스트는 지울 모양의 가짓수가 무한하다 — 이 PR 의
 * 리뷰 10 회차 중 7 회차가 같은 정규식의 새 구멍이었고(문자값 → 하이픈 id →
 * `100..200` 범위숫자 → 그리디 backtrack 반쪽매치 → 글자 포함 토큰 → `$` 접두
 * 키), 마지막엔 posthog 의 distinct_id 까지 지우는 과다삭제로 방향이 뒤집혔다.
 * 못 본 모양이 생길 때마다 실패 방향이 「유출」인 설계였다.
 *
 * 허용목록은 반대로 실패한다. SDK 가 필드를 추가하거나 개발자가 새 throw 사이트를
 * 만들면 그 값은 조용히 사라진다 — 관측 가치가 줄 뿐 데이터는 나가지 않는다.
 */
const REDACTED = '[REDACTED]'

/**
 * 최상위 property 중 브라우저 밖으로 나갈 수 있는 것.
 *
 * URL 계열($current_url·$pathname·$referrer)은 일부러 뺐다. 이 앱은 단일 경로라
 * 얻는 정보가 없는데, 나중에 프로젝트 식별자가 쿼리스트링에 실리면 그대로 유출
 * 경로가 된다.
 */
const ALLOWED_PROPERTY_KEYS: ReadonlySet<string> = new Set([
  // posthog-js 가 이벤트마다 싣는 식별·환경 메타데이터. 사용자를 세고 재현
  // 환경을 아는 데 필요하고, 어느 것도 도면 유래가 아니다.
  'distinct_id',
  '$session_id',
  '$device_id',
  '$window_id',
  '$lib',
  '$lib_version',
  '$time',
  '$sent_at',
  '$insert_id',
  '$os',
  '$os_version',
  '$browser',
  '$browser_version',
  // 예외 이벤트의 구조화 필드. $exception_list 는 아래 allowExceptionEntry 가
  // 한 겹 더 거른다. level·handled 는 열거값·불리언이다.
  '$exception_list',
  '$exception_level',
  '$exception_handled',
  // 명시 capture 호출부가 싣는 속성. 전부 enum(locale·source·axis·mode·stage·
  // pane)·버킷(size_bucket)·불리언(has_inferred·has_unverified)·룰팩 key 배열(inferred_rules)
  // 이라 호출부에서 이미 도면 값이 실릴 자리가 없다.
  'locale',
  'source',
  'axis',
  'mode',
  'stage',
  'pane',
  'size_bucket',
  'has_inferred',
  'has_unverified',
  'inferred_rules',
])

/**
 * 스택 프레임에서 남길 필드. 전부 빌드 산출물 유래(번들 경로·소스 식별자·행열
 * 번호)라 도면 값이 실릴 자리가 없다.
 *
 * context_line·pre_context·post_context 는 없다 — 소스맵을 붙이면 posthog 가
 * 실을 수 있는 필드인데, 그 한 줄이 곧 `throw new Error(...)` 원문이라 보간 전
 * 템플릿이 아니라 보간 후 값이 실릴 수 있다.
 */
const ALLOWED_FRAME_KEYS: ReadonlySet<string> = new Set([
  'filename',
  'function',
  'lineno',
  'colno',
  'in_app',
  'platform',
  'lang',
  'resolved',
])

function pickAllowed(
  source: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(source).filter(([key]) => allowed.has(key)),
  )
}

function allowFrame(frame: unknown): Record<string, unknown> {
  if (frame === null || typeof frame !== 'object') return {}
  return pickAllowed(frame as Record<string, unknown>, ALLOWED_FRAME_KEYS)
}

function allowStacktrace(stacktrace: unknown): Record<string, unknown> | null {
  if (stacktrace === null || typeof stacktrace !== 'object') return null

  const { type, frames } = stacktrace as Record<string, unknown>
  const allowed: Record<string, unknown> = {}
  // 'raw' | 'resolved' — posthog 가 소스맵 적용 여부를 판단하는 열거값이다.
  if (typeof type === 'string') allowed.type = type
  if (Array.isArray(frames)) allowed.frames = frames.map(allowFrame)
  return allowed
}

/**
 * value 는 개발자가 문자열 보간으로 만든 자유 텍스트다 — `clearMm must be
 * finite: ${clearMm}`(stirrup-layout.ts:14)처럼 라벨과 도면 값이 한 문자열에
 * 섞여 있어 값만 골라낼 방법이 없다. 통째로 버리고 상수로 대체한다.
 *
 * 그 대가로 「어느 검사가 실패했는지」를 잃지만, stacktrace 의 filename·lineno·
 * function 이 그 자리를 대신하고 그쪽이 더 정확하다 — 라벨은 어느 가드인지만
 * 알려주고 프레임은 어느 줄인지 알려준다.
 */
function allowExceptionEntry(entry: unknown): Record<string, unknown> {
  const allowed: Record<string, unknown> = { value: REDACTED }
  if (entry === null || typeof entry !== 'object') return allowed

  const { type, stacktrace } = entry as Record<string, unknown>
  // 에러 클래스명. 코드의 고정 식별자라 보간될 자리가 없다.
  if (typeof type === 'string') allowed.type = type
  const allowedStacktrace = allowStacktrace(stacktrace)
  if (allowedStacktrace) allowed.stacktrace = allowedStacktrace
  return allowed
}

function allowProperties(properties: unknown): Record<string, unknown> {
  if (properties === null || typeof properties !== 'object') return {}

  const allowed: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(
    properties as Record<string, unknown>,
  )) {
    if (!ALLOWED_PROPERTY_KEYS.has(key)) continue
    if (key === '$exception_list') {
      // 배열이 아닌 모양으로 오면(SDK 버전 변화) 원문을 통과시키지 않고 버린다.
      if (Array.isArray(value)) allowed[key] = value.map(allowExceptionEntry)
      continue
    }
    allowed[key] = value
  }
  return allowed
}

/**
 * 페이로드 최상위에서 남길 필드. properties 만 거르면 나머지가 무검사로 나간다
 * — 특히 $set·$set_once 는 person property 라 posthog 프로필에 영구 저장된다.
 * 이 리포는 identify()·setPersonProperties() 를 부르지 않으므로 통째로 버린다.
 */
const ALLOWED_PAYLOAD_KEYS: ReadonlySet<string> = new Set([
  'uuid',
  'event',
  'timestamp',
  'properties',
])

/**
 * posthog-js 의 모든 전송이 여길 거친다 (ADR-020). 이벤트 종류로 가르지 않고
 * 전부 같은 관문을 통과시킨다 — $exception 만 거르면 capture() 호출부가 실수로
 * 도면 값을 실었을 때 걸러지지 않는다.
 */
const allowOutgoingPayload: BeforeSendFn = (captureResult) => {
  if (captureResult === null) return captureResult

  // capture_exceptions 가 설치하는 posthog 자체 핸들러(전역 onerror·
  // unhandledrejection)와 pageview 수집기는 capture()·captureException() 래퍼를
  // 거치지 않는다. 래퍼에만 동의 게이트를 두면 세션 중 철회해도 그 경로는 계속
  // 나가므로, SDK 내부 발화까지 잡히는 이 관문에도 같은 게이트를 둔다.
  if (!hasTelemetryConsent()) return null

  const allowed = pickAllowed(
    captureResult as unknown as Record<string, unknown>,
    ALLOWED_PAYLOAD_KEYS,
  )
  allowed.properties = allowProperties(captureResult.properties)
  return allowed as unknown as typeof captureResult
}

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST

const TELEMETRY_OPT_IN_KEY = 'kijun:telemetry-opt-in'

/**
 * before_send 스크러빙(ADR-020)과는 별개의 관문이다 — 스크러버가 뚫리는
 * 경우에도 애초에 동의 없이는 아웃바운드 요청 자체가 나가지 않아야 한다
 * (9차 리뷰 major). 이 값을 켜는 UI(동의 배너·설정 등)는 이 PR 범위
 * 밖이라 아직 없다 — 그 전까지는 아무도 opt-in 하지 않아 텔레메트리가
 * 통째로 꺼져 있는 게 정상이다.
 */
function hasTelemetryConsent(): boolean {
  if (typeof window === 'undefined') return false

  try {
    return window.localStorage.getItem(TELEMETRY_OPT_IN_KEY) === 'yes'
  } catch {
    // 쿠키·저장소 차단(Chrome '모든 쿠키 차단', 샌드박스 iframe)에서는
    // localStorage 접근 자체가 SecurityError를 던진다. 이 함수는
    // capture()·captureException()을 거쳐 에러 바운더리 안에서도 불리므로,
    // 여기서 안 막으면 예외를 보고하는 호출이 새 예외를 던져 그 바운더리를
    // 깨뜨린다(10차 리뷰 major).
    return false
  }
}

/**
 * 이 파일이 posthog-js를 정적 import하면, 이 파일을 import하는 컴포넌트
 * 7개(AppShell·PaneBoundary·PlanEditor·TakeoffPane·SectionTable·Viewer3D·
 * ViewerTabs·global-error) 전부가 초기 페이지 번들에 SDK 전체(약 250KB)를
 * 끌고 들어온다 — lighthouserc.cjs의 script:size 예산은 여유가 15KB도
 * 안 남아 이 리포가 exceljs·three.js를 동적 import·별도 청크로 떼어온
 * 관례와 어긋난다. 동적 import로 SDK 자체를 별도 청크로 미룬다.
 *
 * capture()·captureException()은 이 promise가 풀리기 전에 불려도 안전하다
 * — 로드·초기화가 끝날 때까지 큐잉된다(아래 참고).
 */
let client: Promise<PostHog | null> | null = null

function loadClient(): Promise<PostHog | null> {
  if (client) return client

  // 이 파일을 정적 import하는 컴포넌트 7개는 Next의 서버 프리렌더에서도
  // 모듈 평가를 겪는다(9차 리뷰 minor) — hasTelemetryConsent()가 SSR(창
  // 없음)도 동의 없음으로 함께 처리한다. 동의가 없는 동안은 `client`에
  // 캐시하지 않고 매번 다시 확인한다 — 나중에 동의 UI가 생겨 사용자가
  // 뒤늦게 켜도 이 세션이 캐시된 null에 페이지 새로고침 없이는 못
  // 빠져나오는 상태에 갇히지 않게 하기 위함이다.
  if (!hasTelemetryConsent()) {
    return Promise.resolve(null)
  }

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
    client = Promise.resolve(null)
    return client
  }

  client = import('posthog-js').then(({ default: posthog }) => {
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
      //
      // capture_exceptions와는 무관하다 — posthog-js는 exceptions 확장을
      // "eagerly construct extensions from default classes" 방식으로
      // __defaultExtensionClasses에서 즉시 생성한다(posthog-core.js의
      // PostHog 생성자, `this.exceptions = ext.exceptions && new
      // ext.exceptions(this)`), CDN에서 지연 로드하는 대상이 아니다.
      // 이 플래그가 막는 건 session-recording·surveys·toolbar처럼
      // loadExternalDependency를 타는 확장뿐이다.
      disable_external_dependency_loading: true,
      // 원격 설정(/flags)이 코드 변경 없이 autocapture 등을 되살릴 수
      // 있다 — 잠금 고정 버전(package.json)에 더해 이 채널도 끈다.
      advanced_disable_flags: true,
      // 모든 capture·captureException 호출이 여길 거친다 — 관문을 호출부마다
      // 흩어놓지 않고 여기 하나로 모은다. 파일 상단의 허용목록이 나갈 수 있는
      // 것을 이름으로 못박고, 목록 밖은 값을 보지 않고 버린다.
      //
      // 이전 판은 반대 방향(나가면 안 되는 모양을 지우는 블랙리스트)이었고
      // 수렴하지 않았다 — 상단 주석에 그 경위를 남겼다. loadClient() 의 동의
      // 게이트가 이 관문과 별개의 두 번째 방어선이다.
      before_send: allowOutgoingPayload,
    })
    return posthog
  })
  client = client.catch((error: unknown) => {
    // 청크 로드 실패(오프라인 등)나 init 자체가 던지는 경우 여기서 안
    // 삼키면 client가 rejected promise로 캐시돼, 이후 모든 capture()·
    // captureException() 호출(loadClient().then(...))마다 unhandled
    // rejection이 반복된다(9차 리뷰 major) — 텔레메트리가 죽었을 뿐인데
    // 애플리케이션 코드가 그 실패를 잡을 방법이 없다. null로 떨어뜨려
    // capture()·captureException()이 조용히 no-op하게 한다.
    if (process.env.NODE_ENV === 'development') {
      console.warn('PostHog telemetry failed to load — disabled for this session', error)
    }
    return null
  })
  return client
}

/**
 * 부수 효과만을 위한 import(Next.js의 instrumentation-client.ts 관례)에서는
 * 아무도 이 값을 기다리지 않지만, 테스트는 posthog.init 호출이 끝난 뒤에
 * 단정해야 하므로 export해 둔다.
 */
export const posthogInit = loadClient()

/**
 * capture·captureException 호출부를 이 파일 하나로 모은다 — posthog-js를
 * 직접 import하면 그 컴포넌트가 SDK를 정적으로 끌고 들어오고(위 설명),
 * before_send 스크러빙도 posthog.init을 실제로 호출한 이 파일을 거치지
 * 않고는 걸리지 않는다. eslint.config.mjs의 no-restricted-imports가
 * src/lib/telemetry.ts 밖에서 posthog-js를 직접 import하지 못하게 막는다.
 */
/**
 * loadClient()의 `if (client) return client`는 일단 동의 상태로 초기화된
 * 뒤에는 client를 영구 캐시한다 — opt-in 값을 지워도(10차 리뷰 minor)
 * loadClient() 자신은 그걸 다시 보지 않는다. 전송 진입점인 여기서 매번
 * 다시 확인해 동의 철회가 페이지 새로고침 없이도 즉시 반영되게 한다.
 */
export function capture(
  event: string,
  properties?: Record<string, unknown>,
): void {
  if (!hasTelemetryConsent()) return
  void loadClient().then((posthog) => posthog?.capture(event, properties))
}

export function captureException(
  error: unknown,
  properties?: Record<string, unknown>,
): void {
  if (!hasTelemetryConsent()) return
  void loadClient().then((posthog) =>
    posthog?.captureException(error, properties),
  )
}
