// /review-code 의 실행부. 스킬 본문(.claude/commands/review-code.md)에 인라인돼 있던 것을
// 파일로 뺐다 — 인라인이면 (1) 스킬 로드 시 6.5k 자가 모든 턴에 상주하고 (2) 에이전트가
// 같은 6.5k 자를 Workflow 툴 입력으로 다시 출력한다 (PR #38 실측: script_len 6523).
//
// 취합·심각도 재조정·집계·판정·게이트 마커는 전부 이 아래가 만든다. 메인 에이전트는
// 렌더링과 게시만 한다 — 예전에는 메인이 소스를 다시 읽어 재조정했고, 그 8 턴이 컨텍스트
// 70~87k 상태에서 돌아 cache_read 923k 의 60% 를 먹었다 (PR #38 실측).
//
// args: { mode: "pr"|"local", repoRoot: "<절대경로>", scopeDir: "<review-scope.sh 출력 디렉터리>" }
//
// 결정적 부분(병합·재조정 적용·집계·판정·마커)의 회귀 테스트는 review-code.test.js 다.
// 자동 머지를 좌우하는 값을 여기서 만들므로 review-verdict.sh 와 같은 수준으로 검증한다.
export const meta = {
  name: 'review-code',
  description: 'correctness·security·architecture 3차원 병렬 코드 리뷰 + 심각도 재조정',
  phases: [
    { title: 'Review', detail: 'correctness·security·architecture 병렬' },
    { title: 'Judge', detail: '심각도 재조정 (findings JSON 만 본다)' },
  ],
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
          good: { type: 'string', description: '코멘트 3행: 이 변경에서 인정할 점 한 줄' },
          fix: { type: 'string', description: '코멘트 4행: 수정 제안 — 반드시 코드로 제시' },
          evidence: { type: 'string', description: '해당 라인의 실제 코드 1-2줄 인용 (판정 근거)' },
        },
      },
    },
  },
}

const JUDGE_SCHEMA = {
  type: 'object',
  required: ['adjustments', 'unverifiable'],
  properties: {
    adjustments: {
      type: 'array',
      description: '심각도가 바뀌는 finding 만. 안 바뀌면 넣지 마라',
      items: {
        type: 'object',
        required: ['index', 'severity', 'reason'],
        properties: {
          index: { type: 'integer', description: '입력 findings 배열의 index' },
          severity: { type: 'string', enum: ['critical', 'major', 'minor', 'nit'] },
          reason: { type: 'string', description: '재조정 근거 한 줄' },
        },
      },
    },
    unverifiable: {
      type: 'array',
      description: 'evidence 인용이 부실해 판정을 신뢰하기 어려운 finding 의 index',
      items: { type: 'integer' },
    },
  },
}

// args 가 JSON 문자열로 도착하는 경우가 있으므로 방어 파싱 필수
const A = typeof args === 'string' ? JSON.parse(args) : args
const SCOPE = A.scopeDir

