---
description: 변경 사항(또는 PR)을 correctness·security·architecture 3개 서브에이전트가 Workflow로 병렬 리뷰한다
argument-hint: [PR번호]
---

변경 사항을 3개 차원의 서브에이전트로 병렬 리뷰하라. 빌드·lint·테스트 실행과 문서 정합 검사는 `/review` 소관이므로 여기서 하지 않는다.

## 심각도 정의 (모든 finding·코멘트·집계의 공통 기준)

| 심각도 | 기준 | 이 프로젝트의 구체 예 |
|--------|------|----------------------|
| 🔴 critical | 머지 불가 — CLAUDE.md CRITICAL 위반, 산정 결과 오류, 데이터 유출 | `.ts`의 규준 수치 리터럴(定着 40d 등), 도면 데이터 fetch 전송, `src/domain`의 React import, mm↔m 변환 누락 |
| 🟠 major | 특정 조건에서 결함 — 수정 후 머지 | 할증률 범위 밖 기본값 4% 반환, project 제자리 변이로 캐시 stale, formula injection 새 경로, 규준 기능의 골든 픽스처 부재, dispose 누락 |
| 🟡 minor | 동작하지만 위험 소지·관례 이탈 | 신규 의존성 추가, 요청 없는 추상화·유연성, 테스트는 있으나 경계 케이스 누락 |
| ⚪ nit | 스타일·표현 수준 권고 | 네이밍, 주석, 사소한 중복 |

**출력 포맷은 고정이다** — 인라인 코멘트 4줄, 요약의 판정·집계 블록. 자동 승인·머지 게이트가 요약 끝의 게이트 마커를 파싱하므로, 심각도 판정이 곧 머지 가능 여부다.

전달된 인자: "$ARGUMENTS" — 숫자면 PR 번호(PR 모드), 비어 있으면 로컬 모드.

## 1단계 — 모드·범위 확정 (메인 에이전트)

**리뷰 대상 필터** (두 모드 공통): `src/**`, `tests/**`, `evals/**`, `scripts/**`, `.github/workflows/**`, `package.json`, 루트 설정 파일(`*.config.{js,cjs,mjs,ts}`, `lighthouserc.*`, `tsconfig*.json`), `*.yaml`·`*.yml`이 대상. `.claude/**`, `docs/**`, `phases/**`, `CLAUDE.md`, `package-lock.json`, 이미지·자산은 제외. 필터 후 대상이 0개면 "리뷰할 변경 없음(대상 파일 0개)"을 보고하고 종료한다 — Workflow를 호출하지 않는다.

