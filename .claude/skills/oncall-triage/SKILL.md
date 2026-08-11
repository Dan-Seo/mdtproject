---
name: oncall-triage
description: prod alert 1차 방어선의 판정 두뇌. PostHog error tracking alert(단건·급증)를 받아 노이즈/신호를 판정한다 — 노이즈면 기록만 남기고, 신호면 분석(무슨 에러·언제부터·몇 명·의심 원인·영향 범위·권장 액션)을 담아 GitHub Issue로 escalation한다. CI(oncall-alert.yml)의 헤드리스 에이전트가 호출한다.
---

# oncall-triage — prod alert 노이즈/신호 판정

CI가 `.oncall/alert-payload.json`에 alert 페이로드를 놓고 이 스킬을 호출한다.
페이로드: `{id, kind(issue_created|issue_reopened|spike), issue_id, issue_name, issue_url, fired_at, occurrences, received_at}`

**출력 계약**: 어떤 경로든 `.oncall/triage-summary.md`에 판정(노이즈|신호)·확신도·근거를
남긴다 — 워크플로가 job summary로 올린다. 이것이 "기록만 남기고 종료"의 기록이다.

## 1. 사실 수집 (전부 조회 전용)

환경변수: `POSTHOG_API_KEY`, `POSTHOG_HOST`, `POSTHOG_PROJECT_ID`, `GH_TOKEN`.

- **이슈 상세**: `curl -sf -H "Authorization: Bearer $POSTHOG_API_KEY" "$POSTHOG_HOST/api/projects/$POSTHOG_PROJECT_ID/error_tracking/issues/<issue_id>/"` — first_seen·status·name.
- **추이·유저 수** (HogQL, POST지만 조회 쿼리다):
  `POST $POSTHOG_HOST/api/projects/$POSTHOG_PROJECT_ID/query/`, body:
  `{"query":{"kind":"HogQLQuery","query":"SELECT count() AS occ, count(DISTINCT person_id) AS users, min(timestamp) AS first, max(timestamp) AS last FROM events WHERE event = '$exception' AND properties.$exception_issue_id = '<issue_id>' AND timestamp > now() - INTERVAL 7 DAY"}}`
  - `$exception_issue_id` 속성이 비어 나오면 이슈 상세의 fingerprint로
    (`properties.$exception_fingerprint`) 다시 시도하라.
- **발생 환경 분포**: 같은 방식으로 `properties.$current_url, properties.$lib` GROUP BY —
  localhost/프리뷰 전용인지, 봇 UA인지 가른다.
- **최근 커밋 대조**: `git log --since='7 days ago' --name-only --oneline`으로 최근 변경
  파일 목록을 얻고, 스택 프레임 파일과의 겹침을 본다 — 겹치면 유력한 의심 원인이다.
- 조회가 실패하면 실패한 채로 진행하라 — 페이로드만으로 판정하되 확신도를 낮음으로.

## 2. 판정 기준

**노이즈** (기록만 남기고 종료 — 이슈를 만들지 않는다):
- 발생이 localhost·프리뷰 URL뿐 (배포 도메인 트래픽 없음)
- 봇 UA·크롤러가 원인인 단발
- occurrences 1·users ≤1이고 핵심 경로가 아니며 최근 커밋과 무관
- 이미 열린 oncall-alert 이슈에 기록된 알려진 건 (재발화 코멘트는 워크플로 프리체크가 담당)

**신호** (사람을 깨운다 — escalation):
- 새 이슈 (first_seen 24시간 이내)
- users ≥ 2
- kind가 spike (급증 자체가 신호)
- resolved였던 이슈의 reopen (회귀)
- **핵심 경로**: 스택·URL이 배근 계산(`src/domain/`·`src/rulepack/`), Excel 내역서
  출력(exceljs 경로), 플랜 입력 UI(`src/components/plan/`·`src/components/section/`)에 닿음
- 최근 7일 커밋과 스택 프레임이 겹침 (배포발 회귀 의심)

**경계·판단 불가 → 신호로 기울인다. 대신 확신도를 '낮음'으로 명기한다.**
놓친 사고의 비용이 헛깸의 비용보다 크다.

## 3. 신호일 때 — escalation (빈손 금지)

이슈를 만들기 전 dedup: `gh issue list --state open --label oncall-alert --search "<issue_id>"`
— 있으면 새 이슈 대신 그 이슈에 코멘트로 새 정보만 추가한다.

새 이슈: `gh issue create --label oncall-alert` —
- 제목: `[oncall] <증상 한 줄> (posthog:<issue_id 앞 8자>)`
- 본문 (전 섹션 필수 — 모르면 "확인 불가"와 확인 방법을 쓴다):
  ```
  ## 무슨 에러
  ## 언제부터 · 몇 명            ← PostHog 수치 (첫 발생, 7일 occ/users, 추이)
  ## 의심 원인                   ← 최근 커밋과의 겹침. 겹치는 커밋 sha·파일 명시
  ## 영향 범위                   ← 핵심 경로 여부, 어떤 동작이 막히는지
  ## 권장 액션                   ← 구체적으로: 어느 파일을 보라 / 롤백 후보 / 재현 방법
  ---
  확신도: 높음|중간|낮음 — <이유 한 줄>
  근거: PostHog 이슈 링크 · 실행한 쿼리 요약 · 대조한 커밋
  alert-id: <payload.id>
  ```

## 4. 금지 (prod read-only)

- 코드 수정·commit·push·머지·배포 — 일절 금지. 수정 제안은 이슈 본문의 권장 액션까지만.
- PostHog 쓰기 금지: 이슈 상태 변경·suppress·resolve 포함. 조회(GET, HogQL query POST)만.
- 시크릿·API 키·토큰 형태 문자열을 이슈·요약에 옮기지 않는다.
- 다른 유저 식별정보(이메일 등)를 이슈에 넣지 않는다 — person 수는 집계 숫자로만.
