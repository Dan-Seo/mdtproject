// ブラウザ側の `js-yaml` の置き換え (next.config.ts の resolve.alias)。
//
// webpack ビルドでは `.yaml` は yaml-json-loader.cjs が JSON テキストに変換済みだ。
// JSON は YAML の部分集合なので、`load()` の呼び出し側 (src/domain/rules/loader.ts)
// から見た振る舞いは変わらない — 同じ文書が同じ形のオブジェクトになる。
//
// Node 側 (evals/harness, vitest) はこのエイリアスを通らないので本物の js-yaml を
// 使う。原文 YAML を読む経路はそちらで生きている。
export function load(text) {
  return JSON.parse(text)
}

const jsYamlJson = { load }

export default jsYamlJson
