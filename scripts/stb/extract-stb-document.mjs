/**
 * Extracts the browser-only ST-Bridge XML intermediate representation.
 *
 * Run with: npx tsx scripts/stb/extract-stb-document.mjs
 * The source .stb files are local-only files in .cache/stb and are not committed.
 */

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '../..')
const cacheDirectory = resolve(repositoryRoot, '.cache/stb')
const outputDirectory = resolve(
  repositoryRoot,
  'tests/fixtures/stb-import/document',
)

const targets = [
  'dotnet-sample1.stb',
  'diffchecker-filea.stb',
  'hoaryfox-sample.stb',
  'diffchecker-mini210.stb',
]

globalThis.DOMParser = new (await import('jsdom')).JSDOM().window.DOMParser
const { decodeStbBytes } = await import('../../src/lib/import/stb/decode.ts')
const { parseStbDocument } = await import(
  '../../src/lib/import/stb/document.ts',
)

function sha256(data) {
  return createHash('sha256').update(data).digest('hex')
}

function toArrayBuffer(data) {
  const bytes = new Uint8Array(data.byteLength)
  bytes.set(data)
  return bytes.buffer
}

await mkdir(outputDirectory, { recursive: true })

for (const file of targets) {
  const data = await readFile(resolve(cacheDirectory, file))
  const decoded = decodeStbBytes(toArrayBuffer(data))
  if (!decoded.ok) {
    throw new Error(`could not decode ${file}: ${decoded.declared}`)
  }

  const document = parseStbDocument(decoded.text, decoded.encoding)
  const output = {
    _source: { file, sha256: sha256(data) },
    ...document,
  }
  const outputPath = resolve(
    outputDirectory,
    file.replace(/\.stb$/u, '.json'),
  )

  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
  console.log(`${file}: ${document.axisGroups.length} axis groups, ${document.stories.length} stories, ${document.nodes.length} nodes`)
}
