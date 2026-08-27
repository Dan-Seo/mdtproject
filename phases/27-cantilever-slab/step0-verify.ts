import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'

import { lookupRule } from '../../src/domain/rules/lookup'
import { parseRulePack } from '../../src/domain/rules/loader'
import { slabBay, slabRun, type Project } from '../../src/domain/model/project'
import { createSampleProject } from '../../src/domain/model/sample-project'
import { MemberUnsupportedError } from '../../src/domain/model/unsupported'

type PremiseStatus = 'upheld' | 'refuted'

interface PremiseResult {
  id: string
  status: PremiseStatus
  evidence: unknown[]
}

function sourceLine(path: string, needle: string) {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/)
  const index = lines.findIndex((line) => line.includes(needle))
  assert.ok(index >= 0, `${path} does not contain ${needle}`)
  return { file: path, line: index + 1, text: lines[index] }
}

function sourceRange(path: string, start: number, end: number) {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/)
  return {
    file: path,
    lines: [start, end],
    text: lines.slice(start - 1, end).join('\n'),
  }
}

const ruleFiles = [
  'sources.yaml',
  'cover.yaml',
  'anchorage.yaml',
  'lap.yaml',
  'bend.yaml',
  'markup.yaml',
  'measure.yaml',
  'splice.yaml',
].reduce<Record<string, string>>((files, fileName) => {
  files[fileName] = readFileSync(`src/rulepack/jp-mlit/${fileName}`, 'utf8')
  return files
}, {})
const jpMlitRulePack = parseRulePack(ruleFiles)

const pdfProbe = String.raw`
import fitz, hashlib, json, re

paths = {
    "quantity": ".cache/001178206.pdf",
    "spec": ".cache/001888816.pdf",
}

def compact(value):
    return re.sub(r"\s+", "", value)

def hits(document, term):
    return [index + 1 for index, page in enumerate(document) if term in page.get_text()]

def occurrences(document, term):
    return sum(page.get_text().count(term) for page in document)

def context(document, term, page_number=None):
    pages = [page_number - 1] if page_number is not None else range(len(document))
    for index in pages:
        text = compact(document[index].get_text())
        if term in text:
            at = text.index(term)
            return {"pdfPage": index + 1, "text": text[max(0, at - 100):at + len(term) + 100]}
    return None

out = {}
for name, path in paths.items():
    with open(path, "rb") as stream:
        digest = hashlib.sha256(stream.read()).hexdigest()
    document = fitz.open(path)
    out[name] = {
        "path": path,
        "pages": len(document),
        "sha256": digest,
        "cantileverPages": hits(document, "片持"),
        "cantileverCount": occurrences(document, "片持"),
        "distributionPages": hits(document, "配力筋"),
    }

quantity = fitz.open(paths["quantity"])
spec = fitz.open(paths["spec"])
clauses = {
    "definition": {
        "text": "片持床板等もこれらに準ずる。",
        "page": 16,
    },
    "slabSpliceException": {
        "text": "単独床板及び片持床板の主筋の継手は、１通則４）による。",
        "page": 22,
    },
    "l3Cantilever": {
        "text": "10dかつ150mm以上（片持スラブの場合は25d）",
        "page": 36,
    },
    "laIncludesCantileverSlab": {
        "text": "片持梁及び片持スラブを含む。",
        "page": 37,
    },
    "lbExcludesCantileverSlab": {
        "text": "片持小梁及び片持スラブを除く。",
        "page": 37,
    },
    "tipHook": {
        "text": "片持ちスラブ先端、壁筋の自由端側の先端で90°フック又は135°フックを用いる場合には、余長は4d以上とする。",
        "page": 33,
    },
}

clauseResults = {}
for key, item in clauses.items():
    document = quantity if key in ["definition", "slabSpliceException"] else spec
    normalized = compact(document[item["page"] - 1].get_text())
    clauseResults[key] = {
        "expected": item["text"],
        "pdfPage": item["page"],
        "present": item["text"] in normalized,
        "context": context(document, item["text"], item["page"]),
    }

# The L3 slab entry is one vertically merged cell in the rendered table. The
# text spans for 10d, 150mm and the cantilever parenthesis occupy that same
# slab-column x band on printed page 30 / PDF page 36.
page = spec[35]
cell_spans = []
for block in page.get_text("dict")["blocks"]:
    for line in block.get("lines", []):
        text = "".join(span["text"] for span in line["spans"])
        x0, y0, x1, y1 = line["bbox"]
        if 325 <= x0 <= 365 and any(token in text for token in ["10d", "150mm", "片持", "25d"]):
            cell_spans.append({
                "text": text,
                "bbox": [round(x0, 3), round(y0, 3), round(x1, 3), round(y1, 3)],
            })

out["clauses"] = clauseResults
out["l3Cell"] = {
    "image": ".cache/table-5-3-4.png",
    "pdfPage": 36,
    "printedPage": 30,
    "spansInSlabColumn": cell_spans,
    "sameColumnEvidence": len(cell_spans) >= 4,
    "interpretation": "The parenthetical 片持スラブの場合は25d is the exception value for the single merged L3 スラブ cell; it replaces the base 10dかつ150mm以上 entry rather than retaining an independent 150mm condition.",
}

print(json.dumps(out, ensure_ascii=False))
`

