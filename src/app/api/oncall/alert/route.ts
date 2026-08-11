import { createHash, timingSafeEqual } from 'node:crypto'

// PostHog error tracking alert(단건·급증) 웹훅 수신 핸들러 — prod alert 1차 방어선의 입구.
//
// 이 핸들러는 딱 세 가지만 한다: 시크릿 검증 → 멱등 선삽입 → CI 위임(dispatch).
// 서버리스에서는 claude -p를 띄울 수 없으므로 판정·분석은 CI(oncall-alert.yml)의
// 헤드리스 에이전트가 한다. 여기에 분석 로직을 넣지 말 것.
//
// 멱등 저장소는 GitHub ref다: refs/oncall/alerts/<날짜>-<id> 원자적 생성이
// 선삽입이고, 이미 있으면(422) 같은 알림의 재전송이므로 dispatch를 생략한다.
// dispatch 실패 시 ref를 보상 삭제해 PostHog 재전송이 유실되지 않게 한다.
//
// 참고: 이 라우트는 PostHog 알림 메타데이터만 다룬다. 사용자 도면 데이터는
// 여전히 서버로 오지 않는다 (CLAUDE.md CRITICAL의 취지 유지).

// 이 라우트의 유일한 egress 대상. 다른 호스트를 추가하지 말 것 —
// "클라이언트 온리" 전제의 유일한 서버측 예외이고 범위는 ADR-017이 계약한다.
const GITHUB_API = 'https://api.github.com'

export const runtime = 'nodejs'

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

// 길이가 달라도 시간 차이가 새지 않도록 해시끼리 비교한다
function secretMatches(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

// 모든 GitHub 호출은 이 헬퍼만 쓴다 — path만 받으므로 다른 호스트로의
// egress가 문법적으로 불가능하다 (ADR-017의 단일 egress 계약).
function githubFetch(
  token: string,
  path: string,
  init?: Pick<RequestInit, 'method' | 'body'>,
): Promise<Response> {
  return fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'kijun-oncall-alert',
      'content-type': 'application/json',
    },
  })
}

