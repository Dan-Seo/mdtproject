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

## 활성화에 필요한 수동 설정 (1회)

### 1. GitHub fine-grained PAT (핸들러용)

이 저장소 한정, **Contents: Read and write** 권한만. (ref 생성·삭제와
repository_dispatch에 필요.) 만든 토큰은 아래 Vercel env로만 들어간다.

### 2. Vercel 환경변수 (Production)

| 이름 | 값 |
|---|---|
| `ONCALL_WEBHOOK_SECRET` | 임의의 긴 랜덤 문자열 — PostHog 목적지 헤더와 동일해야 함 |
| `ONCALL_GITHUB_TOKEN` | 1의 PAT |
| `ONCALL_GITHUB_REPO` | `Dan-Seo/mdtproject` |

### 3. GitHub Actions secret (판정 에이전트용)

- `POSTHOG_API_KEY`: PostHog personal API key — **읽기 스코프만** (error tracking read,
  query read). 쓰기 스코프를 주지 않는다.
- `CLAUDE_CODE_OAUTH_TOKEN`: 기존 것 재사용 (이미 설정됨).

### 4. PostHog alert 목적지 2개

[error tracking 설정 → Alerting](https://us.posthog.com/project/552164/error_tracking/configuration)에서:

1. **Issue created or reopened** → HTTP Webhook
2. **Spike alert** → HTTP Webhook

공통 설정:
- URL: `https://<배포 도메인>/api/oncall/alert`
- 헤더: `x-oncall-secret: <ONCALL_WEBHOOK_SECRET 값>`
- Body(JSON) — 핸들러 계약. `kind`는 목적지에 맞게 `issue_created`/`issue_reopened`/`spike`:

```json
{
  "kind": "issue_created",
  "issue_id": "{issue.id}",
  "issue_name": "{issue.name}",
  "issue_url": "{issue.url}",
  "fired_at": "{event.timestamp}",
  "occurrences": null
}
```

템플릿 변수명은 PostHog 목적지 편집 화면의 변수 목록을 따를 것 — 핸들러가 요구하는
필수 필드는 `kind`·`issue_id` 두 개다 (`fired_at`은 멱등 정밀도용, 권장).
설정 후 **Test function**으로 200 `{"status":"dispatched"}`를 확인한다.

## 판정 기준 요약

노이즈(기록만): localhost·프리뷰 전용, 봇 UA 단발, 1회·1유저의 비핵심 경로.
신호(escalation): 새 이슈, 유저 ≥2, 급증, reopen 회귀, 핵심 경로(배근 계산 ·
Excel 내역서 · 플랜 입력 UI), 최근 커밋과 스택 겹침.
경계는 신호로 기울이되 확신도 '낮음' 명기. 상세 기준은 `.claude/skills/oncall-triage/SKILL.md`.