const pdfEvidence = JSON.parse(
  execFileSync('python', ['-c', pdfProbe], { encoding: 'utf8' }),
)

const expectedHashes = {
  quantity: '801d7917e81369dd4eac551af76f00aba6fa7d7e8224703f162a0435b46d9a30',
  spec: '8fd3c83ca92b01a26e53071efdb3e871e4b5672583f8473ba062cbcc45759acc',
}
assert.equal(pdfEvidence.quantity.sha256, expectedHashes.quantity)
assert.equal(pdfEvidence.spec.sha256, expectedHashes.spec)

const premise1: PremiseResult = {
  id: 'zero-count-was-wrong',
  status:
    pdfEvidence.quantity.cantileverCount === 6 &&
    pdfEvidence.spec.cantileverCount === 8 &&
    pdfEvidence.quantity.distributionPages.length === 0 &&
    pdfEvidence.spec.distributionPages.length === 0
      ? 'upheld'
      : 'refuted',
  evidence: [
    {
      quantity: {
        printedPages: [10, 11, 16, 17, 20],
        pdfPages: pdfEvidence.quantity.cantileverPages,
        count: pdfEvidence.quantity.cantileverCount,
      },
      standardSpecification: {
        printedPages: [27, 30, 31, 54],
        pdfPages: pdfEvidence.spec.cantileverPages,
        count: pdfEvidence.spec.cantileverCount,
      },
      distributionRebar: {
        quantityPdfPages: pdfEvidence.quantity.distributionPages,
        specificationPdfPages: pdfEvidence.spec.distributionPages,
        count: 0,
      },
      hashes: {
        quantity: pdfEvidence.quantity.sha256,
        specification: pdfEvidence.spec.sha256,
      },
    },
    '積算基準のPDF本文は、印刷10・11・16・17・20頁で片持を計6件、標準仕様書は印刷27・30・31・54頁で計8件を含む。配力筋は両方0件。',
  ],
}

const clauseEvidence = pdfEvidence.clauses as Record<string, {
  expected: string
  present: boolean
  pdfPage: number
  context: unknown
}>
const clauseChecks = Object.values(clauseEvidence)
const premise2: PremiseResult = {
  id: 'clauses-are-sufficient',
  status: clauseChecks.every(({ present }) => present) ? 'upheld' : 'refuted',
  evidence: Object.entries(clauseEvidence).map(([id, result]) => ({
    id,
    ...result,
  })),
}

