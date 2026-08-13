/**
 * Output JSON schema:
 * {
 *   source: { cacheFile: string, sha256: string, page: number },
 *   page: { widthPt: number, heightPt: number },
 *   items: Array<{ str: string, x: number, y: number, w: number, h: number, rot?: number }>
 * }
 * Coordinates use a top-left origin, positive y points down, and all values are pt.
 *
 * 실행: npx tsx scripts/extract-textitems.mjs
 * (좌표 변환을 프로덕션 추출기와 공유하려고 TS 모듈을 import한다 — plain node로는 안 돈다)
 */

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

import { toTextItems } from '../src/lib/import/textitems.ts'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '..')
const sourceDocumentPath = resolve(
  repositoryRoot,
  'tests/fixtures/section-import/SOURCES.md',
)
const cacheDirectory = resolve(repositoryRoot, '.cache')
const outputDirectory = resolve(
  repositoryRoot,
  'tests/fixtures/section-import/textitems',
)

// excludeFrom: 표제란(도면 우하단 블록)의 좌상단 모서리 — 이 사각형(x≥, y≥ 동시
// 충족)의 아이템은 픽스처에서 떨어낸다. 표제란에는 건축사 실명·사무소 주소·연락처가
// 들어 있어 그대로 커밋하면 SOURCES.md가 금지한 원본 재배포와 다를 게 없다.
// 경계는 각 페이지의 표 내용 최대 x/y와 표제란 최소 x/y 사이에서 실측으로 잡았다
// (근거는 tests/fixtures/section-import/SOURCES.md의 표제란 제외 절).
const targets = [
  {
    cacheFile: 'dwg-ojkk-zumen6.pdf',
    page: 2,
    output: 'ojkk-p2.json',
    excludeFrom: { x: 660, y: 715 },
  },
  {
    cacheFile: 'dwg-ojkk-zumen6.pdf',
    page: 3,
    output: 'ojkk-p3.json',
    excludeFrom: { x: 660, y: 715 },
  },
  {
    cacheFile: 'dwg-yokohama.pdf',
    page: 13,
    output: 'yokohama-p13.json',
    excludeFrom: { x: 1850, y: 1540 },
  },
  {
    cacheFile: 'dwg-yokohama.pdf',
    page: 14,
    output: 'yokohama-p14.json',
    excludeFrom: { x: 1850, y: 1540 },
  },
  {
    cacheFile: 'dwg-kani-kids.pdf',
    page: 38,
    output: 'kani-p38.json',
    excludeFrom: { x: 480, y: 1095 },
  },
]

function expectedSha256(sourceDocument, cacheFile) {
  const row = sourceDocument
    .split(/\r?\n/u)
    .find((line) => line.includes(`\`${cacheFile}\``))
  const sha256 = row?.match(/`([a-f\d]{64})`/u)?.[1]

  if (!sha256) {
    throw new Error(`SHA-256 not found in SOURCES.md for ${cacheFile}`)
  }

  return sha256
}

function sha256(data) {
  return createHash('sha256').update(data).digest('hex')
}

// 좌표 변환은 프로덕션 추출기(src/lib/import/pdf-text.ts)와 공유한다 —
// 규약이 갈라지면 CI 픽스처가 제품 입력을 검증하지 못한다.
function textItemsFor(textContent, viewport) {
  return toTextItems(
    textContent.items.filter((item) => typeof item.str === 'string'),
    viewport.transform,
  )
}

async function verifiedSources() {
  const sourceDocument = await readFile(sourceDocumentPath, 'utf8')
  const cacheFiles = [...new Set(targets.map(({ cacheFile }) => cacheFile))]
  const sources = new Map()

  for (const cacheFile of cacheFiles) {
    const expected = expectedSha256(sourceDocument, cacheFile)
    const data = await readFile(resolve(cacheDirectory, cacheFile))
    const actual = sha256(data)

    if (actual !== expected) {
      throw new Error(
        `SHA-256 mismatch for ${cacheFile}: expected ${expected}, received ${actual}`,
      )
    }

    sources.set(cacheFile, { data, sha256: expected })
  }

  return sources
}

async function extractFixtures(sources) {
  const fixtures = []

  for (const [cacheFile, source] of sources) {
    // pdfjs-dist 6.x legacy builds disable Web Workers automatically in Node
    // and use the in-process fake-worker path. useWorkerFetch additionally
    // prevents worker-side resource fetching for this local-only extraction.
    const loadingTask = getDocument({
      data: new Uint8Array(source.data),
      useWorkerFetch: false,
    })
    const pdfDocument = await loadingTask.promise

    try {
      const sourceTargets = targets.filter(
        (target) => target.cacheFile === cacheFile,
      )

      for (const target of sourceTargets) {
        const pdfPage = await pdfDocument.getPage(target.page)

        try {
          const viewport = pdfPage.getViewport({ scale: 1 })
          const textContent = await pdfPage.getTextContent()
          const fixture = {
            $comment:
              'Schema: source{cacheFile,sha256,page}; page{widthPt,heightPt}; items[{str,x,y,w,h,rot?}]. Coordinates: top-left origin, +y downward, pt.',
            source: {
              cacheFile,
              sha256: source.sha256,
              page: target.page,
            },
            page: {
              widthPt: viewport.width,
              heightPt: viewport.height,
            },
            items: textItemsFor(textContent, viewport).filter(
              ({ x, y }) =>
                !(x >= target.excludeFrom.x && y >= target.excludeFrom.y),
            ),
          }

          fixtures.push({ output: target.output, fixture })
        } finally {
          pdfPage.cleanup()
        }
      }
    } finally {
      await loadingTask.destroy()
    }
  }

  return fixtures
}

async function main() {
  const sources = await verifiedSources()
  const fixtures = await extractFixtures(sources)

  await mkdir(outputDirectory, { recursive: true })
  for (const { output, fixture } of fixtures) {
    const serialized = `${JSON.stringify(fixture, null, 2)}\n`
    await writeFile(resolve(outputDirectory, output), serialized, 'utf8')
    console.log(`${output}: ${fixture.items.length} items`)
  }
}

await main()
