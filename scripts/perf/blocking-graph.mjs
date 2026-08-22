// `/` の遮断経路に three が居ないことを確かめる (ADR-024 §5)。
//
// なぜ Lighthouse 予算ではないのか: ビューアが載れば three はどのみち届くので、
// 静的 import に戻しても転送量も要求数もほとんど動かない。変わるのは
// **同期モジュールグラフに入るかどうか** だけで、予算はそこを見ない。
// 実際に M4 の最初の版がこの回帰を起こし、全予算を通り抜けた
// (`/` の First Load JS だけが 167 kB → 226 kB になった)。
//
// 名前では判らない (chunk 名は hash) ので中身を見る。
import { readFileSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const MANIFEST = '.next/app-build-manifest.json'
const PAGE = '/page'
/** three が入っていれば必ず出てくる識別子。 */
export const THREE_MARKERS = /InstancedMesh|WebGLRenderer/

/** three の入口 (版で名前が変わるので package.json から引く)。 */
function threeEntry(root) {
  const manifest = `${root}/node_modules/three/package.json`
  if (!existsSync(manifest)) return null

  const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
  const entry = pkg.exports?.['.']?.import ?? pkg.module ?? pkg.main
  if (typeof entry !== 'string') return null

  const resolved = `${root}/node_modules/three/${entry.replace(/^\.\//, '')}`
  return existsSync(resolved) ? resolved : null
}

/**
 * 判定を返すだけで、終わらせるのは呼び手だ。`{ ok, message }` を返す。
 *
 * 落ちる枝が四つあり、どれも「検めないまま通す」を潰すためにある —
 * three が見つからない・目印が消えた・manifest が無い/形が変わった・
 * chunk が `.next/` で解決できない。一度も検めない門は、門が無いより悪い
 * (取り付けたという事実だけが残る)。scripts/perf/blocking-graph.test.mjs が
 * その四つを固定している。
 */
export function checkBlockingGraph(root = '.') {
  const entry = threeEntry(root)
  if (entry === null) {
    return {
      ok: false,
      message:
        'three の入口を node_modules で見つけられない。npm ci を先に走らせること。',
    }
  }

  // 目印が three に実在するかを先に検める。three の版が上がって識別子が
  // 消えれば、正規表現は何にも当たらないまま `ok:` を名乗る。
  if (!THREE_MARKERS.test(readFileSync(entry, 'utf8'))) {
    return {
      ok: false,
      message: `THREE_MARKERS が ${entry} に無い — この門は今何も検めていない。`,
    }
  }

  const manifestPath = `${root}/${MANIFEST}`
  if (!existsSync(manifestPath)) {
    return {
      ok: false,
      message: `${MANIFEST} が無い。先に npm run build を走らせること。`,
    }
  }

  const chunks = JSON.parse(readFileSync(manifestPath, 'utf8')).pages?.[PAGE]
  if (!Array.isArray(chunks)) {
    return {
      ok: false,
      message: `${MANIFEST} に ${PAGE} が無い。manifest の形が変わった。`,
    }
  }

  const jsChunks = chunks.filter((chunk) => chunk.endsWith('.js'))
  const missing = jsChunks.filter(
    (chunk) => !existsSync(`${root}/.next/${chunk}`),
  )

  if (jsChunks.length === 0 || missing.length > 0) {
    return {
      ok: false,
      message: [
        `${MANIFEST} の chunk を .next/ で解決できない。manifest の形が変わった—`,
        'この門は今何も検めていない。',
        ...missing.map((chunk) => `  ${chunk}`),
      ].join('\n'),
    }
  }

  const offenders = jsChunks.filter((chunk) =>
    THREE_MARKERS.test(readFileSync(`${root}/.next/${chunk}`, 'utf8')),
  )

  if (offenders.length > 0) {
    return {
      ok: false,
      message: [
        `three が ${PAGE} の遮断経路に入った (ADR-024 §5):`,
        ...offenders.map((chunk) => `  ${chunk}`),
        '',
        '原因はたいてい、常駐する部品が three を使うモジュールを静的に import',
        'したことだ。押した時に取る (動的 import) か、dynamic() の後ろへ移すこと。',
      ].join('\n'),
    }
  }

  return {
    ok: true,
    message: `ok: ${PAGE} の遮断経路 ${jsChunks.length} 個を読んだ。three は無い`,
  }
}

// 直に走らせたときだけ判定して終わる。test は関数を呼ぶ。
if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { ok, message } = checkBlockingGraph()
  if (ok) console.log(message)
  else console.error(message)
  process.exit(ok ? 0 : 1)
}
