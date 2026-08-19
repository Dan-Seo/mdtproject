#!/usr/bin/env node
// lighthouse 예산까지 남은 여유를 낸다. 게이트가 아니라 계기판이다.
//
// lighthouserc.cjs 의 error 예산은 통과/실패만 말한다. 그래서 번들이 예산 코앞까지
// 자라도 CI 는 계속 초록이고, 아무도 모르는 채로 어느 날 갑자기 빨간불이 된다 —
// 그때는 이미 oncall 이 토큰을 쓴 뒤다. 실제로 2026-08-12 에 300,249 B 였던 script 가
// 314,550 B 로 자라 예산(315,000)까지 450 B(0.14%)만 남은 상태였는데, 그 4.8% 증가를
// 여섯 번의 초록불 동안 아무도 보지 못했다.
//
// 그래서 매 실행 여유를 적는다. 값이 아니라 **여유**를 보는 것이 요점이다.
//
// 대상은 error 로 걸린 resource-summary 뿐이다. 타이밍(performance·TBT·LCP)은 러너에
// GPU 가 없어 실행마다 수십 % 흔들리므로 추세로 읽을 수 없다 — lighthouserc.cjs 가
// 그것들을 warn 으로 둔 이유와 같다.
//
// 검증: budget-report.test.mjs

const KEY = /^resource-summary:([a-z-]+):(size|count)$/

/** lighthouserc 의 assertions 에서 래칫 대상 예산만 뽑는다 */
export function readBudgets(assertions) {
  const out = {}
  for (const [key, raw] of Object.entries(assertions ?? {})) {
    const m = KEY.exec(key)
    if (!m) continue
    const level = Array.isArray(raw) ? raw[0] : 'error'
    const opts = Array.isArray(raw) ? raw[1] : raw
    if (level !== 'error') continue
    if (typeof opts?.maxNumericValue !== 'number') continue
    out[`${m[1]}:${m[2]}`] = opts.maxNumericValue
  }
  return out
}

/** lhr 의 resource-summary 감사에서 실측치를 뽑는다 */
export function measure(lhr) {
  const items = lhr?.audits?.['resource-summary']?.details?.items ?? []
  const out = {}
  for (const item of items) {
    if (!item?.resourceType) continue
    out[`${item.resourceType}:size`] = item.transferSize
    out[`${item.resourceType}:count`] = item.requestCount
  }
  return out
}

/** 예산별 여유. 여유가 적은 것이 먼저 온다 — 다음에 터질 것이 맨 위다 */
export function headroom(measured, budgets) {
  return Object.entries(budgets)
    .map(([key, budget]) => {
      const value = typeof measured[key] === 'number' ? measured[key] : null
      const left = value === null ? null : budget - value
      return { key, value, budget, left, pct: left === null ? null : left / budget }
    })
    .sort((a, b) => (a.pct ?? -Infinity) - (b.pct ?? -Infinity))
}

const n = (v) => (v === null ? '—' : v.toLocaleString('en-US'))

export function render(rows) {
  const lines = [
    '| 지표 | 실측 | 예산 | 남은 여유 |',
    '| --- | ---: | ---: | ---: |',
  ]
  for (const r of rows) {
    let last
    if (r.value === null) last = '**미측정** — 예산은 있는데 값이 없다'
    else if (r.left < 0) last = `**초과 ${n(-r.left)}**`
    else last = `${n(r.left)} (${(r.pct * 100).toFixed(2)}%)`
    lines.push(`| \`${r.key}\` | ${n(r.value)} | ${n(r.budget)} | ${last} |`)
  }
  return lines.join('\n')
}