const l3Cell = pdfEvidence.l3Cell as {
  image: string
  pdfPage: number
  printedPage: number
  spansInSlabColumn: Array<{ text: string; bbox: number[] }>
  sameColumnEvidence: boolean
  interpretation: string
}
const l3D10 = 10
const l3Cantilever = 25 * l3D10
const l3Minimum = 150
const premise3: PremiseResult = {
  id: 'l3-cell-structure',
  status: l3Cell.sameColumnEvidence ? 'refuted' : 'upheld',
  evidence: [
    {
      source: l3Cell,
      cellReading: l3Cell.interpretation,
      baseEntry: '10dかつ150mm以上',
      cantileverEntry: '25d',
      d10: l3D10,
      cantileverLengthMm: l3Cantilever,
      nominalMinimumMm: l3Minimum,
      minimumBindsForD10: l3Cantilever < l3Minimum,
      practicalImpact: 'D10でも25d=250mmなので150mmは結果を変えないが、表の意味として独立した片持下限とは読めない。',
    },
    '表5.3.4のL3スラブ欄は縦結合された単一セルで、10d・150mm以上・片持スラブの場合は25dが同じセル列にある。括弧는 그 셀의 예외값으로 전체 기본 기재를 대체한다.',
  ],
}

const laRows = jpMlitRulePack.entries.filter(({ key }) => key === 'anchorage.La')
const laLookup = lookupRule(jpMlitRulePack, 'anchorage.La', {
  fc: 24,
  grade: 'SD345',
  member: '床板',
})
const laReusable =
  laRows.length > 0 &&
  laRows.every(({ conditions }) => !('member' in conditions) && !('memberKind' in conditions)) &&
  laLookup.key === 'anchorage.La'
const premise4: PremiseResult = {
  id: 'la-rows-reusable',
  status: laReusable ? 'upheld' : 'refuted',
  evidence: [
    {
      rulepackFile: 'src/rulepack/jp-mlit/anchorage.yaml',
      rowCount: laRows.length,
      sampleConditions: laRows.slice(0, 3).map(({ conditions }) => conditions),
      memberConditionRows: laRows.filter(({ conditions }) => 'member' in conditions || 'memberKind' in conditions).length,
      lookup: {
        conditions: { fc: 24, grade: 'SD345', member: '床板' },
        key: laLookup.key,
        value: laLookup.value,
      },
    },
    sourceLine('src/rulepack/jp-mlit/anchorage.yaml', '- key: anchorage.La'),
  ],
}

const tipRule = lookupRule(jpMlitRulePack, 'measure.tip.length.addition', {})
const premise5: PremiseResult = {
  id: 'tip-rule-exists',
  status: tipRule.value === 0 && Object.keys(tipRule.conditions).length === 0 ? 'upheld' : 'refuted',
  evidence: [
    {
      key: tipRule.key,
      value: tipRule.value,
      conditions: tipRule.conditions,
      source: tipRule.source,
      confidence: tipRule.confidence,
    },
    sourceLine('src/rulepack/jp-mlit/measure.yaml', '- key: measure.tip.length.addition'),
  ],
}

const sectionFixture = JSON.parse(
  readFileSync('tests/fixtures/section-import/expected/yokohama-kanazawa-p15-slabs-walls.json', 'utf8'),
)
const cantileverList = sectionFixture.lists.find(
  (list: { listKind: string }) => list.listKind === '片持スラブリスト',
)
assert.ok(cantileverList)
const fixtureHasNoValues =
  cantileverList.scope === '対象外' &&
  (!cantileverList.entries || cantileverList.entries.length === 0) &&
  cantileverList.notes.some((note: string) => note.includes('전사 생략'))
const premise6: PremiseResult = {
  id: 'fixture-has-no-cantilever-values',
  status: fixtureHasNoValues ? 'upheld' : 'refuted',
  evidence: [
    {
      fixture: 'tests/fixtures/section-import/expected/yokohama-kanazawa-p15-slabs-walls.json',
      listKind: cantileverList.listKind,
      scope: cantileverList.scope,
      marks: cantileverList.marks,
      entryCount: cantileverList.entries?.length ?? 0,
      notes: cantileverList.notes,
    },
  ],
}

