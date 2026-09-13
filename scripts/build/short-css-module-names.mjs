import { createHash } from 'node:crypto'
import path from 'node:path'

/**
 * CSS Modules のクラス名を本番ビルドだけ短くする。
 *
 * 既定は `TakeoffPane_numericCell__P3ugY` のような読める名前で、これが
 * ①CSS ②SSR した HTML ③クラス名表を持つ JS チャンク の**三箇所**に出る。
 * 実測(この案件の初期ロード)では 131 種が 2,266 回で、6 文字に潰すと
 * gzip 後で HTML −2,250 B・CSS −2,256 B・page チャンク −1,755 B だった。
 *
 * 開発ビルドには掛けない — devtools で読めることの方が値打ちがある。
 */
/**
 * 名前が衝突すると二つの規則が同じセレクタに落ちて、片方の装飾が黙って
 * 混ざる。次の名前を短くしたくなったときのために、ここで**必ず落ちる**ように
 * しておく — 衝突は珍しいだけで、起きたら画面が理由なく崩れる類の事故だ。
 */
const taken = new Map()

function shortName(rootContext, resourcePath, localName) {
  // ファイルの位置とクラス名の組を鍵にする。パスは rootContext からの相対に
  // するので、サーバ束とクライアント束、そして機械が変わっても同じ名前になる。
  const key = `${path.relative(rootContext, resourcePath).split(path.sep).join('/')}|${localName}`
  const digest = createHash('sha256').update(key).digest()
  // 先頭は必ず英字にする（数字始まりは CSS 識別子として不正）。
  const name = `k${digest.readUInt32BE(0).toString(36).padStart(7, '0').slice(0, 6)}`
  const previous = taken.get(name)
  if (previous !== undefined && previous !== key) {
    throw new Error(
      `CSS Modules class name collision: ${name} <- ${previous} / ${key}`,
    )
  }
  taken.set(name, key)
  return name
}

/** webpack の rules を再帰的に歩いて css-loader の設定だけ差し替える。 */
export function shortenCssModuleNames(rules) {
  for (const rule of rules) {
    if (!rule || typeof rule !== 'object') continue
    if (Array.isArray(rule.oneOf)) shortenCssModuleNames(rule.oneOf)
    if (Array.isArray(rule.rules)) shortenCssModuleNames(rule.rules)
    const uses = Array.isArray(rule.use) ? rule.use : rule.use ? [rule.use] : []
    for (const use of uses) {
      if (!use || typeof use !== 'object') continue
      if (typeof use.loader !== 'string') continue
      if (!use.loader.includes('css-loader')) continue
      if (use.loader.includes('postcss-loader')) continue
      const modules = use.options?.modules
      if (!modules || typeof modules !== 'object') continue
      // 自分で書いた *.module.css だけ潰す。next/font が生成する仮想 CSS Modules は
      // 二つのフォントが同じ資源パスと同じ局所名 (`__variable`) を持つので、
      // ここで名前を作ると衝突する — 実測で `--font-inter` と
      // `--font-jetbrains-mono` の規則が同じセレクタに落ちた。Next 既定に任せる。
      const original = modules.getLocalIdent
      modules.getLocalIdent = (context, localIdentName, localName, ...rest) => {
        const resource = context.resourcePath
        if (!resource.endsWith('.module.css') || resource.includes('node_modules')) {
          return original?.(context, localIdentName, localName, ...rest)
        }
        return shortName(context.rootContext, resource, localName)
      }
    }
  }
}
