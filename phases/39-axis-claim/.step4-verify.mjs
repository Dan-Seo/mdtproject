import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const goldenDir = resolve(root, 'tests/fixtures/plan-import/expected')

function runVitest(testFile) {
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  const result = spawnSync(command, ['vitest', 'run', testFile], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return { exitCode: result.status ?? 1 }
}

function mutateJson(file, mutate, testFile) {
  const original = readFileSync(file)
  try {
    const value = JSON.parse(original.toString('utf8'))
    const mutation = mutate(value)
    writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    return { ...mutation, ...runVitest(testFile) }
  } finally {
    writeFileSync(file, original)
  }
}

function mutateText(file, mutate, testFile) {
  const original = readFileSync(file, 'utf8')
  try {
    writeFileSync(file, mutate(original), 'utf8')
    return runVitest(testFile)
  } finally {
    writeFileSync(file, original, 'utf8')
  }
}

const elevationFiles = readdirSync(goldenDir)
  .filter((name) => name.endsWith('-elevation.json'))
  .sort()

const axisMutations = []
for (const name of elevationFiles) {
  const file = resolve(goldenDir, name)
  const original = JSON.parse(readFileSync(file, 'utf8'))
  for (let elevationIndex = 0; elevationIndex < original.elevations.length; elevationIndex += 1) {
    const axis = original.elevations[elevationIndex].axis
    if (axis === undefined) continue
    for (let index = 0; index < axis.spansMm.length; index += 1) {
      axisMutations.push(mutateJson(file, (value) => {
        value.elevations[elevationIndex].axis.spansMm[index] += 1
        return { field: `/elevations/${elevationIndex}/axis/spansMm/${index}` }
      }, 'tests/plan-import/corpus2-elevation.test.ts'))
    }
    for (let index = 0; index < axis.labels.length; index += 1) {
      axisMutations.push(mutateJson(file, (value) => {
        value.elevations[elevationIndex].axis.labels.splice(index, 1)
        return { field: `/elevations/${elevationIndex}/axis/labels/${index}` }
      }, 'tests/plan-import/corpus2-elevation.test.ts'))
    }
    if (axis.totalMm !== null) {
      axisMutations.push(mutateJson(file, (value) => {
        value.elevations[elevationIndex].axis.totalMm += 1
        return { field: `/elevations/${elevationIndex}/axis/totalMm` }
      }, 'tests/plan-import/corpus2-elevation.test.ts'))
    }
  }
}

const crosscheckTargets = [
  ['hirosaki-kikyono-p21-grid.json', 'y'],
  ['tsu-kanritou-p16-grid.json', 'x'],
  ['karatsu-fukuzu-p1-grid.json', 'y'],
]
const crosscheckMutations = crosscheckTargets.map(([name, axisName]) => {
  const file = resolve(goldenDir, name)
  return mutateJson(file, (value) => {
    value.blocks[0][axisName].spansMm[0] += 1
    return { file: name, axis: axisName }
  }, 'tests/plan-import/corpus2-elevation.test.ts')
})

const keyCoverageFile = resolve(root, 'tests/plan-import/key-coverage.test.ts')
const keyAddResult = mutateText(keyCoverageFile, (text) => text.replace(
  "const CLAIMED: readonly ClaimedPath[] = [",
  "const CLAIMED: readonly ClaimedPath[] = [{ path: '__absent_claim', test: 'mutation' },",
), 'tests/plan-import/key-coverage.test.ts')
const keyDeleteResult = mutateText(keyCoverageFile, (text) => text.replace(
  "  {\n    path: 'blocks[].x.labels[]',\n    test: 'tests/plan-import/corpus2.test.ts > 2차 7면 伏図 격자 골든',\n  },\n",
  '',
), 'tests/plan-import/key-coverage.test.ts')

const positionFixture = resolve(root, 'tests/fixtures/section-import/expected/ojkk-akamichi-p4-walls-slabs.json')
const positionUnknownResult = mutateJson(positionFixture, (value) => {
  const list = value.lists.find((entry) => entry.listKind === '片持梁リスト')
  const entry = list.entries.find((candidate) => candidate.mark === 'CB1')
  entry['上端筋'].__unknown = '9-D25'
  return { field: 'lists[片持梁リスト].entries[CB1].上端筋.__unknown' }
}, 'tests/section-import/parse.test.ts')
const positionTipResult = mutateJson(positionFixture, (value) => {
  const list = value.lists.find((entry) => entry.listKind === '片持梁リスト')
  const entry = list.entries.find((candidate) => candidate.mark === 'CB1')
  entry['上端筋']['先端'] = '3-D25'
  return { field: 'lists[片持梁リスト].entries[CB1].上端筋.先端' }
}, 'tests/section-import/parse.test.ts')

const paths = [
  ...elevationFiles.map((name) => `tests/fixtures/plan-import/expected/${name}`),
  ...crosscheckTargets.map(([name]) => `tests/fixtures/plan-import/expected/${name}`),
  'tests/fixtures/section-import/expected/ojkk-akamichi-p4-walls-slabs.json',
  'tests/plan-import/corpus2-elevation.test.ts',
  'tests/plan-import/key-coverage.test.ts',
  'tests/section-import/parse.test.ts',
  'src/lib/import/framing-plan/elevation.ts',
  'phases/38-elevation-close/step3-report.json',
  'phases/39-axis-claim/step3-report.json',
  'phases/39-axis-claim/step2-report.json',
  'phases/39-axis-claim/index.json',
  'phases/39-axis-claim/step4.md',
]

console.log(JSON.stringify({
  axisFiles: elevationFiles,
  axisMutations,
  crosscheckMutations,
  keyAddResult,
  keyDeleteResult,
  positionUnknownResult,
  positionTipResult,
  paths: paths.map((path) => ({ path, exists: existsSync(resolve(root, path)) })),
}, null, 2))
