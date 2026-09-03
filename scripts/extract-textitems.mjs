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

import { pdfDocumentOptions } from '../src/lib/import/pdf-text.ts'
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
const pdfjsAssetDirectory = `${resolve(repositoryRoot, 'node_modules/pdfjs-dist')}/`

// 표제란(도면 우하단 블록) 제외 사각형은 생성기와 검증 테스트가 한 파일을 본다 —
// 여기에만 적으면 재생성 때 경계가 바뀌어도 픽스처 검증이 눈치채지 못한다.
const exclusionsPath = resolve(
  repositoryRoot,
  'tests/fixtures/section-import/title-block-exclusions.json',
)

const targets = [
  { cacheFile: 'dwg-ojkk-zumen6.pdf', page: 2, output: 'ojkk-p2.json' },
  { cacheFile: 'dwg-ojkk-zumen6.pdf', page: 3, output: 'ojkk-p3.json' },
  { cacheFile: 'dwg-yokohama.pdf', page: 13, output: 'yokohama-p13.json' },
  { cacheFile: 'dwg-yokohama.pdf', page: 14, output: 'yokohama-p14.json' },
  { cacheFile: 'dwg-yokohama.pdf', page: 7, output: 'yokohama-p7.json' },
  { cacheFile: 'dwg-yokohama.pdf', page: 8, output: 'yokohama-p8.json' },
  { cacheFile: 'dwg-kani-kids.pdf', page: 38, output: 'kani-p38.json' },
  { cacheFile: 'dwg-kani-kids.pdf', page: 40, output: 'kani-p40.json' },
  { cacheFile: 'dwg-yokohama.pdf', page: 6, output: 'yokohama-p6.json' },
  { cacheFile: 'dwg-yokohama.pdf', page: 9, output: 'yokohama-p9.json' },
  { cacheFile: 'dwg-yokohama.pdf', page: 15, output: 'yokohama-p15.json' },
  { cacheFile: 'dwg-ojkk-zumen6.pdf', page: 4, output: 'ojkk-p4.json' },
  { cacheFile: 'dwg-kani-kids.pdf', page: 39, output: 'kani-p39.json' },
  { cacheFile: 'dwg-kani-kids.pdf', page: 41, output: 'kani-p41.json' },
  { cacheFile: 'dwg-karatsu-fukuzu.pdf', page: 1, output: 'karatsu-fukuzu-p1.json' },
  { cacheFile: 'dwg-karatsu-shousai.pdf', page: 1, output: 'karatsu-shousai-p1.json' },
  { cacheFile: 'dwg-karatsu-hashirashin.pdf', page: 1, output: 'karatsu-hashirashin-p1.json' },
  { cacheFile: 'dwg-karatsu-jikugumi1.pdf', page: 1, output: 'karatsu-jikugumi1-p1.json' },
  { cacheFile: 'dwg-karatsu-jikugumi2.pdf', page: 1, output: 'karatsu-jikugumi2-p1.json' },
  { cacheFile: 'dwg-fuji-kanritou.pdf', page: 15, output: 'fuji-p15.json' },
  { cacheFile: 'dwg-fuji-kanritou.pdf', page: 17, output: 'fuji-p17.json' },
  { cacheFile: 'dwg-fuji-kanritou.pdf', page: 18, output: 'fuji-p18.json' },
  { cacheFile: 'dwg-fuji-kanritou.pdf', page: 20, output: 'fuji-p20.json' },
  { cacheFile: 'dwg-ina-pump.pdf', page: 6, output: 'ina-p6.json' },
  { cacheFile: 'dwg-ina-pump.pdf', page: 7, output: 'ina-p7.json' },
  { cacheFile: 'dwg-saiki-fire.pdf', page: 1, output: 'saiki-p1.json' },
  { cacheFile: 'dwg-saiki-fire.pdf', page: 2, output: 'saiki-p2.json' },
  { cacheFile: 'dwg-tsu-kanritou.pdf', page: 16, output: 'tsu-p16.json' },
  { cacheFile: 'dwg-tsu-kanritou.pdf', page: 20, output: 'tsu-p20.json' },
  { cacheFile: 'dwg-tsu-kanritou.pdf', page: 21, output: 'tsu-p21.json' },
  { cacheFile: 'dwg-tsu-kanritou.pdf', page: 22, output: 'tsu-p22.json' },
  { cacheFile: 'dwg-hirosaki-kikyono.pdf', page: 21, output: 'hirosaki-p21.json' },
  { cacheFile: 'dwg-hirosaki-kikyono.pdf', page: 25, output: 'hirosaki-p25.json' },
  { cacheFile: 'dwg-shibata-fire.pdf', page: 1, output: 'shibata-p1.json' },
  { cacheFile: 'dwg-shibata-fire.pdf', page: 7, output: 'shibata-p7.json' },
  { cacheFile: 'dwg-shibata-fire.pdf', page: 13, output: 'shibata-p13.json' },
]

async function titleBlockExclusions() {
  const { pages } = JSON.parse(await readFile(exclusionsPath, 'utf8'))

  for (const { output } of targets) {
    if (!pages[output]) {
      throw new Error(`title-block exclusion not defined for ${output}`)
    }
  }

  return pages
}

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

async function extractFixtures(sources, exclusions) {
  const fixtures = []

  for (const [cacheFile, source] of sources) {
    // pdfjs-dist 6.x legacy builds disable Web Workers automatically in Node
    // and use the in-process fake-worker path. useWorkerFetch additionally
    // prevents worker-side resource fetching for this local-only extraction.
    const loadingTask = getDocument(
      pdfDocumentOptions(new Uint8Array(source.data), pdfjsAssetDirectory),
    )
    const pdfDocument = await loadingTask.promise

    try {
      const sourceTargets = targets.filter(
        (target) => target.cacheFile === cacheFile,
      )

      for (const target of sourceTargets) {
        const excludeFrom = exclusions[target.output]
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
              ({ x, y }) => !(x >= excludeFrom.x && y >= excludeFrom.y),
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
  const fixtures = await extractFixtures(sources, await titleBlockExclusions())

  await mkdir(outputDirectory, { recursive: true })
  for (const { output, fixture } of fixtures) {
    const serialized = `${JSON.stringify(fixture, null, 2)}\n`
    await writeFile(resolve(outputDirectory, output), serialized, 'utf8')
    console.log(`${output}: ${fixture.items.length} items`)
  }
}

await main()
