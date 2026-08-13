# oncall prod alert 1차 방어선 — 구성과 활성화 절차

PostHog error tracking alert(단건·급증)가 사람을 깨우기 전에 한 번 걸러지는 경로다.

```
PostHog alert (issue created/reopened · spike)
  → HTTP Webhook: POST /api/oncall/alert        ← 서버리스 핸들러 (이 레포, Vercel)
      시크릿 검증 → 멱등 선삽입(GitHub ref) → repository_dispatch
  → oncall-alert.yml (CI)                        ← 판정은 여기서만
      dedup 프리체크 → PostHog 사실 수집(결정적) → /oncall-triage 에이전트 판정(무시크릿·무네트워크)
      → 게시(결정적): 노이즈면 job summary 기록만 · 신호면 GitHub Issue (라벨 oncall-alert)
```

- 서버리스는 `claude -p`를 못 띄우므로 핸들러는 검증·멱등·위임까지만 한다 (분석 금지).
- 멱등 저장소는 GitHub ref다: `refs/oncall/alerts/<YYYYMMDD>-<id>` 원자적 생성 =
  선삽입. 재전송은 422로 걸러지고, dispatch 실패 시 보상 삭제로 유실을 막는다.
  14일 지난 ref는 oncall-alert.yml의 cleanup 잡이 지운다.
- prod read-only: 판정 에이전트는 contents: read — 코드 수정·푸시 불가. 조치는
  이슈의 권장 액션까지이고, 실제 수정은 사람 또는 oncall CI 자동 수정(oncall.yml) 몫이다.
- 인젝션 격리: 에이전트가 읽는 issue_name은 방문자가 정할 수 있는 텍스트이므로,
  에이전트 스텝에는 시크릿 env·네트워크·gh가 없다. PostHog 조회는 결정적 스텝이
  선수행해 파일로 주고, 이슈 게시도 결정적 스텝이 scrub을 거쳐 수행한다. 핸들러도
  issue_name의 개행·백틱을 지우고 200자로 자른다.

## 구성 현황 (2026-08-13 활성화 완료)

수신 URL은 **프로덕션 별칭** `https://kijun-ten.vercel.app/api/oncall/alert`이다.
`kijun-<hash>-sf-i455.vercel.app` 같은 배포 URL은 Vercel Authentication이 걸려
401을 주므로 목적지에 쓰지 말 것 — 보호가 없는 것은 프로덕션 별칭뿐이다.

### 1. Vercel 환경변수 (Production) — 설정됨

| 이름 | 값 |
|---|---|
| `ONCALL_WEBHOOK_SECRET` | 랜덤 32바이트(base64url) — PostHog 목적지 헤더와 동일 |
| `ONCALL_GITHUB_TOKEN` | GitHub 토큰 (ref 생성·삭제 + repository_dispatch) |
| `ONCALL_GITHUB_REPO` | `Dan-Seo/mdtproject` |

env를 바꾼 뒤에는 **재배포해야 런타임이 집는다** — `vercel redeploy <배포URL> --scope sf-i455`.

> **미결(보안)**: 현재 `ONCALL_GITHUB_TOKEN`에는 `gh` CLI의 사용자 OAuth 토큰이
> 들어가 있다(`gist, read:org, repo, workflow`). 핸들러가 실제로 쓰는 권한은 이
> 저장소의 Contents R/W뿐이므로, 이 저장소 한정 **fine-grained PAT (Contents:
> Read and write)** 로 교체할 것. 교체는 `vercel env rm`/`add` 후 재배포면 끝난다.

### 2. GitHub Actions secret (판정 에이전트용)

- `CLAUDE_CODE_OAUTH_TOKEN`: 설정됨.
- `POSTHOG_API_KEY`: **미설정.** PostHog personal API key — **읽기 스코프만**
  (error tracking read, query read). 쓰기 스코프를 주지 않는다.
  발급 화면(`/settings/user-api-keys`)이 비밀번호 재인증 뒤에 있어 사람만 만들 수 있다.
  없어도 워크플로는 끝까지 가지만(사실 수집이 `|| printf 'null'`로 흡수된다)
  `issue`·`stats_7d`·`env_dist_7d`가 전부 null이 되어 **판정이 확신도 '낮음'으로
  떨어진다** — localhost 노이즈를 noise로 끊지 못하고 이슈로 승격시킨다.

### 3. PostHog alert 목적지 3개 — 생성됨

`error-tracking-alerts-create`로 만든 `internal_destination`(template-webhook).
PostHog alert은 발화 이벤트 1종당 1개라, 핸들러의 `kind` 3종에 1:1로 대응한다.

| 이름 | 발화 이벤트 | `kind` |
|---|---|---|
| oncall — issue created | `$error_tracking_issue_created` | `issue_created` |
| oncall — issue reopened | `$error_tracking_issue_reopened` | `issue_reopened` |
| oncall — issue spiking | `$error_tracking_issue_spiking` | `spike` |

공통 설정:
- URL: `https://kijun-ten.vercel.app/api/oncall/alert`, method `POST`
- 헤더: `Content-Type: application/json`, `x-oncall-secret: <ONCALL_WEBHOOK_SECRET 값>`
- Body(JSON) — 핸들러 계약:

```json
{
  "kind": "issue_created",
  "issue_id": "{event.distinct_id}",
  "issue_name": "{event.properties.name}",
  "issue_url": "{project.url}/error_tracking/{event.distinct_id}",
  "fired_at": "{event.timestamp}",
  "occurrences": null
}
```

`issue_id`는 `{issue.id}`가 아니라 **`{event.distinct_id}`** 다 — 라이프사이클
이벤트의 distinct_id가 곧 이슈 UUID이고, 핸들러의 `/^[0-9a-fA-F-]{8,64}$/`를 통과하는
것도 이쪽이다. spike 목적지만 `occurrences`에
`{event.properties.current_bucket_value}`를 싣는다(다른 둘은 그 속성이 없다).
필수 필드는 `kind`·`issue_id`·`fired_at` 셋이고, `fired_at`이 멱등키와 ref 날짜를
결정하므로 빠지면 400이다.

### 4. 관통 검증 (2026-08-13)

합성 예외 1건을 capture API로 넣어 전 구간을 확인했다:
예외 수신 → 이슈 생성 → 목적지 발화(에러 없이 완료 = 핸들러 2xx) →
`repository_dispatch` → `oncall-alert.yml` 실행. 재현하려면 고유한
`$exception_list[].type`으로 새 이슈를 만들면 된다 — 기존 이슈에 묶이면
`issue_created`가 발화하지 않는다.

## 판정 기준 요약

노이즈(기록만): localhost·프리뷰 전용, 봇 UA 단발, 1회·1유저의 비핵심 경로.
신호(escalation): 새 이슈, 유저 ≥2, 급증, reopen 회귀, 핵심 경로(배근 계산 ·
Excel 내역서 · 플랜 입력 UI), 최근 커밋과 스택 겹침.
경계는 신호로 기울이되 확신도 '낮음' 명기. 상세 기준은 `.claude/skills/oncall-triage/SKILL.md`.
