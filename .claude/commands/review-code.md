---
description: 변경 사항(또는 PR)을 correctness·security·architecture 3개 서브에이전트가 Workflow로 병렬 리뷰한다
argument-hint: [PR번호]
---

변경 사항을 3개 차원의 서브에이전트가 병렬 리뷰하고, 별도 판정자가 심각도를 재조정한다. 빌드·lint·테스트 실행과 문서 정합 검사는 `/review` 소관이므로 여기서 하지 않는다.

**너는 범위 확정 → 워크플로 실행 → 렌더링·게시만 한다.** 심각도 재조정·집계·판정·게이트 마커는 워크플로(`.claude/workflows/review-code.js`)가 결정적으로 만든다.

- 소스를 다시 읽어 finding 을 재검증하지 마라. 판정자가 이미 했고, 네 컨텍스트에서 그 일을 하면 턴마다 70~87k 를 다시 문다 (PR #38 실측: 그 8턴이 전체 cache_read 923k 의 60%였다).
- 집계 숫자·판정 문구·마커를 네가 계산하지 마라. 워크플로가 준 `tally`·`verdict`·`marker` 를 **그대로** 쓴다.
- 리뷰 대상 필터를 네가 판단하지 마라. `scripts/ci/review-scope.sh` 안에 있다.

전달된 인자: "$ARGUMENTS" — 숫자면 PR 번호(PR 모드), 비어 있으면 로컬 모드.

## 1단계 — 범위 확정

`.review/scope.diff` 와 `.review/files.txt` 가 **이미 있으면 이 단계를 통째로 건너뛴다** (CI 의 scope 잡이 준비해 둔 것이다).

없으면 만든다:

**PR 모드** (인자가 숫자 n)
```
gh pr view <n> --json title,headRefOid,url        # payload 의 commit_id 에 필요
gh pr diff <n> | bash scripts/ci/review-scope.sh .review
```

**로컬 모드** (인자 없음), 3단 폴백
1. `git status --porcelain` 에 내용이 있으면 → 범위는 워킹 트리:
   ```
   git diff HEAD | bash scripts/ci/review-scope.sh .review
   git ls-files -o --exclude-standard | bash scripts/ci/review-scope.sh --paths .review
   ```
2. 워킹 트리가 클린하면 → `git diff main...HEAD | bash scripts/ci/review-scope.sh .review`
3. 둘 다 `target=0` 이면 → "리뷰할 변경 없음. 직전 merge 를 리뷰하려면 feature 브랜치에서 실행하라" 를 보고하고 종료.

`target=0` 인데 `excluded` 가 있으면 "리뷰 대상 파일 0개 (제외: …)" 를 보고하고 종료한다 — 워크플로를 호출하지 않는다. `target` 이 30을 넘으면 "파일 N개 — 시간이 걸린다" 를 한 줄 고지하고 그대로 진행한다 (범위를 자르지 않는다).

## 2단계 — 워크플로 실행

```
Workflow({
  scriptPath: "<repoRoot>/.claude/workflows/review-code.js",
  args: { mode: "pr"|"local", repoRoot: "<절대경로>", scopeDir: "<repoRoot>/.review" }
})
```

**대기 규칙**: 백그라운드 task 로 시작되면 `TaskOutput` 으로 완료를 동기 대기해 반환값을 받은 뒤 3단계로 간다. 대기 없이 턴을 끝내면 — 특히 헤드리스 1턴 러너(CI)에서 — 프로세스가 종료돼 리뷰가 통째로 유실된다 (PR #8에서 5회 재현).

반환값: `{ findings, tally, verdict, marker, failedDimensions }`.
`findings[]` 각 항목에는 `file`·`line`·`severity`·`dimensions`·`commentBody`(인라인 4줄 완성본)가 들어 있다.

## 3단계 — 보고·게시

아래 순서로 마크다운을 출력한다. 포맷은 고정 — 후속 게이트의 파싱 입력이다.

**전체 요약**
- 판정: 반환된 `verdict` 를 그대로 쓴다.
- 집계: `🔴 {tally.critical} · 🟠 {tally.major} · 🟡 {tally.minor} · ⚪ {tally.nit}` + 리뷰 범위({PR #n "제목" | 워킹 트리 | main...HEAD}, 대상 파일 N개). `failedDimensions` 가 있으면 `⚠ {차원} 리뷰 실패 — 결과 없음` 을 명시한다.
- `.review/excluded.txt` 가 비어 있지 않으면 `리뷰 제외: <경로 목록>` 한 줄. "안 봤다"와 "봤는데 깨끗하다"를 읽는 사람이 구분할 수 있어야 한다.
- **critical·major만** `path:line — [심각도] 제목` 으로 나열한다. minor·nit 는 집계 숫자로만 요약에 나오고 상세는 인라인에.
- **마지막 줄에 반환된 `marker` 를 그대로** 붙인다. 이 한 줄이 자동 승인·머지 게이트(`scripts/ci/review-verdict.sh`)의 유일한 입력이다 — 숫자를 다시 세거나 형식을 바꾸지 마라.

**인라인 상세** — 파일별 그룹, finding 마다 `#### \`path:line\` · {dimensions}` 헤더 + `commentBody` 4줄 그대로.

**0건이면**: 판정과 "3개 차원 모두 지적 없음. 리뷰 범위 {scope}, 대상 파일 N개" 한 줄. 마커는 0건일 때도 반드시 붙인다.

### PR 모드 추가 동작

**finding 0건이어도 리뷰를 게시한다** — 게시하지 않으면 게이트가 "리뷰 안 돎"과 "깨끗함"을 구분하지 못해 보류로 처리한다. 0건이면 `comments` 를 빈 배열로 두고 body 만 보낸다.

1. 위 마크다운을 대화에 먼저 출력한다.
2. `.review/scope.diff` 의 훅크 헤더(`@@`)와 대조해 각 finding 의 line 이 훅크 범위 안인지 확인한다. 밖이면 `comments` 에서 빼고 body 하단 "diff 범위 밖 지적" 목록으로 옮긴다 (GitHub API 제약).
3. payload.json 작성: `{ "commit_id": "<headRefOid>", "event": "COMMENT", "body": "<전체 요약 + 마커>", "comments": [{ "path", "line", "side": "RIGHT", "body": "<commentBody 그대로>" }] }`
4. `event` 는 항상 `COMMENT` 다. 실제 승인·머지는 권한이 분리된 `gate` 잡이 마커를 읽고 수행하므로 이 스킬이 event 로 승인을 시도해서는 안 된다. GitHub 는 리뷰 작성자와 PR 작성자가 같으면 APPROVE·REQUEST_CHANGES 를 거부하는데, 이 스킬은 Claude 가 연 PR 에서도 돈다.
5. `gh api repos/{owner}/{repo}/pulls/<n>/reviews --input payload.json` — 1회 호출로 인라인 전부를 담는다.
6. 5가 실패하면(전형: 인라인 위치가 diff 와 어긋나 GitHub 가 리뷰 전체를 422로 거부) **인라인을 포기하고 body 만으로 1회 재게시한다** — `comments` 를 빈 배열로 바꾸고 탈락한 4줄 블록은 body 하단 "인라인 게시 실패 — 본문 병기" 로 옮긴다. body-only 로라도 마커는 반드시 도달시켜야 한다. 재게시마저 실패하면 그때 오류를 보고한다.

## 실패 처리

- 차원 에이전트·판정자 실패는 재시도하지 않는다 — 워크플로가 `failedDimensions` 에 담아 오고 게이트가 보류로 처리한다. 사용자가 다시 돌리는 비용이 더 싸다.
- Workflow 자체가 실패하면 오류를 보고하고 종료한다. 수동 폴백으로 서브에이전트를 직접 돌리지 않는다.