const COMMON = `너는 읽기 전용 코드 리뷰 서브에이전트다. 파일을 수정하지 마라.
프로젝트 루트: ${A.repoRoot}

먼저 이 두 파일을 Read 하라 — 리뷰 범위는 이미 확정돼 있고 네가 다시 고르지 않는다:
- ${SCOPE}/scope.diff  — 리뷰 대상 diff 전문 (대상 밖 파일은 이미 걸러져 있다)
- ${SCOPE}/files.txt   — 리뷰 대상 파일 목록. 여기 없는 파일은 지적 금지
${A.mode === 'local' ? `- ${SCOPE}/untracked.txt — 신규 파일(diff 에 안 잡힌다). 있으면 전문을 Read 하라\n` : ''}
gh·git diff 를 다시 실행하지 마라 — 위 파일이 그 결과다. 판정에 맥락이 필요할 때만 소스를 Read/Grep 하라.

공통 규칙:
- diff 의 변경분과 신규 파일만 대상이다. 기존 코드의 이슈는 이번 변경이 같은 패턴을 확장할 때만 보고한다.
- 모든 finding 에 정확한 file·line(변경 후 기준)과 실제 코드 인용(evidence)이 필수다. Read 로 확인하지 않은 추측 금지.
  evidence 는 뒤이어 심각도를 재조정하는 판정자의 **유일한 근거**다 — 그 한 줄만 보고도 문제가 보이게 인용하라.
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
1. 아웃바운드 전송 경로: fetch, axios, XMLHttpRequest, WebSocket, sendBeacon, 외부 analytics·SDK. 이 앱은 클라이언트 온리라 이런 코드는 기본적으로 없어야 한다. 발견하면 docs/ADR.md 를 Grep 해 그 경로를 승인한 ADR 이 있는지 **먼저** 확인하라.
   - 승인 ADR 이 없으면 critical — 신규 아웃바운드 경로의 등장 자체가 finding 이다.
   - 승인 ADR 이 있으면 **경로의 존재 자체는 보고하지 마라**. 이미 내려진 결정이라 리뷰가 재심할 사안이 아니고, 매 회차 같은 지적이 다시 나면 그 PR 은 영원히 머지되지 못한다. 대신 그 ADR 이 정한 조건에서 코드가 벗어난 부분만 보고한다 — ADR 이 끄기로 한 수집 옵션이 켜져 있다, ADR 이 유일한 관문으로 정한 훅을 우회하는 전송 경로가 새로 생겼다, ADR 이 싣기로 한 범위 밖의 값이 페이로드에 들어간다 같은 것들이다.
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
먼저 CLAUDE.md 의 「아키텍처 규칙」 절을 Read 하라 (마일스톤 현황·열린 리스크 절은 판정에 쓰지 않는다). 결정 근거가 필요한 finding 에 한해 docs/ADR.md 에서 해당 ADR 만 Grep 으로 찾아 읽어라 — 전문을 통째로 읽지 마라. 검사 항목:
1. CLAUDE.md 의 CRITICAL·아키텍처 규칙 전부를 변경분에 대조하라. 단 서버 전송 금지 규칙은 security 차원 소관이므로 보고하지 마라
2. 오탐 예외: 단위 변환 상수(1000 등)·기하 계산 숫자·출처가 명기된 tests/golden 픽스처의 숫자는 규준 수치 리터럴 위반이 아니다
3. 레이어 방향: src/domain 이 src/lib·컴포넌트를 참조하는 변경, 신규 최상위 디렉토리 추가
4. TDD·골든테스트 — 존재 여부만 검사: 신규 domain 함수·규준 기능에 대응하는 co-located 테스트 또는 tests/golden 픽스처가 변경분에 없으면 보고. 골든 픽스처의 source(doc·page·quote) 누락도 보고. 테스트 품질 평가는 금지
5. CI 워크플로 변경: oncall.yml 의 무한루프 방지 구조(oncall 은 main 에 푸시하지 않고 oncall/* 브랜치만 쓴다, ci 는 main push 에만 반응한다, head_branch·포크 가드)나 review.yml 의 권한 분리(머지 권한을 LLM 잡이 아니라 gate 잡에 둔다)를 깨는 변경. 자동 게이트를 조용히 통과시키는 변경(실패해야 할 조건에 스킵 가드·continue-on-error 추가)도 보고 — 게이트가 한 번도 돌지 않아도 초록으로 보이게 된다`,
  },
]

phase('Review')
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
const bySeverityThenPosition = (a, b) => (SEV[a.severity] - SEV[b.severity])
  || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) || (a.line - b.line)
findings.sort(bySeverityThenPosition)

// ── 심각도 재조정 ────────────────────────────────────────────────────────
// 예전에는 메인 에이전트가 이 일을 하면서 소스를 다시 읽었다. 판정자를 여기로 내리면
// 컨텍스트가 findings JSON(수 KB)뿐이라 메인의 70~87k 짜리 턴이 통째로 사라진다.
// 대신 판정자는 소스를 못 본다 — 그래서 evidence 인용이 부실하면 심각도를 내리지 말고
// unverifiable 로 표시만 하게 하고, 집계에서는 **빼지 않는다** (게이트의 fail-closed 유지).
// 단 **상향도 적용하지 않는다** — 못 믿겠다고 표시한 인용을 근거로 등급을 올리는 것은
// 자기모순이고, 실제로 PR #6 에서 그 상향이 되먹임 루프의 시작점이었다.
phase('Judge')
let adjustments = []
let unverifiable = []
if (findings.length > 0) {
  const input = findings.map((f, i) => ({
    index: i, file: f.file, line: f.line, severity: f.severity,
    dimensions: f.dimensions, title: f.title, tldr: f.tldr, evidence: f.evidence,
  }))
  const judged = await agent(`너는 코드 리뷰 finding 의 심각도 판정자다.
**파일을 읽지 마라. Read·Grep·Bash 를 쓰지 마라.** 아래 JSON 만이 근거다 — 각 finding 의
evidence 는 리뷰어가 실제 소스에서 인용한 코드다.

심각도 기준 (이 프로젝트 고정):
- critical: 머지 불가. CLAUDE.md CRITICAL 위반(룰팩 수치를 .ts 에 하드코딩, 도면 데이터 서버 전송,
  src/domain 의 React·DOM import), 산정 결과 오류(mm↔m 변환 누락 등), 데이터 유출
- major: 특정 조건에서 결함. 할증률 범위 밖 기본값 반환, project 제자리 변이로 캐시 stale,
  formula injection 새 경로, 규준 기능의 골든 픽스처 부재, dispose 누락
- minor: 동작하지만 위험 소지·관례 이탈. 신규 의존성, 요청 없는 추상화, 경계 케이스 테스트 누락
- nit: 스타일·네이밍·주석

할 일:
1. 각 finding 의 severity 를 위 기준과 evidence 에 대조한다. **바뀌는 것만** adjustments 에 넣어라.
   안 바뀌면 넣지 마라 — 빈 배열이 정상이다.
2. dimensions 가 2개 이상이면 서로 다른 관점이 같은 행을 지적한 것이다. 상향을 검토하라.
3. evidence 가 인용으로서 부실해(코드가 아니라 서술이거나, 주장과 무관한 줄) 판정을 신뢰하기
   어려우면 그 index 를 unverifiable 에 넣어라. **낮추지도 올리지도 마라** — 낮추면 근거가
   약하다는 것을 문제가 없다는 뜻으로 바꿔버리고(이 게이트는 불확실하면 보류하는 쪽이다),
   올리면 못 믿겠다고 한 그 인용을 근거로 등급을 올리는 자기모순이 된다. unverifiable 로
   표시한 건에 대한 상향은 적용되지 않으니 넣지 마라 — 차원이 보고한 등급 그대로 간다.

findings:
${JSON.stringify(input, null, 1)}`, { label: 'judge', phase: 'Judge', schema: JUDGE_SCHEMA })

  if (judged) {
    adjustments = judged.adjustments || []
    unverifiable = judged.unverifiable || []
  } else {
    // 판정자 실패는 재시도하지 않는다. 다만 게이트가 그 사실을 알아야 하므로
    // failed_dimensions 로 새어 나가게 둔다 — review-verdict.sh 가 보류로 처리한다.
    failedDimensions.push('judge')
  }
}

