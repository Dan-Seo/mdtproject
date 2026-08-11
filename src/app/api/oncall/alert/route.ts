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

const GITHUB_API = 'https://api.github.com'

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

// 길이가 달라도 시간 차이가 새지 않도록 해시끼리 비교한다
function secretMatches(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

function githubHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'user-agent': 'kijun-oncall-alert',
    'content-type': 'application/json',
  }
}

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

  const raw = await request.text()
  if (raw.length > 64_000) {
    return Response.json({ error: 'payload too large' }, { status: 413 })
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 })
  }

  const kind = typeof payload.kind === 'string' ? payload.kind : ''
  const issueId = typeof payload.issue_id === 'string' ? payload.issue_id : ''
  if (!kind || !issueId) {
    return Response.json({ error: 'kind and issue_id required' }, { status: 400 })
  }
  const firedAt = typeof payload.fired_at === 'string' ? payload.fired_at : ''

  // 같은 발화(firing)의 재전송은 같은 id, 새 발화는 새 id.
  // fired_at이 없으면 본문 해시로 폴백 — 재전송은 여전히 같은 id로 잡힌다.
  const id = sha256(`${kind}|${issueId}|${firedAt || sha256(raw)}`).slice(0, 32)
  const day = new Date().toISOString().slice(0, 10).replaceAll('-', '')
  const refName = `refs/oncall/alerts/${day}-${id}`

  const headers = githubHeaders(token)

  // ref는 기존 오브젝트를 가리켜야 하므로 main HEAD sha를 읽는다
  const headRes = await fetch(`${GITHUB_API}/repos/${repo}/git/ref/heads/main`, {
    headers,
  })
  if (!headRes.ok) {
    return Response.json({ error: 'github head lookup failed' }, { status: 502 })
  }
  const headSha = ((await headRes.json()) as { object: { sha: string } }).object.sha

  // 멱등 선삽입 — 원자적 create-once. 이미 있으면 같은 알림의 재전송이다.
  const refRes = await fetch(`${GITHUB_API}/repos/${repo}/git/refs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ref: refName, sha: headSha }),
  })
  if (refRes.status === 422) {
    return Response.json({ status: 'duplicate', id }, { status: 200 })
  }
  if (!refRes.ok) {
    return Response.json({ error: 'idempotency insert failed' }, { status: 502 })
  }

  // CI 위임 — 판정·분석은 oncall-alert.yml의 헤드리스 에이전트가 한다
  const dispatchRes = await fetch(`${GITHUB_API}/repos/${repo}/dispatches`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      event_type: 'posthog-alert',
      client_payload: {
        id,
        kind,
        issue_id: issueId,
        issue_name: typeof payload.issue_name === 'string' ? payload.issue_name : '',
        issue_url: typeof payload.issue_url === 'string' ? payload.issue_url : '',
        fired_at: firedAt,
        occurrences: typeof payload.occurrences === 'number' ? payload.occurrences : null,
        received_at: new Date().toISOString(),
      },
    }),
  })
  if (!dispatchRes.ok) {
    // 선삽입한 ref가 남으면 재전송이 영원히 duplicate로 먹혀 알림이 유실된다 — 보상 삭제
    await fetch(
      `${GITHUB_API}/repos/${repo}/git/refs/${refName.replace('refs/', '')}`,
      { method: 'DELETE', headers },
    ).catch(() => undefined)
    return Response.json({ error: 'dispatch failed' }, { status: 502 })
  }

  return Response.json({ status: 'dispatched', id }, { status: 200 })
}
