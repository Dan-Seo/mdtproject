// `.yaml` を「JSON テキストを既定エクスポートするモジュール」に変換する webpack ローダ。
//
// ルールパックの数値は今までどおり src/rulepack/**/*.yaml が唯一の出所だ。
// 変えたのは **いつ読むか** だけで、YAML の解釈はビルド時にここで一度だけ走る。
// 出力は同じ文書の JSON テキストなので、`parseRulePack(files: Record<string, string>)`
// の受け口は文字列のまま変わらない — 読み手だけが js-yaml から JSON.parse に替わる
// (next.config.ts の `js-yaml` エイリアス、scripts/build/js-yaml-json.mjs)。
//
// これで束から落ちるのは①ブラウザに載っていた YAML パーサ (js-yaml 実測 13.6 kB 転送)
// と②原文のコメント・空白だ。値・note・source は JSON にそのまま残る。8ファイル全てで
// `JSON.parse(JSON.stringify(yaml.load(src)))` が入力と一致することを確認している
// (YAML 固有の型を使っていない)。
//
// vitest は vitest.config.ts の yaml-raw プラグインで**原文のまま**読む。
// つまり `src/domain/rules/loader.ts` の YAML 解釈経路はテストで生きたままだ。
import { load } from 'js-yaml'

export default function yamlJsonLoader(source) {
  return `export default ${JSON.stringify(JSON.stringify(load(source)))}\n`
}
