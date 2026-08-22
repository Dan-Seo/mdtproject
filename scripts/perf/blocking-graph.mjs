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

if (!existsSync(MANIFEST)) {
  console.error(`${MANIFEST} が無い。先に npm run build を走らせること。`)
  process.exit(1)
}

const chunks = JSON.parse(readFileSync(MANIFEST, 'utf8')).pages[PAGE]

if (!Array.isArray(chunks)) {
  console.error(`${MANIFEST} に ${PAGE} が無い。manifest の形が変わった。`)
  process.exit(1)
}

const offenders = chunks.filter(
  (chunk) =>
    chunk.endsWith('.js') &&
    existsSync(`.next/${chunk}`) &&
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

console.log(`ok: ${PAGE} の遮断経路 ${chunks.length} 個に three は無い`)
