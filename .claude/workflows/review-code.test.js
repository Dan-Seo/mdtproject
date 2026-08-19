// review-code.js 의 결정적 부분(취합·병합·재조정 적용·집계·판정·게이트 마커) 회귀 테스트.
//
// 왜 워크플로 스크립트에 테스트가 붙는가 — 이 파일은 더 이상 "런타임 전역에 의존하는 얇은
// 오케스트레이션 정의"가 아니다. 자동 승인·머지를 좌우하는 게이트 마커를 여기서 만든다.
// scripts/ci/review-verdict.sh 가 test_review_verdict.py 로 검증되는 것과 같은 이유다.
//
// 부수 효과가 하나 더 있다: agentic-eng-toolkit 플러그인의 TDD 훅은 co-located 테스트가
// 없는 .js 를 전역에서 차단하고, PreToolUse 훅은 하나라도 deny 하면 다른 훅의 allow 로
// 덮을 수 없다(실측 확인). 프로젝트 훅은 workflows/ 를 면제하지만 플러그인 훅은 모르므로,
// 두 정책을 모두 만족시키는 방법은 실제 테스트를 두는 것뿐이다. 앞으로 .claude/workflows/
// 에 스크립트를 추가할 때도 co-located 테스트를 같이 둘 것.
//
// 실행: node --test .claude/workflows/  (npm run test:ci-scripts 에 포함)
//
// 실제 배포되는 파일을 그대로 읽어 돌린다 — 로직을 테스트용으로 복사하면 드리프트가 나고,
// 드리프트가 난 쪽은 언제나 테스트가 아니라 게이트다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const SRC = readFileSync(new URL('./review-code.js', import.meta.url), 'utf8')
  .replace(/^export const meta/m, 'const meta')

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

// 워크플로 런타임이 주입하는 전역을 스텁으로 채워 실제 스크립트를 실행한다.
// parallel 은 실물과 같은 계약을 흉내낸다 — 스로우한 thunk 는 reject 가 아니라 null 이다.
async function runWorkflow({ byDimension, judge = () => ({ adjustments: [], unverifiable: [] }) }) {
  const calls = { judge: 0, dimensions: [] }
  const fn = new AsyncFunction('args', 'phase', 'parallel', 'agent', 'log', SRC)
  const result = await fn(
    { mode: 'pr', repoRoot: '/repo', scopeDir: '/repo/.review' },
    () => {},
    (thunks) => Promise.all(thunks.map((t) => Promise.resolve().then(t).catch(() => null))),
    async (prompt, opts) => {
      if (opts.label === 'judge') {
        calls.judge++
        return judge(prompt)
      }
      const key = opts.label.replace('review:', '')
      calls.dimensions.push(key)
      return byDimension[key]
    },
    () => {},
  )
  return { result, calls }
}

const finding = (over = {}) => ({
  file: 'src/domain/a.ts',
  line: 10,
  severity: 'minor',
  title: '제목',
  tldr: '왜 문제인지',
  good: '인정할 점',
  fix: 'const x = 1',
  evidence: 'const x = 0',
  ...over,
})

const none = { findings: [] }

test('0건이면 판정자를 부르지 않고 자동 머지 판정을 낸다', async () => {
  const { result, calls } = await runWorkflow({
    byDimension: { correctness: none, security: none, architecture: none },
  })
  assert.equal(calls.judge, 0, '지적이 없으면 판정자 호출은 순수 낭비다')
  assert.equal(result.findings.length, 0)
  assert.deepEqual(result.tally, { critical: 0, major: 0, minor: 0, nit: 0 })
  assert.equal(result.verdict, 'Approve — 자동 머지')
  assert.equal(
    result.marker,
    '<!-- review-code-gate: {"critical":0,"major":0,"minor":0,"nit":0,"failed_dimensions":0} -->',
  )
})

test('게이트 마커가 review-verdict.sh 의 정규식에 잡힌다', async () => {
  const { result } = await runWorkflow({
    byDimension: {
      correctness: { findings: [finding({ severity: 'critical' })] },
      security: none,
      architecture: none,
    },
  })
  // scripts/ci/review-verdict.sh 의 scan("<!-- review-code-gate: (\\{[^}]*\\}) -->")
  const m = result.marker.match(/<!-- review-code-gate: (\{[^}]*\}) -->/)
  assert.ok(m, `마커를 게이트가 못 읽는다: ${result.marker}`)
  const counts = JSON.parse(m[1])
  assert.deepEqual(counts, {
    critical: 1, major: 0, minor: 0, nit: 0, failed_dimensions: 0,
  })
  assert.equal(result.verdict, 'Blocked(승인·머지 없음)')
})

test('evidence 가 없는 finding 은 버린다', async () => {
  const { result } = await runWorkflow({
    byDimension: {
      correctness: {
        findings: [
          finding({ line: 10, evidence: '' }),
          finding({ line: 20, evidence: '   ' }),
          finding({ line: 30 }),
        ],
      },
      security: none,
      architecture: none,
    },
  })
  assert.deepEqual(result.findings.map((f) => f.line), [30], '인용 없는 지적은 검증 불가다')
})