// 방문자가 정할 수 있는 텍스트(예외 메시지 등)에서 개행·백틱·$를 지우고 길이를
// 자른다 — CI 에이전트 입력이 되므로 인젝션 탑재량을 줄인다.
function sanitize(value: unknown, maxLength: number): string {
  return (typeof value === 'string' ? value : '')
    .replace(/[\r\n`$]/g, ' ')
    .slice(0, maxLength)
}

const KINDS = ['issue_created', 'issue_reopened', 'spike']

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.ONCALL_WEBHOOK_SECRET
  const token = process.env.ONCALL_GITHUB_TOKEN
  const repo = process.env.ONCALL_GITHUB_REPO
  if (!secret || !token || !repo) {
    // 설정 누락 상태에서 검증 없이 열리면 안 된다 — fail-closed
    return Response.json({ error: 'misconfigured' }, { status: 500 })
  }

  const provided = request.headers.get('x-oncall-secret')
  if (provided === null || !secretMatches(provided, secret)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Content-Length가 있으면 본문을 읽기 전에 거른다. 없으면(chunked) 읽은 뒤
  // 길이로 거른다 — 후자는 버퍼링 자체는 막지 못하는 한계가 있다.
  const contentLength = Number(request.headers.get('content-length') ?? '0')
  if (contentLength > 64_000) {
    return Response.json({ error: 'payload too large' }, { status: 413 })
  }
  const raw = await request.text()
  if (raw.length > 64_000) {
    return Response.json({ error: 'payload too large' }, { status: 413 })
  }

  let payload: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(raw)
    // JSON.parse('null')·배열·원시값은 성공하므로 여기서 걸러야 아래 필드 접근이
    // TypeError(=500)로 새지 않는다
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return Response.json({ error: 'invalid json' }, { status: 400 })
    }
    payload = parsed as Record<string, unknown>
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 })
  }

  const kind = typeof payload.kind === 'string' ? payload.kind : ''
  const issueId = typeof payload.issue_id === 'string' ? payload.issue_id : ''
  const firedAt = typeof payload.fired_at === 'string' ? payload.fired_at : ''
  const firedDate = firedAt ? new Date(firedAt) : null
  // fired_at은 필수다 — 멱등키와 ref 날짜를 결정하는 값이라, 없으면 재전송이
  // UTC 자정을 넘길 때 다른 ref가 생겨 멱등이 깨진다. PostHog 목적지 템플릿은
  // 우리가 정의하는 계약이므로(docs/ONCALL-ALERT.md) 요구해도 된다.
  // issue_id는 PostHog UUID다 — 형태를 강제해야 CI의 쿼리 조립·검색에 개행·특수문자가
  // 흘러들지 않는다 (다중행 문자열은 여기서 400으로 끊긴다)
  if (
    !KINDS.includes(kind) ||
    !/^[0-9a-fA-F-]{8,64}$/.test(issueId) ||
    !firedDate ||
    Number.isNaN(firedDate.getTime())
  ) {
    return Response.json(
      { error: 'kind(issue_created|issue_reopened|spike), issue_id(uuid), fired_at(ISO) required' },
      { status: 400 },
    )
  }

  // 같은 발화(firing)의 재전송은 같은 id·같은 날짜, 새 발화는 새 id —
  // 전부 fired_at에서 결정되므로 수신 시각과 무관하다. 해시 입력은 정규화된
  // ISO 문자열이다 — 같은 시각의 다른 표기(+00:00 등)가 다른 id가 되면 안 된다.
  const firedIso = firedDate.toISOString()
  const id = sha256(`${kind}|${issueId}|${firedIso}`).slice(0, 32)
  const day = firedIso.slice(0, 10).replaceAll('-', '')
  const refName = `refs/oncall/alerts/${day}-${id}`

  // ref는 기존 오브젝트를 가리켜야 하므로 main HEAD sha를 읽는다
  const headRes = await githubFetch(token, `/repos/${repo}/git/ref/heads/main`)
  if (!headRes.ok) {
    return Response.json({ error: 'github head lookup failed' }, { status: 502 })
  }
  const headSha = ((await headRes.json()) as { object: { sha: string } }).object.sha

  // 멱등 선삽입 — 원자적 create-once. 이미 있으면 같은 알림의 재전송이다.
  const refRes = await githubFetch(token, `/repos/${repo}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: refName, sha: headSha }),
  })
  if (refRes.status === 422) {
    // 422는 중복만이 아니다 — ruleset 거부·오브젝트 부재도 422다. 중복이 아닌
    // 422를 duplicate로 답하면 PostHog가 재전송을 멈춰 알림이 소리 없이 사라진다.
    const msg = String(
      ((await refRes.json().catch(() => ({}))) as { message?: string }).message ?? '',
    )
    if (/already exists/i.test(msg)) {
      return Response.json({ status: 'duplicate', id }, { status: 200 })
    }
    return Response.json({ error: 'idempotency insert failed' }, { status: 502 })
  }
  if (!refRes.ok) {
    return Response.json({ error: 'idempotency insert failed' }, { status: 502 })
  }

  // PostHog 목적지 템플릿은 숫자를 문자열로 치환하는 경우가 있다 — 둘 다 받는다
  const occRaw = payload.occurrences
  const occurrences =
    typeof occRaw === 'number' && Number.isFinite(occRaw)
      ? occRaw
      : typeof occRaw === 'string' && occRaw.trim() !== '' && Number.isFinite(Number(occRaw))
        ? Number(occRaw)
        : null

  // CI 위임 — 판정·분석은 oncall-alert.yml의 헤드리스 에이전트가 한다.
  // CI 에이전트가 읽게 될 자유 텍스트 필드는 전부 sanitize를 거친다 —
  // issue_name만 거르면 issue_url 등 다른 필드로 인젝션이 우회된다.
  // fetch 자체가 throw(네트워크 오류)해도 보상 삭제 분기에 도달해야 한다 —
  // 선삽입 ref가 남으면 이후 재전송이 전부 duplicate로 먹혀 알림이 영구 유실된다
  const dispatchRes = await githubFetch(token, `/repos/${repo}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({
      event_type: 'posthog-alert',
      client_payload: {
        id,
        kind,
        issue_id: issueId,
        issue_name: sanitize(payload.issue_name, 200),
        issue_url: sanitize(payload.issue_url, 300),
        fired_at: firedIso,
        occurrences,
        received_at: new Date().toISOString(),
      },
    }),
  }).catch(() => null)
  if (!dispatchRes || !dispatchRes.ok) {
    // 선삽입한 ref가 남으면 재전송이 영원히 duplicate로 먹혀 알림이 유실된다 — 보상 삭제
    const delRes = await githubFetch(
      token,
      `/repos/${repo}/git/refs/${refName.replace('refs/', '')}`,
      { method: 'DELETE' },
    ).catch(() => null)
    if (!delRes?.ok) {
      // 여기서 실패하면 이 발화는 재전송돼도 duplicate로 먹힌다 — 로그가 유일한 흔적
      console.error(`oncall: 보상 삭제 실패 ${refName} — 재전송이 duplicate로 먹힌다`)
    }
    return Response.json({ error: 'dispatch failed' }, { status: 502 })
  }

  return Response.json({ status: 'dispatched', id }, { status: 200 })
}
