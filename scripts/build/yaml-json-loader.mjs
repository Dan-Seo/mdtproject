// 룰팩 YAML을 **빌드 시점에** JSON으로 굳혀 문자열로 내보내는 webpack 로더.
//
// 왜: `src/rulepack/index.ts`는 YAML 원문을 문자열로 받아 `parseRulePack`에 넘기고,
// 그 함수가 브라우저에서 js-yaml로 판다. 그래서 초기 로드에 (1) YAML 원문 96 kB —
// 주석·전사 메모까지 전부 — 와 (2) js-yaml 파서가 통째로 실렸다.
// YAML 주석은 파싱 결과에 남지 않고 JSON은 YAML의 부분집합이라 `load(JSON)`은 같은
// 객체를 준다. 즉 이 변환은 **파싱 결과를 바꾸지 않고** 전송 바이트만 줄인다.
//
// 규준 수치의 출처는 여전히 `src/rulepack/jp-mlit/*.yaml` 하나다 — 이 로더는 그 파일을
// 읽기만 하고 값을 만들지 않는다. 변환이 깨지면 parseRulePack의 필수 필드 검사와
// 골든테스트가 그 자리에서 실패한다(그쪽은 vitest가 YAML 원문을 그대로 먹인다).
import { load } from 'js-yaml'

export default function yamlJsonLoader(source) {
  const data = load(source)
  // 결과는 **문자열**이다 — parseRulePack의 인자 타입(Record<string, string>)이 그것이고,
  // 브라우저 쪽 파서(src/lib/build/yaml-json.ts)가 JSON.parse로 되돌린다.
  return `export default ${JSON.stringify(JSON.stringify(data))}`
}