const unverifiableIndexes = new Set(unverifiable)

for (const a of adjustments) {
  const f = findings[a.index]
  if (!f || !(a.severity in SEV) || a.severity === f.severity) continue
  // 근거 부실로 표시한 건은 올리지 않는다. 판정자는 소스를 못 읽고 evidence 인용만
  // 보는데, 그 인용을 스스로 못 믿겠다고 해놓고 등급을 올리는 것은 앞뒤가 안 맞는다
  // — 올릴 근거도 같은 인용뿐이기 때문이다. 내리는 것은 프롬프트가 이미 금지하므로
  // unverifiable 은 「조정 없음」으로 수렴하고 차원이 보고한 등급 그대로 간다.
  //
  // PR #6 에서 이 모순이 되먹임을 만들었다: 9차 리뷰의 minor→major (⚠근거 부실)가
  // 게이트를 막았고, 그걸 닫으려 넣은 코드가 10차 리뷰의 critical 2건을 낳았다.
  // 차원이 critical 로 본 것은 그대로 critical 이므로 fail-closed 는 유지된다.
  if (unverifiableIndexes.has(a.index) && SEV[a.severity] < SEV[f.severity]) continue
  f.adjustedFrom = f.severity
  f.severity = a.severity
  f.adjustReason = a.reason
}
for (const i of unverifiable) if (findings[i]) findings[i].unverifiable = true
findings.sort(bySeverityThenPosition)

// ── 집계·판정·게이트 마커 (전부 결정적) ──────────────────────────────────
const ICON = { critical: '🔴', major: '🟠', minor: '🟡', nit: '⚪' }
const tally = { critical: 0, major: 0, minor: 0, nit: 0 }
for (const f of findings) tally[f.severity]++

let verdict
if (tally.critical > 0) verdict = 'Blocked(승인·머지 없음)'
else if (tally.major > 0) verdict = 'Changes Requested(승인·머지 없음)'
else if (tally.minor > 0) verdict = 'Approve — 머지는 사람이'
else verdict = 'Approve — 자동 머지'
if (failedDimensions.length > 0) verdict += ' (일부 차원 미완료)'

// 이 한 줄이 scripts/ci/review-verdict.sh 의 유일한 입력이다. 형식을 바꾸지 말 것.
const marker = '<!-- review-code-gate: ' + JSON.stringify({
  critical: tally.critical, major: tally.major, minor: tally.minor, nit: tally.nit,
  failed_dimensions: failedDimensions.length,
}) + ' -->'

// 인라인 코멘트 4줄은 여기서 완성해 보낸다 — 메인이 다시 작문하면 그만큼 출력 토큰이다
for (const f of findings) {
  f.commentBody = [
    `[${ICON[f.severity]} ${f.severity}] ${f.title}`
      + (f.adjustedFrom ? ` (재조정 ${f.adjustedFrom}→${f.severity})` : '')
      + (f.unverifiable ? ' ⚠근거 부실' : ''),
    `TL;DR: ${f.tldr}`,
    `✓ Good: ${f.good}`,
    `→ Fix: ${f.fix}`,
  ].join('\n')
}

log(`finding ${findings.length}건 (${tally.critical}/${tally.major}/${tally.minor}/${tally.nit}), `
  + `재조정 ${adjustments.length}건, 근거부실 ${unverifiable.length}건, 실패 차원 ${failedDimensions.length}개`)

return { findings, tally, verdict, marker, failedDimensions }
