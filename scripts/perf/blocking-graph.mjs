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

const MANIFEST = '.next/app-build-manifest.json'
const PAGE = '/page'
/** three が入っていれば必ず出てくる識別子。 */
const THREE_MARKERS = /InstancedMesh|WebGLRenderer/

// 目印が three に実在するかを先に検める。three の版が上がって識別子が
// 消えれば、正規表現は何にも当たらないまま `ok:` を名乗る—門の体をなさない。
const threeEntry = (() => {
  const manifest = 'node_modules/three/package.json'
  if (!existsSync(manifest)) return null
  const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
  const entry = pkg.exports?.['.']?.import ?? pkg.module ?? pkg.main
  return typeof entry === 'string'
    ? `node_modules/three/${entry.replace(/^\.\//, '')}`
    : null
})()

if (threeEntry === null || !existsSync(threeEntry)) {
  console.error(
    'three の入口を node_modules で見つけられない。npm ci を先に走らせること。',
  )
  process.exit(1)
}

if (!THREE_MARKERS.test(readFileSync(threeEntry, 'utf8'))) {
  console.error(
    `THREE_MARKERS が ${threeEntry} に無い — この門は今何も検めていない。`,
  )
  process.exit(1)
}

if (!existsSync(MANIFEST)) {
  console.error(`${MANIFEST} が無い。先に npm run build を走らせること。`)
  process.exit(1)
}

const chunks = JSON.parse(readFileSync(MANIFEST, 'utf8')).pages[PAGE]

if (!Array.isArray(chunks)) {
  console.error(`${MANIFEST} に ${PAGE} が無い。manifest の形が変わった。`)
  process.exit(1)
}

const jsChunks = chunks.filter((chunk) => chunk.endsWith('.js'))
const missing = jsChunks.filter((chunk) => !existsSync(`.next/${chunk}`))

// 読めない chunk を飛ばしてはいけない。manifest の経路が `.next/` 基準で
// なくなれば全部が黙って連れ去られ、offenders は 0 になって `ok:` を名乗る。
// 一度も検めない門は、門が無いより悪い—取り付けたという事実が残るからだ。
if (jsChunks.length === 0 || missing.length > 0) {
  console.error(
    [
      `${MANIFEST} の chunk を .next/ で解決できない。manifest の形が変わった—`,
      'この門は今何も検めていない。',
      ...missing.map((chunk) => `  ${chunk}`),
    ].join('\n'),
  )
  process.exit(1)
}

const offenders = jsChunks.filter((chunk) =>
  THREE_MARKERS.test(readFileSync(`.next/${chunk}`, 'utf8')),
)

if (offenders.length > 0) {
  console.error(
    [
      `three が ${PAGE} の遮断経路に入った (ADR-024 §5):`,
      ...offenders.map((chunk) => `  ${chunk}`),
      '',
      '原因はたいてい、常駐する部品が three を使うモジュールを静的に import',
      'したことだ。押した時に取る (動的 import) か、dynamic() の後ろへ移すこと。',
    ].join('\n'),
  )
  process.exit(1)
}

console.log(`ok: ${PAGE} の遮断経路 ${jsChunks.length} 個を読んだ。three は無い`)