CI 워크플로·스크립트·설정 파일이 대상인 이유: 파이프라인을 깨거나 시크릿을 흘리거나 차단 게이트를 무력화하는 변경이 여기서 나오는데, 정작 이 파일들이 PR의 무게중심인 경우가 많다 (PR #12에서 워크플로 3개와 게이트 설정이 통째로 무리뷰로 지나갔다).

**제외된 변경 파일은 침묵하지 말고 밝힌다**: 변경 파일 중 필터 밖이 있으면 리뷰 body에 `리뷰 제외: <경로 목록>` 한 줄로 남긴다. "안 봤다"와 "봤는데 깨끗하다"를 읽는 사람이 구분할 수 있어야 한다.

**PR 모드** (인자가 숫자 n):
1. `gh pr view <n> --json title,baseRefName,headRefOid,url,files` 로 메타를 얻는다 (gh 기본 해석 리포 사용).
2. `gh pr diff <n>` 출력을 스크래치패드에 `pr-<n>.diff`로 저장한다 — 서브에이전트 3개가 gh를 각자 호출하지 않게 1회만 fetch.
3. files의 path에 필터를 적용해 대상 목록을 만든다. untracked는 빈 배열.

**로컬 모드** (인자 없음), 3단 폴백:
1. `git status --porcelain` 출력이 있으면 → 범위 = 워킹 트리. `git diff HEAD`를 스크래치패드 `local.diff`로 저장하고, untracked 파일 중 필터 통과분을 신규 파일 목록으로 수집한다 (신규 파일은 diff에 안 잡히지만 고위험 위반의 주 경로다).
2. 워킹 트리가 클린하면 → `git diff main...HEAD`. 비어있지 않으면 그 범위를 `local.diff`로 저장.
3. 둘 다 비면 → "리뷰할 변경 없음. 직전 merge 내용을 리뷰하려면 feature 브랜치에서 실행하라"를 보고하고 종료.

대상 파일이 30개를 넘으면 시작 전에 "파일 N개 — 시간이 걸린다"를 한 줄 고지하고 그대로 진행한다 (범위를 자르지 않는다).

## 2단계 — Workflow 실행

아래 스크립트를 Workflow 툴로 실행한다. `args`로 넘길 것:
`{ mode: "pr"|"local", repoRoot: "<절대경로>", diffPath: "<스크래치패드 diff 절대경로>", files: [필터 후 전체 대상(신규 포함)], untracked: [그중 신규 파일] }`

**대기 규칙**: Workflow가 백그라운드 task로 시작되는 환경에서는 TaskOutput으로 완료를 동기 대기해 반환값을 받은 뒤 3단계로 진행하라. 대기 없이 턴을 끝내면 — 특히 헤드리스 1턴 러너(CI)에서 — 프로세스가 종료돼 리뷰가 통째로 유실된다 (PR #8에서 5회 재현).

**diff 저장 폴백**: 셸 리다이렉션이 차단된 환경이면 diff 파일 저장을 생략하고, `diffPath` 대신 서브에이전트 프롬프트에 「`git diff <baseOid>...HEAD` 를 직접 읽어라」를 넘겨라 — gh 재호출 억제가 목적이므로 git 직접 읽기는 무방하다.

```js
export const meta = {
  name: 'review-code',
  description: 'correctness·security·architecture 3차원 병렬 코드 리뷰',
  phases: [{ title: 'Review', detail: 'correctness·security·architecture 병렬' }],
}

const FINDINGS_SCHEMA = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'line', 'severity', 'title', 'tldr', 'good', 'fix', 'evidence'],
        properties: {
          file: { type: 'string', description: '리포 루트 기준 상대 경로' },
          line: { type: 'integer', description: '변경 후 파일 기준 라인 번호' },
          severity: { type: 'string', enum: ['critical', 'major', 'minor', 'nit'] },
          title: { type: 'string', description: '코멘트 1행: 문제를 요약한 제목' },
          tldr: { type: 'string', description: '코멘트 2행: 왜 문제인지 한 문장' },
          good: { type: 'string', description: '코멘트 3행: 이 변경에서 인정할 점 한 줄 (의도·부분적으로 올바른 접근)' },
          fix: { type: 'string', description: '코멘트 4행: 수정 제안 — 반드시 코드로 제시' },
          evidence: { type: 'string', description: '해당 라인의 실제 코드 1-2줄 인용 (검증용 — 코멘트에는 미출력)' },
        },
      },
    },
  },
}

// args가 JSON 문자열로 도착하는 경우가 있으므로 방어 파싱 필수
const A = typeof args === 'string' ? JSON.parse(args) : args

const COMMON = `너는 읽기 전용 코드 리뷰 서브에이전트다. 파일을 수정하지 마라.
프로젝트 루트: ${A.repoRoot}
diff 전문: ${A.diffPath} 를 Read로 읽어라. 판정에 맥락이 필요하면 소스 파일을 직접 Read/Grep 하라.
리뷰 대상 파일(이 외의 파일은 지적 금지): ${A.files.join(', ')}
신규 파일(diff에 없으므로 전문을 Read 하라): ${(A.untracked || []).join(', ') || '없음'}

공통 규칙:
- diff의 변경분과 신규 파일만 대상이다. 기존 코드의 이슈는 이번 변경이 같은 패턴을 확장할 때만 보고한다.
- 모든 finding에 정확한 file·line(변경 후 기준)과 실제 코드 인용(evidence)이 필수다. Read로 확인하지 않은 추측 금지.
- 확신이 없으면 반환하지 마라. 0건이 정상 결과다. 최대 10건, 심각도 높은 순.
- severity 4단계: critical = CLAUDE.md CRITICAL 위반·산정 결과 오류·데이터 유출 / major = 특정 조건에서 결함(경계값·캐시 무효화·인젝션 경로·골든 픽스처 부재) / minor = 동작하나 위험 소지·관례 이탈 / nit = 스타일 권고.
- fix 는 반드시 코드로 제시하라 (한 줄 스니펫 가능). good 에는 이 변경에서 인정할 점을 한 줄 쓴다.
- 대상이 30개 파일을 넘으면 src/rulepack → src/domain → src/lib → 컴포넌트 순으로 우선 읽어라.`

const DIMENSIONS = [
  {
    key: 'correctness',
    prompt: COMMON + `

차원: correctness — 너는 계산·동작의 버그만 본다. 아래 검사 항목 밖의 이슈(규칙 위반·데이터 유출 등)는 발견해도 보고하지 마라 — 다른 차원 에이전트의 소관이다. 검사 항목:
1. 단위 혼동: mm↔m 변환(1000 나누기) 누락·중복, kg/m 단가와 길이 단위 불일치
2. 경계값: 할증률 범위 밖 입력에 기본값 4% 반환(throw 해야 함 — ADR-014), 미지원 케이스에 조용한 기본값 반환, off-by-one, 0 나눗셈, 빈 배열
3. zustand 변이: set() 밖 상태 변이, project 내부를 제자리 mutate 한 뒤 같은 참조로 set — src/lib/hooks/useTakeoff.ts 의 1-entry 캐시가 project 참조 동일성을 키로 쓰므로 제자리 변이는 화면 stale 로 직결된다
4. 룰팩 로더 불변식 약화: confidence 가 stated|inferred 외 값을 허용하게 되거나, stated 인데 source.page 필수 검증이 빠지는 변경
5. React: useMemo/useEffect 의존성 누락, 새로 추가된 캐시·메모의 무효화 조건 결함
6. Project 직렬화 파괴: Date·클래스 인스턴스·함수를 Project 에 넣는 변경 (순수 JSON 이어야 함)
7. three.js: geometry/material 생성 후 dispose 경로 누락(Viewer3D.tsx 의 기존 정리 패턴 준수), InstancedMesh count·인스턴스 인덱스 불일치`,
  },
  {
    key: 'security',
    prompt: COMMON + `

차원: security — 너는 데이터가 새는 경로만 본다. 아래 검사 항목 밖의 이슈(계산 버그·규칙 위반 등)는 발견해도 보고하지 마라 — 다른 차원 에이전트의 소관이다. 검사 항목:
1. 서버 전송 코드의 등장 자체가 무조건 critical: fetch, axios, XMLHttpRequest, WebSocket, sendBeacon, 외부 analytics·SDK. 이 앱은 클라이언트 온리이고 현재 네트워크 코드가 0건이다 — 신규 등장 = 즉시 finding
2. exceljs formula injection 경로 확장: 사용자 자유 텍스트가 셀 값으로 들어가는 새 경로(= + - @ 시작 값 무이스케이프)는 major. 기존 2개 경로(src/lib/export/index.ts 의 mark·notes)는 보고 금지
3. XSS: dangerouslySetInnerHTML, innerHTML 직접 대입, href 에 사용자 입력
4. eval·new Function 등 동적 코드 실행 도입 — 특히 룰팩 expr 필드 처리에 들어오면 critical
5. package.json 신규 dependency: 존재를 minor 로 보고 (필요성 판단은 취합 단계 몫)
6. CI 워크플로·스크립트(.github/workflows/**, scripts/**): 시크릿이 로그·PR 본문·아티팩트·이슈로 새는 경로(scripts/ci/scrub-secrets.sh 를 우회하는 신규 출력 경로 포함), pull_request_target 도입, 필요 이상의 permissions(특히 LLM 실행 잡에 contents: write), 락파일 밖 원격 코드로 차단 게이트를 좌우하는 구성(npx --yes <pkg>, curl | bash) — 마지막 항목은 버전을 고정했더라도 무결성 해시가 없으므로 보고한다
7. 리포트·아티팩트의 외부 공개 설정: Lighthouse 의 upload.target=temporary-public-storage 처럼 산출물을 외부 호스트로 올리는 구성`,
  },
  {
    key: 'architecture',
    prompt: COMMON + `

차원: architecture — 너는 프로젝트 규칙·구조 위반만 본다. 아래 검사 항목 밖의 이슈(계산 버그·데이터 유출 등)는 발견해도 보고하지 마라 — 다른 차원 에이전트의 소관이다.
먼저 CLAUDE.md, docs/ADR.md, docs/ARCHITECTURE.md 세 파일을 Read 하라. 검사 항목:
1. CLAUDE.md 의 CRITICAL·아키텍처 규칙 전부를 변경분에 대조하라. 단 서버 전송 금지 규칙은 security 차원 소관이므로 보고하지 마라
2. 오탐 예외: 단위 변환 상수(1000 등)·기하 계산 숫자·출처가 명기된 tests/golden 픽스처의 숫자는 규준 수치 리터럴 위반이 아니다
3. 레이어 방향: src/domain 이 src/lib·컴포넌트를 참조하는 변경, 신규 최상위 디렉토리 추가
4. TDD·골든테스트 — 존재 여부만 검사: 신규 domain 함수·규준 기능에 대응하는 co-located 테스트 또는 tests/golden 픽스처가 변경분에 없으면 보고. 골든 픽스처의 source(doc·page·quote) 누락도 보고. 테스트 품질 평가는 금지
5. CI 워크플로 변경: oncall.yml 의 무한루프 방지 구조(oncall 은 main 에 푸시하지 않고 oncall/* 브랜치만 쓴다, ci 는 main push 에만 반응한다, head_branch·포크 가드)나 review.yml 의 권한 분리(머지 권한을 LLM 잡이 아니라 gate 잡에 둔다)를 깨는 변경. 자동 게이트를 조용히 통과시키는 변경(실패해야 할 조건에 스킵 가드·continue-on-error 추가)도 보고 — 게이트가 한 번도 돌지 않아도 초록으로 보이게 된다`,
  },
]

const results = await parallel(DIMENSIONS.map(d => () =>
  agent(d.prompt, { label: 'review:' + d.key, phase: 'Review', schema: FINDINGS_SCHEMA })))

const failedDimensions = []
const raw = []
for (let i = 0; i < DIMENSIONS.length; i++) {
  if (!results[i]) { failedDimensions.push(DIMENSIONS[i].key); continue }
  for (const f of results[i].findings) raw.push({ ...f, dimension: DIMENSIONS[i].key })
}

const SEV = { critical: 0, major: 1, minor: 2, nit: 3 }
const valid = raw.filter(f => f.file && f.line > 0 && f.evidence && f.evidence.trim().length > 0)

const byFile = {}
for (const f of valid) {
  if (!byFile[f.file]) byFile[f.file] = []
  byFile[f.file].push(f)
}
const findings = []
for (const file of Object.keys(byFile).sort()) {
  const items = byFile[file].sort((a, b) => a.line - b.line)
  let cur = null
  for (const f of items) {
    // 병합은 정확히 같은 행만 — 인접 행은 별개 이슈일 수 있다 (병합 창을 넓히면 삼켜진다)
    if (cur && f.line === cur.line) {
      if (cur.dimensions.indexOf(f.dimension) < 0) cur.dimensions.push(f.dimension)
      if (SEV[f.severity] < SEV[cur.severity]) {
        cur.severity = f.severity; cur.title = f.title; cur.tldr = f.tldr
        cur.good = f.good; cur.fix = f.fix; cur.evidence = f.evidence
      }
    } else {
      cur = { file: f.file, line: f.line, severity: f.severity, title: f.title, tldr: f.tldr,
              good: f.good, fix: f.fix, evidence: f.evidence, dimensions: [f.dimension] }
      findings.push(cur)
    }
  }
}
findings.sort((a, b) => (SEV[a.severity] - SEV[b.severity])
  || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) || (a.line - b.line))

log('finding ' + findings.length + '건, 실패 차원 ' + failedDimensions.length + '개')
return { findings, failedDimensions }
```

## 3단계 — 보고 (메인 에이전트)

**심각도 재조정 (출력 전 필수)**: 각 finding의 severity를 맨 위 심각도 정의표와 대조해 재검토한다 — 서브에이전트의 판정을 그대로 믿지 않는다. 같은 행을 2개 이상 차원이 지적했으면(dimensions 복수) 상향을 검토한다. 조정한 finding은 인라인 상세 1행에 `(재조정 {이전}→{이후})`를 병기한다.

재조정을 마친 findings로 아래 순서의 마크다운을 출력한다 (전체 요약 → 인라인 상세). 포맷은 고정 — 후속 게이트의 파싱 입력이다.

**전체 요약** (판정 → 집계 → critical·major 나열 순)
- 판정 — 게이트 동작과 1:1로 대응하므로 어휘를 바꾸지 말 것:
  🔴 critical ≥ 1 → **Blocked**(승인·머지 없음) / 🟠 major ≥ 1 → **Changes Requested**(승인·머지 없음) / 🟡 minor ≥ 1 → **Approve — 머지는 사람이** / 그 외(⚪만 또는 0건) → **Approve — 자동 머지**.
  실패 차원이 있으면 판정 옆에 "(일부 차원 미완료)" 단서를 붙인다 — 이때 게이트는 판정과 무관하게 보류한다
- 심각도 집계: `🔴 n · 🟠 n · 🟡 n · ⚪ n` + 리뷰 범위({PR #n "제목" | 워킹 트리 | main...HEAD}, 대상 파일 N개). `failedDimensions`가 있으면 `⚠ {차원} 리뷰 실패 — 결과 없음` 명시
- **critical·major만** `path:line — [심각도] 제목` 형식으로 나열한다. minor·nit는 집계 숫자로만 요약에 나타나고 상세는 아래 인라인에
- **마지막 줄에 게이트 마커**를 넣는다 (재조정 후 집계 기준, 필드 5개 전부 필수):
  `<!-- review-code-gate: {"critical":n,"major":n,"minor":n,"nit":n,"failed_dimensions":n} -->`
  `failed_dimensions`는 `failedDimensions` 배열의 길이다. 이 한 줄이 자동 승인·머지 게이트(`scripts/ci/review-verdict.sh`)의 유일한 입력이므로 형식을 바꾸지 말 것 — 누락되면 게이트는 보류로 처리한다

**인라인 상세** — 파일별로 그룹, finding마다 본문 **4줄 고정**:
```
#### `path:line` · {차원들}
[{🔴|🟠|🟡|⚪} {severity}] {title}
TL;DR: {tldr}
✓ Good: {good}
→ Fix: {fix — 코드로}
```

**0건이면**: 판정 **Approve**와 "3개 차원 모두 지적 없음. 리뷰 범위 {scope}, 대상 파일 N개" 한 줄 — 범위 명기가 "안 봤음"과 "깨끗함"을 구분한다. 게이트 마커는 0건일 때도 반드시 붙인다.

### PR 모드 추가 동작

**finding 0건이어도 리뷰를 게시한다** — 게시하지 않으면 후속 게이트가 "리뷰 안 돎"과 "깨끗함"을 구분하지 못해 보류로 처리한다. 0건일 때는 `comments`를 빈 배열로 두고 body만 보낸다.

1. 위 마크다운을 대화에 먼저 출력한다.
2. 저장한 diff의 훅크 헤더(@@)와 대조해 각 finding의 line이 훅크 범위 안인지 확인한다. 밖이면 comments에서 빼고 리뷰 body 하단 "diff 범위 밖 지적" 목록으로 옮긴다 (GitHub API 제약).
3. 스크래치패드에 payload.json 작성: `{ "commit_id": "<headRefOid>", "event": "COMMENT", "body": "<전체 요약(판정·집계·critical·major 나열 + diff 밖 지적 + 게이트 마커)>", "comments": [{ "path", "line", "side": "RIGHT", "body": "<4줄 고정>" }] }`. 각 인라인 코멘트 body는 4줄 고정:
   `[{🔴|🟠|🟡|⚪} {severity}] {title}` / `TL;DR: {tldr}` / `✓ Good: {good}` / `→ Fix: {fix — 코드로}`
4. `event`는 항상 `COMMENT`다 — 판정은 body 텍스트와 게이트 마커로만 표기한다. 실제 승인·머지는 리뷰 잡과 분리된 `gate` 잡이 마커를 읽고 수행하므로(리뷰 잡에는 머지 권한이 없다), 이 스킬이 event로 승인을 시도해서는 안 된다. GitHub는 리뷰 작성자와 PR 작성자가 같으면 APPROVE·REQUEST_CHANGES를 거부하는데, 이 스킬은 Claude가 연 PR에서도 돌기 때문이다.
5. `gh api repos/{owner}/{repo}/pulls/<n>/reviews --input payload.json` — 1회 호출로 리뷰 하나에 인라인 코멘트 전부를 담는다.
6. 5가 실패하면(전형: 인라인 코멘트 위치가 diff와 어긋나 GitHub가 리뷰 전체를 422로 거부) **인라인을 포기하고 body만으로 1회 재게시한다** — `comments`를 빈 배열로 바꾸고, 탈락한 인라인 상세(4줄 블록)는 body 하단 "인라인 게시 실패 — 본문 병기" 섹션으로 옮긴다. 리뷰가 아예 게시되지 않으면 게이트가 "리뷰 안 돎" 보류가 되어 판정 자체가 유실된다 — body-only로라도 게이트 마커는 반드시 도달시켜야 한다. 재게시마저 실패하면 그때 오류를 보고한다.

## 실패 처리

- 차원 에이전트 실패는 재시도하지 않는다 — 나머지 차원으로 취합·판단을 진행하고 실패 사실을 요약에 남긴다. 사용자가 다시 돌리는 비용이 더 싸다.
- Workflow 자체가 실패하면 오류 내용을 보고하고 종료한다. 수동 폴백으로 서브에이전트를 직접 돌리지 않는다.
