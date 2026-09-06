// 룰팩 `.yaml`을 **빌드 시점에** JSON 문자열로 굳히는 webpack 로더.
//
// 왜: 지금까지는 YAML 원문이 그대로 번들에 실려 브라우저가 js-yaml(41,143 B min /
// 13,581 B 전송)을 초기 로드에 받아 실행 시점에 파싱했다. 파싱은 매 방문 같은 결과를
// 내는 결정적 변환이므로 빌드 때 한 번 하면 된다.
//
// **값은 바뀌지 않는다.** 변환은 여기서도 같은 js-yaml `load`가 하고, 모듈의 default
// export는 이전과 똑같이 **문자열**이다 (`src/rulepack/index.ts`의
// `Record<string, string>` 계약과 `*.yaml` 타입 선언이 그대로 성립한다). 바뀌는 것은
// 그 문자열이 YAML 문법이냐 JSON 문법이냐뿐이고, 받는 쪽인
// `src/domain/rules/loader.ts`의 `loadDocument`가 둘 다 읽는다.
//
// 규준 수치의 대조는 여전히 원문 YAML로 한다 — vitest는 이 로더를 쓰지 않고
// (vitest.config.ts의 yaml-raw 플러그인) 원문을 js-yaml로 파싱하므로,
// 골든테스트와 `src/rulepack/index.test.ts`가 보는 것은 이 변환 전의 원문이다.
// webpack 로더는 CommonJS로 읽힌다 — 여기서는 require가 맞다.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { load } = require('js-yaml')

/** @type {import('webpack').LoaderDefinitionFunction} */
module.exports = function yamlJsonLoader(source) {
  if (this.cacheable) this.cacheable()
  const document = load(source)
  // JSON.stringify를 두 번 — 안쪽이 문서를 JSON 문법으로, 바깥쪽이 그것을 JS 문자열
  // 리터럴로 만든다.
  return `export default ${JSON.stringify(JSON.stringify(document))};\n`
}
