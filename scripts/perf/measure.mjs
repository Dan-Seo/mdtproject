#!/usr/bin/env node
// 성능 측정 하네스 — 이 파일은 최적화 루프가 편집하지 않는다.
// (karpathy/autoresearch의 prepare.py 대응: 고정된 평가 기준)
//
// build → next start → Lighthouse(desktop) N회 → 중앙값 → journal.jsonl 추가
//
// 사용: node scripts/perf/measure.mjs --label <이름> [--runs 3] [--port 4321] [--no-build]

import { execFileSync } from 'node:child_process'
import { appendFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import * as chromeLauncher from 'chrome-launcher'
import lighthouse from 'lighthouse'
import desktopConfig from 'lighthouse/core/config/desktop-config.js'

import { startServer } from './server.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const JOURNAL = join(ROOT, 'scripts', 'perf', 'journal.jsonl')

const METRIC_AUDITS = {
  fcp: 'first-contentful-paint',
  lcp: 'largest-contentful-paint',
  tbt: 'total-blocking-time',
  cls: 'cumulative-layout-shift',
  si: 'speed-index',
}

function parseArgs(argv) {
  const args = { label: 'unlabeled', runs: 3, port: 4321, build: true, preset: 'desktop' }
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    if (flag === '--label') args.label = argv[++i]
    else if (flag === '--runs') args.runs = Number(argv[++i])
    else if (flag === '--port') args.port = Number(argv[++i])
    else if (flag === '--no-build') args.build = false
    else if (flag === '--preset') args.preset = argv[++i]
    else throw new Error(`알 수 없는 인자: ${flag}`)
  }
  if (args.preset !== 'desktop' && args.preset !== 'mobile') {
    throw new Error(`--preset은 desktop 또는 mobile이어야 한다: ${args.preset}`)
  }
  return args
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function gitSha() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT })
      .toString()
      .trim()
  } catch {
    return null
  }
}

function gitDirty() {
  try {
    return execFileSync('git', ['status', '--porcelain'], { cwd: ROOT }).toString().trim() !== ''
  } catch {
    return null
  }
}

// 번들 크기는 노이즈가 0인 보조 지표다. Lighthouse 점수가 노이즈에 묻힐 때
// 변경이 실제로 무언가를 줄였는지 판정하는 데 쓴다.
function staticJsBytes() {
  const dir = join(ROOT, '.next', 'static')
  let total = 0
  const walk = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name)
      if (entry.isDirectory()) walk(child)
      else if (entry.name.endsWith('.js')) total += statSync(child).size
    }
  }
  walk(dir)
  return total
}

async function runLighthouse(url, port, preset) {
  const result = await lighthouse(
    url,
    { logLevel: 'error', output: 'json', onlyCategories: ['performance'], port },
    // mobile은 Lighthouse 기본 설정이라 config를 넘기지 않는다.
    preset === 'desktop' ? desktopConfig : undefined,
  )
  return result.lhr
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const url = `http://localhost:${args.port}/`

  if (args.build) {
    console.error('[perf] next build …')
    execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit', shell: true })
  }

  const server = await startServer({ root: ROOT, port: args.port })

  let chrome
  try {
    chrome = await chromeLauncher.launch({
      chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
    })

    // 1회차는 항상 유의하게 낮게 나온다(서버 콜드 스타트 + 디스크 캐시). 버린다.
    console.error('[perf] warmup …')
    await runLighthouse(url, chrome.port, args.preset)

    const runs = []
    for (let i = 0; i < args.runs; i += 1) {
      const lhr = await runLighthouse(url, chrome.port, args.preset)
      const run = {
        score: Math.round(lhr.categories.performance.score * 100),
        metrics: Object.fromEntries(
          Object.entries(METRIC_AUDITS).map(([key, id]) => [key, lhr.audits[id].numericValue]),
        ),
      }
      runs.push(run)
      console.error(`[perf] run ${i + 1}/${args.runs}: score=${run.score}`)
    }

    const scores = runs.map((r) => r.score)
    const entry = {
      ts: new Date().toISOString(),
      label: args.label,
      preset: args.preset,
      git: gitSha(),
      dirty: gitDirty(),
      score: median(scores),
      scoreMin: Math.min(...scores),
      scoreMax: Math.max(...scores),
      runs: scores,
      metrics: Object.fromEntries(
        Object.keys(METRIC_AUDITS).map((key) => [
          key,
          Math.round(median(runs.map((r) => r.metrics[key])) * 1000) / 1000,
        ]),
      ),
      bundleBytes: staticJsBytes(),
    }

    appendFileSync(JOURNAL, `${JSON.stringify(entry)}\n`)
    console.log(JSON.stringify(entry, null, 2))
  } finally {
    // Windows에서 크롬 임시 프로필 삭제가 EPERM으로 터진다. 측정은 이미 끝났으므로
    // 정리 실패로 종료코드를 오염시키지 않는다.
    try {
      if (chrome) await chrome.kill()
    } catch {
      /* 임시 디렉터리 정리 실패는 무시 */
    }
    server.stop()
  }
}

main().catch((error) => {
  console.error(`[perf] 실패: ${error.message}`)
  process.exit(1)
})
