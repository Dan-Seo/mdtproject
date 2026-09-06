// 클라이언트 번들 전용 js-yaml 대체물.
//
// 브라우저 경로에서 룰팩은 `scripts/build/yaml-json-loader.cjs`가 빌드 시점에 JSON으로
// 굳혀 넣으므로 실행 시점 YAML 파서가 필요 없다. 그런데 `src/domain/rules/loader.ts`는
// 테스트·Node 경로를 위해 js-yaml을 정적으로 import하고 있어, 그대로 두면 쓰이지 않는
// 41,143 B(min)가 초기 로드에 남는다. 그래서 클라이언트 빌드에서만 이 파일로 바꾼다
// (`next.config.ts`의 webpack resolve.alias, `isServer === false`일 때만).
//
// **조용히 틀린 값을 내지 않는다** — 브라우저에서 YAML 문법 문서가 파서까지 오면
// 그것은 빌드 파이프라인이 깨졌다는 뜻이므로 그 자리에서 던진다.
function unavailable() {
  throw new Error(
    'js-yaml is not bundled for the browser: rule pack documents must be precompiled to JSON by scripts/build/yaml-json-loader.cjs',
  )
}

module.exports = { load: unavailable, loadAll: unavailable, dump: unavailable }
module.exports.default = module.exports
