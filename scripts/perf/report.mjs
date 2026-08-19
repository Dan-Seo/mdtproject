#!/usr/bin/env node
// budget-report 의 IO 래퍼. .lighthouseci 를 읽어 예산 여유를 잡 요약에 적는다.
//
// **실패시키지 않는다** — 실패 판정은 lighthouserc.cjs 의 error 예산 몫이다. 여기서
// 실패시키면 여유가 이미 0.14% 인 지금 main 이 즉시 붉어지고 oncall 이 헛돈다.
// 이 스크립트의 일은 판정이 아니라 **추세를 보이게 하는 것**이다.
//
// 사용: node scripts/perf/report.mjs [.lighthouseci 경로]
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import { headroom, measure, readBudgets, render } from './budget-report.mjs'

const WARN_PCT = 0.02

const dir = process.argv[2] ?? '.lighthouseci'
const require = createRequire(import.meta.url)
const rc = require(path.resolve('lighthouserc.cjs'))
const budgets = readBudgets(rc?.ci?.assert?.assertions)

function pickReport() {
  const manifest = path.join(dir, 'manifest.json')
  if (fs.existsSync(manifest)) {
    const entries = JSON.parse(fs.readFileSync(manifest, 'utf8'))
    const rep = entries.find((e) => e.isRepresentativeRun) ?? entries[0]
    // manifest 의 경로는 수집한 러너의 절대경로다 — 파일명만 떼어 이 디렉터리에서 찾는다
    if (rep?.jsonPath) {
      const local = path.join(dir, path.posix.basename(rep.jsonPath.split(path.win32.sep).pop()))
      if (fs.existsSync(local)) return local
    }
  }
  if (!fs.existsSync(dir)) return null
  const rest = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json') && f !== 'manifest.json' && !f.startsWith('assertion'))
  return rest.length ? path.join(dir, rest[0]) : null
}

const file = pickReport()
if (!file) {
  process.stdout.write(`::warning::lighthouse 리포트를 찾지 못했다 (${dir}) — 예산 여유를 낼 수 없다\n`)
  process.exit(0)
}

const rows = headroom(measure(JSON.parse(fs.readFileSync(file, 'utf8'))), budgets)
const body = [
  '## lighthouse 예산 여유',
  '',
  render(rows),
  '',
  `_출처: ${path.basename(file)} — 결정적 지표(전송 바이트·요청 수)만 낸다. 타이밍은 러너에 GPU 가 없어 실행마다 흔들리므로 추세로 못 읽는다._`,
].join('\n')

const summary = process.env.GITHUB_STEP_SUMMARY
if (summary) fs.appendFileSync(summary, body + '\n')
else process.stdout.write(body + '\n')

for (const r of rows) {
  if (r.value === null) process.stdout.write(`::warning::${r.key} 미측정 — 예산은 있는데 값이 없다\n`)
  else if (r.left < 0) process.stdout.write(`::warning::${r.key} 예산 초과 ${-r.left}\n`)
  else if (r.pct < WARN_PCT) {
    process.stdout.write(`::warning::${r.key} 여유 ${r.left} (${(r.pct * 100).toFixed(2)}%) — 곧 예산을 넘는다\n`)
  }
}
