// 룰팩 YAML을 빌드 시점에 JSON으로 굳히는 변환(`scripts/build/yaml-json-loader.mjs`)이
// **파싱 결과를 바꾸지 않는다**는 것을 눈으로 확인하는 일회성 점검 스크립트.
//
//   npx tsx scripts/perf/verify-rulepack-json.mts
//
// 골든테스트는 vitest에서 YAML 원문을 그대로 먹이므로 이 변환 경로를 지나지 않는다.
// 그래서 번들 쪽 값이 원문과 같은지는 여기서 따로 맞춰 본다.
import fs from 'node:fs'
import path from 'node:path'

import { load } from 'js-yaml'

import { parseRulePack } from '../../src/domain/rules/loader'

const dir = path.resolve('src/rulepack/jp-mlit')
const yamlFiles: Record<string, string> = {}
const jsonFiles: Record<string, string> = {}

for (const name of fs.readdirSync(dir)) {
  const text = fs.readFileSync(path.join(dir, name), 'utf8')
  yamlFiles[name] = text
  jsonFiles[name] = JSON.stringify(load(text))
}

const fromYaml = JSON.stringify(parseRulePack(yamlFiles))
const fromJson = JSON.stringify(parseRulePack(jsonFiles))

console.log('entries:', parseRulePack(yamlFiles).entries.length)
console.log('identical:', fromYaml === fromJson)
if (fromYaml !== fromJson) process.exit(1)
