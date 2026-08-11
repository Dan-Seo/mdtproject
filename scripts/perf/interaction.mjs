#!/usr/bin/env node
// 조작 지연 측정 하네스 — 이 파일은 최적화 루프가 편집하지 않는다.
//
// Lighthouse 하네스(measure.mjs)와 목적이 다르다. 저쪽은 "처음 열 때"를 재고,
// 이쪽은 "쓰는 동안"을 잰다. desktop Lighthouse는 이미 만점이라 기울기가 없지만
// 조작 비용은 도면 규모에 따라 선형으로 커진다 — 이 도구의 실제 부담은 여기다.
//
// 지표는 벽시계가 아니라 **CDP Performance의 CPU 시간**이다. 벽시계로 재면 값이
// 프레임(16.7ms) 배수에 붙어버려, 규모를 6배로 키웠는데 더 빨라지는 무의미한 수가 나온다.
//
// 사용: node scripts/perf/interaction.mjs --label <이름> [--repeats 9] [--spans 8] [--no-build]

import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import puppeteer from 'puppeteer-core'

import { startServer } from './server.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const JOURNAL = join(ROOT, 'scripts', 'perf', 'interaction-journal.jsonl')
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const CPU_KEYS = ['ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'TaskDuration']
const WARMUP = 3

function parseArgs(argv) {
  const args = { label: 'unlabeled', repeats: 9, port: 4322, build: true, spans: 8 }
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    if (flag === '--label') args.label = argv[++i]
    else if (flag === '--repeats') args.repeats = Number(argv[++i])
    else if (flag === '--spans') args.spans = Number(argv[++i])
    else if (flag === '--port') args.port = Number(argv[++i])
    else if (flag === '--no-build') args.build = false
    else throw new Error(`알 수 없는 인자: ${flag}`)
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

// 페이지 안에 심는 도구. t0/t1이 같은 컨텍스트에 있어야 하고, React 제어 입력은
// 네이티브 setter로 값을 넣어야 onChange가 걸린다.
function installProbe() {
  window.__perf = {
    nextPaint: () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
    setInput: (element, value) => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      ).set
      setter.call(element, String(value))
      element.dispatchEvent(new Event('input', { bubbles: true }))
    },
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.build) {
    console.error('[perf] next build …')
    execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit', shell: true })
  }

  const server = await startServer({ root: ROOT, port: args.port })
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--window-size=1600,1000'],
  })

  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1600, height: 1000 })
    const cdp = await page.createCDPSession()
    await cdp.send('Performance.enable')

    await page.goto(server.url, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('canvas', { timeout: 30_000 })
    await page.evaluate(installProbe)
    // fly-in 트윈(900ms)과 초기 셰이더 컴파일이 끝나길 기다린다.
    await new Promise((resolve) => setTimeout(resolve, 2500))

    const cpu = async () => {
      const { metrics } = await cdp.send('Performance.getMetrics')
      const map = Object.fromEntries(metrics.map((m) => [m.name, m.value]))
      return Object.fromEntries(CPU_KEYS.map((k) => [k, map[k] ?? 0]))
    }

    /** 한 번의 조작이 실제로 태운 CPU 시간(ms). */
    const costOf = async (action) => {
      await page.evaluate(() => window.__perf.nextPaint())
      const before = await cpu()
      await action()
      await page.evaluate(() => window.__perf.nextPaint())
      const after = await cpu()
      return Object.fromEntries(
        CPU_KEYS.map((k) => [k, Math.round((after[k] - before[k]) * 10000) / 10]),
      )
    }

    // 규모를 키운다. 이 도구의 부담은 도면이 커질 때 나타나므로 샘플 크기로는 못 본다.
    const addSpan = async (axis) => {
      await page.evaluate((axisLabel) => {
        const button = [...document.querySelectorAll('button')].find((element) =>
          element.textContent?.trim().startsWith(axisLabel),
        )
        if (button === undefined) throw new Error(`${axisLabel} 버튼을 찾지 못했다`)
        button.click()
      }, axis)
      await page.evaluate(() => window.__perf.nextPaint())
    }
    for (let i = 2; i < args.spans; i += 1) {
      await addSpan('Xスパンを追加')
      await addSpan('Yスパンを追加')
    }

    let pitch = 100
    const scenarios = {
      idle: () => page.evaluate(() => window.__perf.nextPaint()),
      pitchEdit: () => {
        pitch = pitch >= 400 ? 110 : pitch + 10
        return page.evaluate((next) => {
          const input = document.querySelector('[aria-label="C1 帯筋 ピッチ"]')
          if (input === null) throw new Error('帯筋 ピッチ 입력을 찾지 못했다')
          window.__perf.setInput(input, next)
        }, pitch)
      },
      memberClick: (i) =>
        page.evaluate((index) => {
          const members = [...document.querySelectorAll("svg g[role='button']")]
          if (members.length === 0) throw new Error('平面 부재를 찾지 못했다')
          members[index % members.length].dispatchEvent(
            new MouseEvent('click', { bubbles: true }),
          )
        }, i),
      viewerTab: (i) =>
        page.evaluate((index) => {
          const name = index % 2 === 0 ? '建物' : '部材'
          const tab = [...document.querySelectorAll("[role='tab']")].find(
            (element) => element.textContent?.trim() === name,
          )
          if (tab === undefined) throw new Error(`${name} 탭을 찾지 못했다`)
          tab.click()
        }, i),
    }

    const scale = await page.evaluate(() => ({
      planMembers: document.querySelectorAll("svg g[role='button']").length,
      quantityRows: document.querySelectorAll("[data-testid^='quantity-line-']").length,
    }))
    if (scale.planMembers === 0) throw new Error('平面이 렌더되지 않았다 — 측정 무효')
    console.error(
      `[perf] 규모: 平面 부재 ${scale.planMembers}, 数量 행 ${scale.quantityRows} (${args.spans}×${args.spans} 스팬)`,
    )

    const result = {}
    for (const [name, action] of Object.entries(scenarios)) {
      // 첫 몇 회는 셰이더 링크·JIT 워밍업이 섞인다. 버린다.
      for (let i = 0; i < WARMUP; i += 1) await costOf(() => action(i))

      const samples = []
      for (let i = 0; i < args.repeats; i += 1) samples.push(await costOf(() => action(i)))
      result[name] = Object.fromEntries(
        CPU_KEYS.map((k) => [k, median(samples.map((s) => s[k]))]),
      )
      console.error(
        `[perf] ${name.padEnd(12)} task=${result[name].TaskDuration}ms ` +
          `(script=${result[name].ScriptDuration} layout=${result[name].LayoutDuration})`,
      )
    }

    /** idle 프레임 비용을 뺀 시나리오별 값. */
    const netOf = (key) =>
      Object.fromEntries(
        Object.entries(result)
          .filter(([name]) => name !== 'idle')
          .map(([name, value]) => [
            name,
            Math.round((value[key] - result.idle[key]) * 10) / 10,
          ]),
      )

    const entry = {
      ts: new Date().toISOString(),
      label: args.label,
      git: gitSha(),
      spans: args.spans,
      scale,
      repeats: args.repeats,
      // 유휴 프레임 비용을 뺀 순수 조작 비용. netTaskMs가 목적함수다 (2026-08-11 변경).
      // netScriptMs도 남긴다 — 회귀가 스크립트에서 왔는지 레이아웃에서 왔는지 가르는 데 쓴다.
      netTaskMs: netOf('TaskDuration'),
      netScriptMs: netOf('ScriptDuration'),
      netLayoutMs: netOf('LayoutDuration'),
      idleScriptMs: result.idle.ScriptDuration,
      raw: result,
    }

    appendFileSync(JOURNAL, `${JSON.stringify(entry)}\n`)
    console.log(JSON.stringify(entry, null, 2))
  } finally {
    await browser.close().catch(() => {})
    server.stop()
  }
}

main().catch((error) => {
  console.error(`[perf] 실패: ${error.message}`)
  process.exit(1)
})
