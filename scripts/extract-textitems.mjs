/**
 * Output JSON schema:
 * {
 *   source: { cacheFile: string, sha256: string, page: number },
 *   page: { widthPt: number, heightPt: number },
 *   items: Array<{ str: string, x: number, y: number, w: number, h: number, rot?: number }>
 * }
 * Coordinates use a top-left origin, positive y points down, and all values are pt.
 */

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { getDocument, Util } from 'pdfjs-dist/legacy/build/pdf.mjs'

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

const targets = [
  { cacheFile: 'dwg-ojkk-zumen6.pdf', page: 2, output: 'ojkk-p2.json' },
  { cacheFile: 'dwg-ojkk-zumen6.pdf', page: 3, output: 'ojkk-p3.json' },
  { cacheFile: 'dwg-yokohama.pdf', page: 13, output: 'yokohama-p13.json' },
  { cacheFile: 'dwg-yokohama.pdf', page: 14, output: 'yokohama-p14.json' },
  { cacheFile: 'dwg-kani-kids.pdf', page: 38, output: 'kani-p38.json' },
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

function rotationDegrees(transform) {
  const [, b, c] = transform
  const epsilon = Number.EPSILON * 10

  if (Math.abs(b) <= epsilon && Math.abs(c) <= epsilon) {
    return undefined
  }

  return (Math.atan2(b, transform[0]) * 180) / Math.PI
}

function textItemsFor(textContent, viewport) {
  return textContent.items.flatMap((item) => {
    if (typeof item.str !== 'string' || item.str.trim() === '') {
      return []
    }

    const transform = Util.transform(viewport.transform, item.transform)
    const characters = Array.from(item.str)
    const characterWidth = item.width / characters.length
    const baselineScale = Math.hypot(transform[0], transform[1])
    const directionX = baselineScale === 0 ? 0 : transform[0] / baselineScale
    const directionY = baselineScale === 0 ? 0 : transform[1] / baselineScale
    const rot = rotationDegrees(transform)

    return characters.flatMap((str, index) => {
      if (str.trim() === '') {
        return []
      }

      const extracted = {
        str,
        x: transform[4] + directionX * characterWidth * index,
        y: transform[5] + directionY * characterWidth * index,
        w: characterWidth,
        h: item.height,
      }

      return rot === undefined ? [extracted] : [{ ...extracted, rot }]
    })
  })
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
            items: textItemsFor(textContent, viewport),
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
