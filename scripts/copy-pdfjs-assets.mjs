import { cp, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '..')
const sourceRoot = resolve(repositoryRoot, 'node_modules/pdfjs-dist')
const destinationRoot = resolve(repositoryRoot, 'public/pdfjs')

await mkdir(destinationRoot, { recursive: true })
await Promise.all(
  ['cmaps', 'standard_fonts'].map((directory) =>
    cp(
      resolve(sourceRoot, directory),
      resolve(destinationRoot, directory),
      { recursive: true, force: true },
    ),
  ),
)
