import assert from 'node:assert/strict'
import { test } from 'node:test'

import { headroom, measure, readBudgets, render } from './budget-report.mjs'

// 실물 lhr(run 32231942226)의 resource-summary 를 줄인 것이다. 형태를 지어내면
// CI 에서만 터지므로 실제 아티팩트에서 가져왔다.
const LHR = {
  audits: {
    'resource-summary': {
      details: {
        items: [
          { resourceType: 'total', requestCount: 15, transferSize: 428148 },
          { resourceType: 'script', requestCount: 9, transferSize: 314550 },
          { resourceType: 'font', requestCount: 2, transferSize: 89512 },
          { resourceType: 'image', requestCount: 0, transferSize: 0 },
        ],
      },
    },
  },
}

const ASSERTIONS = {
  'categories:accessibility': ['error', { minScore: 1 }],
  'resource-summary:script:size': ['error', { maxNumericValue: 315000 }],
  'resource-summary:script:count': ['error', { maxNumericValue: 10 }],
  'resource-summary:total:size': ['error', { maxNumericValue: 430000 }],
  // warn 은 러너 노이즈에 흔들리는 값이라 래칫 대상이 아니다
  'total-blocking-time': ['warn', { maxNumericValue: 20000 }],
}

test('예산은 error 로 걸린 resource-summary 만 읽는다', () => {
  const b = readBudgets(ASSERTIONS)
  assert.deepEqual(b, {
    'script:size': 315000,
    'script:count': 10,
    'total:size': 430000,
  })
})

test('warn 로 걸린 값은 래칫 대상이 아니다', () => {
  const b = readBudgets({ 'resource-summary:script:size': ['warn', { maxNumericValue: 1 }] })
  assert.deepEqual(b, {})
})

test('lhr 에서 바이트와 요청 수를 뽑는다', () => {
  const m = measure(LHR)
  assert.equal(m['script:size'], 314550)
  assert.equal(m['script:count'], 9)
  assert.equal(m['total:size'], 428148)
})

test('여유가 적은 순으로 정렬한다 — 가장 먼저 터질 것이 맨 위다', () => {
  const rows = headroom(measure(LHR), readBudgets(ASSERTIONS))
  assert.equal(rows[0].key, 'script:size')
  assert.equal(rows[0].left, 450)
  assert.ok(rows[0].pct < 0.002)
  assert.equal(rows.at(-1).key, 'script:count')
})

// 예산은 있는데 측정이 없으면 「통과」로 보이면 안 된다. lhci 가 감사를 건너뛰거나
// resourceType 이름이 바뀌면 조용히 무예산 상태가 되는데, 그게 가장 위험한 실패다.
test('측정값이 없으면 통과가 아니라 미측정으로 남는다', () => {
  const rows = headroom({}, { 'script:size': 315000 })
  assert.equal(rows[0].value, null)
  assert.equal(rows[0].left, null)
  assert.match(render(rows), /미측정/)
})

test('render 는 여유와 초과를 구분해 표시한다', () => {
  const out = render(headroom(measure(LHR), readBudgets(ASSERTIONS)))
  assert.match(out, /script:size/)
  assert.match(out, /314,550/)
  assert.match(out, /450/)
  const over = render(headroom({ 'script:size': 320000 }, { 'script:size': 315000 }))
  assert.match(over, /초과/)
})
