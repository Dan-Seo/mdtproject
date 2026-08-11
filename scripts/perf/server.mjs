// 측정용 프로덕션 서버 기동·정리. measure.mjs와 interaction.mjs가 공유한다 —
// 특히 assertBuildIsServed는 두 하네스에서 절대 어긋나면 안 된다.
import { execFileSync, spawn } from 'node:child_process'

// 포트를 잡고 있는 PID들. Windows에서 `shell: true`로 띄우면 자식 PID는 cmd.exe라
// 손자(node)가 살아남는다. 그래서 자식 PID가 아니라 **포트**를 기준으로 죽인다.
export function pidsOnPort(port) {
  try {
    const out = execFileSync('netstat', ['-ano'], { windowsHide: true }).toString()
    const pids = new Set()
    for (const line of out.split('\n')) {
      if (!line.includes(`:${port} `) || !line.includes('LISTENING')) continue
      const pid = line.trim().split(/\s+/).pop()
      if (pid && pid !== '0') pids.add(pid)
    }
    return [...pids]
  } catch {
    return []
  }
}

export function killPort(port) {
  for (const pid of pidsOnPort(port)) {
    try {
      execFileSync('taskkill', ['/pid', pid, '/T', '/F'], { stdio: 'ignore' })
    } catch {
      /* 이미 종료됨 */
    }
  }
}

async function waitForServer(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      /* 아직 안 떴다 */
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`서버가 ${timeoutMs}ms 안에 뜨지 않았다: ${url}`)
}

/**
 * 서버가 **이번 빌드**를 서빙하고 있는지 확인한다. 낡은 서버가 포트를 붙들고 있으면
 * `/`는 200을 주면서 청크는 400/404를 준다. 그러면 하이드레이션이 통째로 실패하고
 * 지표가 붕괴해 "성능이 좋아진 것처럼" 보인다 — 이 루프에서 실제로 한 번 겪었다.
 */
export async function assertBuildIsServed(url) {
  const html = await (await fetch(url)).text()
  const scripts = [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+\.js)"/g)].map(
    (match) => match[1],
  )
  if (scripts.length === 0) throw new Error('HTML에 _next/static 스크립트가 하나도 없다')

  const broken = []
  for (const path of new Set(scripts)) {
    const res = await fetch(new URL(path, url))
    if (!res.ok) broken.push(`${path} → HTTP ${res.status}`)
  }
  if (broken.length > 0) {
    throw new Error(
      `서버가 이번 빌드를 서빙하지 않는다 (낡은 서버가 포트를 붙들고 있을 수 있다):\n  ${broken.join('\n  ')}`,
    )
  }
  console.error(`[perf] 무결성 확인: 스크립트 ${new Set(scripts).size}개 전부 200`)
}

/** 포트를 비우고 프로덕션 서버를 띄운 뒤, 이번 빌드를 서빙하는지까지 확인한다. */
export async function startServer({ root, port }) {
  killPort(port)
  if (pidsOnPort(port).length > 0) {
    throw new Error(`포트 ${port}을 비우지 못했다: PID ${pidsOnPort(port).join(', ')}`)
  }

  console.error(`[perf] next start :${port} …`)
  const child = spawn('npx', ['next', 'start', '-p', String(port)], {
    cwd: root,
    stdio: 'ignore',
    shell: true,
    detached: process.platform !== 'win32',
  })

  const url = `http://localhost:${port}/`
  await waitForServer(url)
  await assertBuildIsServed(url)
  return { url, stop: () => child.pid && killPort(port) }
}