test('같은 파일·같은 행을 두 차원이 지적하면 하나로 합치고 더 심한 쪽을 남긴다', async () => {
  const { result } = await runWorkflow({
    byDimension: {
      correctness: { findings: [finding({ line: 10, severity: 'minor', title: '가벼운 쪽' })] },
      security: { findings: [finding({ line: 10, severity: 'critical', title: '심한 쪽' })] },
      architecture: { findings: [finding({ line: 11, severity: 'nit', title: '인접 행' })] },
    },
  })
  assert.equal(result.findings.length, 2, '인접 행(10·11)은 별개 이슈다 — 삼키면 안 된다')
  const merged = result.findings.find((f) => f.line === 10)
  assert.equal(merged.severity, 'critical')
  assert.equal(merged.title, '심한 쪽')
  assert.deepEqual(merged.dimensions.sort(), ['correctness', 'security'])
})

test('판정자의 재조정이 집계·판정·코멘트에 모두 반영된다', async () => {
  const { result } = await runWorkflow({
    byDimension: {
      correctness: { findings: [finding({ severity: 'minor', title: '실은 심각한 것' })] },
      security: none,
      architecture: none,
    },
    judge: () => ({
      adjustments: [{ index: 0, severity: 'critical', reason: 'CRITICAL 위반이다' }],
      unverifiable: [],
    }),
  })
  assert.equal(result.findings[0].severity, 'critical')
  assert.deepEqual(result.tally, { critical: 1, major: 0, minor: 0, nit: 0 })
  assert.equal(result.verdict, 'Blocked(승인·머지 없음)')
  assert.match(result.findings[0].commentBody, /재조정 minor→critical/)
})

test('판정자가 준 이상한 재조정은 무시한다', async () => {
  const { result } = await runWorkflow({
    byDimension: {
      correctness: { findings: [finding({ severity: 'minor' })] },
      security: none,
      architecture: none,
    },
    judge: () => ({
      adjustments: [
        { index: 99, severity: 'critical', reason: '범위 밖 index' },
        { index: 0, severity: '치명적', reason: '없는 등급' },
        { index: 0, severity: 'minor', reason: '같은 등급' },
      ],
      unverifiable: [],
    }),
  })
  assert.equal(result.findings[0].severity, 'minor')
  assert.equal(result.findings[0].adjustedFrom, undefined, '바뀐 게 없으면 재조정 표기도 없어야 한다')
  assert.deepEqual(result.tally, { critical: 0, major: 0, minor: 1, nit: 0 })
})

test('근거 부실(unverifiable)은 표시만 하고 집계에서 빼지 않는다', async () => {
  // 여기서 빼면 근거가 약한 critical 이 게이트를 통과한다 — fail-closed 가 깨지는 지점이다.
  const { result } = await runWorkflow({
    byDimension: {
      correctness: { findings: [finding({ severity: 'critical' })] },
      security: none,
      architecture: none,
    },
    judge: () => ({ adjustments: [], unverifiable: [0] }),
  })
  assert.equal(result.findings[0].unverifiable, true)
  assert.deepEqual(result.tally, { critical: 1, major: 0, minor: 0, nit: 0 })
  assert.equal(result.verdict, 'Blocked(승인·머지 없음)')
  assert.match(result.findings[0].commentBody, /근거 부실/)
})

test('차원 하나가 죽으면 failedDimensions 로 새어 나가 게이트가 보류한다', async () => {
  const { result } = await runWorkflow({
    byDimension: { correctness: null, security: none, architecture: none },
  })
  assert.deepEqual(result.failedDimensions, ['correctness'])
  assert.match(result.verdict, /일부 차원 미완료/)
  assert.match(result.marker, /"failed_dimensions":1/)
})

test('판정자가 죽어도 리뷰는 살리되 게이트에는 미완료로 알린다', async () => {
  const { result } = await runWorkflow({
    byDimension: {
      correctness: { findings: [finding()] },
      security: none,
      architecture: none,
    },
    judge: () => null,
  })
  assert.deepEqual(result.failedDimensions, ['judge'])
  assert.equal(result.findings.length, 1, '판정자가 죽어도 지적 자체는 남아야 한다')
  assert.match(result.marker, /"failed_dimensions":1/)
})

test('인라인 코멘트는 4줄 고정 형식이다', async () => {
  const { result } = await runWorkflow({
    byDimension: {
      correctness: { findings: [finding({ severity: 'major' })] },
      security: none,
      architecture: none,
    },
  })
  const lines = result.findings[0].commentBody.split('\n')
  assert.equal(lines.length, 4)
  assert.equal(lines[0], '[🟠 major] 제목')
  assert.equal(lines[1], 'TL;DR: 왜 문제인지')
  assert.equal(lines[2], '✓ Good: 인정할 점')
  assert.equal(lines[3], '→ Fix: const x = 1')
})

test('판정 문구는 심각도 사다리를 그대로 따른다', async () => {
  const cases = [
    ['major', 'Changes Requested(승인·머지 없음)'],
    ['minor', 'Approve — 머지는 사람이'],
    ['nit', 'Approve — 자동 머지'],
  ]
  for (const [severity, expected] of cases) {
    const { result } = await runWorkflow({
      byDimension: {
        correctness: { findings: [finding({ severity })] },
        security: none,
        architecture: none,
      },
    })
    assert.equal(result.verdict, expected, `${severity} 의 판정이 게이트와 어긋난다`)
  }
})
