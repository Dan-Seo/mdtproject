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

**출력 포맷은 고정이다** — 인라인 코멘트 4줄, 요약의 판정·집계 블록. 후속 게이트(실습 2)가 이 포맷을 입력으로 파싱한다.

전달된 인자: "$ARGUMENTS" — 숫자면 PR 번호(PR 모드), 비어 있으면 로컬 모드.

## 1단계 — 모드·범위 확정 (메인 에이전트)

**리뷰 대상 필터** (두 모드 공통): `src/**`, `tests/**`, `package.json`, `*.yaml`만 대상. `.claude/**`, `docs/**`, `package-lock.json`, 이미지·자산은 제외. 필터 후 대상이 0개면 "리뷰할 변경 없음(대상 파일 0개)"을 보고하고 종료한다 — Workflow를 호출하지 않는다.

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

차원: correctness — 변경으로 계산·동작이 틀리는가. 검사 항목:
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

차원: security — 변경으로 데이터가 새는가. 검사 항목:
1. 서버 전송 코드의 등장 자체가 무조건 critical: fetch, axios, XMLHttpRequest, WebSocket, sendBeacon, 외부 analytics·SDK. 이 앱은 클라이언트 온리이고 현재 네트워크 코드가 0건이다 — 신규 등장 = 즉시 finding
2. exceljs formula injection 경로 확장: 사용자 자유 텍스트가 셀 값으로 들어가는 새 경로(= + - @ 시작 값 무이스케이프)는 major. 기존 2개 경로(src/lib/export/index.ts 의 mark·notes)는 보고 금지
3. XSS: dangerouslySetInnerHTML, innerHTML 직접 대입, href 에 사용자 입력
4. eval·new Function 등 동적 코드 실행 도입 — 특히 룰팩 expr 필드 처리에 들어오면 critical
5. package.json 신규 dependency: 존재를 minor 로 보고 (필요성 판단은 취합 단계 몫)`,
  },
  {
    key: 'architecture',
    prompt: COMMON + `

차원: architecture — 프로젝트 규칙을 지켰는가.
먼저 CLAUDE.md, docs/ADR.md, docs/ARCHITECTURE.md 세 파일을 Read 하라. 검사 항목:
1. CLAUDE.md 의 CRITICAL·아키텍처 규칙 전부를 변경분에 대조하라. 단 서버 전송 금지 규칙은 security 차원 소관이므로 보고하지 마라
2. 오탐 예외: 단위 변환 상수(1000 등)·기하 계산 숫자·출처가 명기된 tests/golden 픽스처의 숫자는 규준 수치 리터럴 위반이 아니다
3. 레이어 방향: src/domain 이 src/lib·컴포넌트를 참조하는 변경, 신규 최상위 디렉토리 추가
4. TDD·골든테스트 — 존재 여부만 검사: 신규 domain 함수·규준 기능에 대응하는 co-located 테스트 또는 tests/golden 픽스처가 변경분에 없으면 보고. 골든 픽스처의 source(doc·page·quote) 누락도 보고. 테스트 품질 평가는 금지`,
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

Workflow 반환값으로 아래 순서의 마크다운을 출력한다 (전체 요약 → 인라인 상세). 포맷은 고정 — 후속 게이트의 파싱 입력이다.

**전체 요약** (판정 → 집계 → critical·major 나열 순)
- 판정: 🔴 critical ≥ 1 → **Blocked** / 🟠 major ≥ 1 → **Changes Requested** / 그 외(🟡·⚪만 또는 0건) → **Approve**. 실패 차원이 있으면 판정 옆에 "(일부 차원 미완료)" 단서
- 심각도 집계: `🔴 n · 🟠 n · 🟡 n · ⚪ n` + 리뷰 범위({PR #n "제목" | 워킹 트리 | main...HEAD}, 대상 파일 N개). `failedDimensions`가 있으면 `⚠ {차원} 리뷰 실패 — 결과 없음` 명시
- **critical·major만** `path:line — [심각도] 제목` 형식으로 나열한다. minor·nit는 집계 숫자로만 요약에 나타나고 상세는 아래 인라인에

**인라인 상세** — 파일별로 그룹, finding마다 본문 **4줄 고정**:
```
#### `path:line` · {차원들}
[{🔴|🟠|🟡|⚪} {severity}] {title}
TL;DR: {tldr}
✓ Good: {good}
→ Fix: {fix — 코드로}
```

**0건이면**: 판정 **Approve**와 "3개 차원 모두 지적 없음. 리뷰 범위 {scope}, 대상 파일 N개" 한 줄 — 범위 명기가 "안 봤음"과 "깨끗함"을 구분한다.

### PR 모드 추가 동작 (finding ≥ 1건일 때만)

1. 위 마크다운을 대화에 먼저 출력한다.
2. 저장한 diff의 훅크 헤더(@@)와 대조해 각 finding의 line이 훅크 범위 안인지 확인한다. 밖이면 comments에서 빼고 리뷰 body 하단 "diff 범위 밖 지적" 목록으로 옮긴다 (GitHub API 제약).
3. 스크래치패드에 payload.json 작성: `{ "commit_id": "<headRefOid>", "event": "COMMENT", "body": "<전체 요약(판정·집계·critical·major 나열 + diff 밖 지적)>", "comments": [{ "path", "line", "side": "RIGHT", "body": "<4줄 고정>" }] }`. 각 인라인 코멘트 body는 4줄 고정:
   `[{🔴|🟠|🟡|⚪} {severity}] {title}` / `TL;DR: {tldr}` / `✓ Good: {good}` / `→ Fix: {fix — 코드로}`
4. `event`는 항상 `COMMENT`다 — 판정(Approve/Changes Requested/Blocked)은 body 텍스트로 표기한다. GitHub는 본인 PR에 APPROVE·REQUEST_CHANGES 리뷰를 거부하므로 event에 판정을 싣지 않는다.
5. `gh api repos/{owner}/{repo}/pulls/<n>/reviews --input payload.json` — 1회 호출로 리뷰 하나에 인라인 코멘트 전부를 담는다. 실패 시 재시도하지 않고 오류를 보고한다.

## 실패 처리

- 차원 에이전트 실패는 재시도하지 않는다 — 나머지 차원으로 취합·판단을 진행하고 실패 사실을 요약에 남긴다. 사용자가 다시 돌리는 비용이 더 싸다.
- Workflow 자체가 실패하면 오류 내용을 보고하고 종료한다. 수동 폴백으로 서브에이전트를 직접 돌리지 않는다.