const sample = createSampleProject()
const slab = sample.members.find((member) => member.kind === '床板')
assert.ok(slab)
const completeBay = slabBay(sample, slab)
const completeRun = slabRun(sample, slab, 'X')
assert.ok(completeBay.supports.minX)
assert.ok(completeBay.supports.maxX)
assert.ok(completeBay.supports.minY)
assert.ok(completeBay.supports.maxY)
assert.equal(completeRun.startSupport.memberId, completeBay.supports.minX.memberId)
assert.equal(completeRun.endSupport.memberId, completeBay.supports.maxX.memberId)

const removedEndSupport = completeBay.supports.maxX.memberId
const missingSupportProject: Project = {
  ...sample,
  members: sample.members.filter(({ id }) => id !== removedEndSupport),
}
assert.throws(() => slabBay(missingSupportProject, slab), MemberUnsupportedError)
assert.throws(() => slabRun(missingSupportProject, slab, 'X'), MemberUnsupportedError)

const twoSupportSites = [
  {
    site: 'slabBay',
    requiredSupports: ['minX', 'maxX', 'minY', 'maxY'],
    source: sourceRange('src/domain/model/project.ts', 956, 960),
    runtime: 'Removing one edge 大梁 makes slabBay throw MemberUnsupportedError.',
  },
  {
    site: 'SlabRun interface and return',
    requiredSupports: ['startSupport', 'endSupport'],
    source: [
      sourceRange('src/domain/model/project.ts', 1017, 1020),
      sourceRange('src/domain/model/project.ts', 1111, 1133),
    ],
    runtime: 'The complete sample run exposes both support objects; a missing edge prevents run construction.',
  },
  {
    site: 'generateSlabRebar',
    requiredSupports: ['run.startSupport', 'run.endSupport'],
    source: sourceRange('src/domain/rebar/slab.ts', 206, 221),
    runtime: 'Both support objects are dereferenced and passed to resolveSlabEnd.',
  },
  {
    site: 'slab position geometry',
    requiredSupports: ['gridPoint(ix + 1, iy + 1)'],
    source: [
      sourceLine('src/domain/model/member.ts', 'export type SlabPosition = ColumnPosition'),
      sourceRange('src/domain/model/project.ts', 930, 932),
    ],
    runtime: 'No one-sided support position can be represented by the current bay/position shape.',
  },
]
const premise7: PremiseResult = {
  id: 'slab-run-assumes-two-supports',
  status: 'upheld',
  evidence: [
    ...twoSupportSites,
    {
      completeBaySupports: Object.keys(completeBay.supports),
      completeRunEnds: {
        startSupport: completeRun.startSupport.memberId,
        endSupport: completeRun.endSupport.memberId,
      },
      removedEndSupport,
      slabBayMissingSupportThrows: true,
      slabRunMissingSupportThrows: true,
    },
  ],
}

const premises = [premise1, premise2, premise3, premise4, premise5, premise6, premise7]
const refuted = premises.filter(({ status }) => status === 'refuted')
const report = {
  phase: '27-cantilever-slab',
  step: 0,
  verificationCommand: 'npx tsx phases/27-cantilever-slab/step0-verify.ts',
  premises,
  twoSupportSites,
  verdict: refuted.length > 0 ? 'refuted' : 'upheld',
  summary:
    refuted.length > 0
      ? `ADR-039 전제 ${refuted.map(({ id }) => id).join(', ')} 반증. 대상 코드는 수정하지 않았고 step 1은 진행하면 안 된다.`
      : 'ADR-039의 모든 전제를 원문·픽스처·실행으로 upheld 확인.',
}

writeFileSync(
  'phases/27-cantilever-slab/step0-report.json',
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
)
console.log(JSON.stringify({ verdict: report.verdict, refuted: refuted.map(({ id }) => id) }))
