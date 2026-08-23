// 브라우저 번들 안에서 js-yaml 자리에 들어가는 파서.
//
// 번들에 실리는 YAML은 `scripts/build/yaml-json-loader.cjs`가 빌드 시점에 JSON으로
// 굳혀 둔 룰팩뿐이므로, 런타임에 YAML 문법 전체를 해석할 파서가 필요 없다. js-yaml
// 본체는 초기 로드에서 별도 청크 13.5 kB(전송)을 차지했다 — 그 자리를 이 파일이 대신한다.
//
// alias는 `next.config.ts`의 webpack 훅에서만 걸린다. 테스트(vitest)와 `next dev`
// (turbopack)는 진짜 js-yaml로 YAML 원문을 그대로 판다 — **규준 값을 검증하는 경로는
// 이 파일을 지나지 않는다.**
//
// 런타임에 YAML 원문이 흘러들면 조용히 틀린 값을 주는 대신 여기서 멈춘다.
export function load(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error(
      'バンドル内の YAML はビルド時に JSON へ変換される（scripts/build/yaml-json-loader.cjs）。' +
        '実行時に YAML 構文の解析が必要になったら next.config.ts の js-yaml alias を外すこと。',
    )
  }
}

// js-yaml은 named export와 default export를 둘 다 낸다 — 대체품도 같은 모양이어야
// `import yaml from 'js-yaml'` 쪽이 조용히 undefined가 되지 않는다.
const yaml = { load }

export default yaml
