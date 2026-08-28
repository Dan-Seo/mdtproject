import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { decodeStbBytes } from '@/lib/import/stb/decode'

const fixtureDirectory = resolve(
  process.cwd(),
  'tests/fixtures/stb-import/synthetic',
)

function fixtureBytes(file: string): Uint8Array {
  const source = readFileSync(resolve(fixtureDirectory, file))
  const bytes = new Uint8Array(source.byteLength)
  bytes.set(source)
  return bytes
}

function decodedText(file: string): string {
  const bytes = fixtureBytes(file)
  const result = decodeStbBytes(bytes.buffer as ArrayBuffer)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(`fixture did not decode: ${file}`)
  return result.text
}

function namesAndAttributes(text: string) {
  const elements = [
    ...text.matchAll(/<([A-Za-z][A-Za-z0-9_.-]*)(?=[\s/>])/gu),
  ].map((match) => match[1])
  const attributes = [
    ...text.matchAll(/\s([A-Za-z_][A-Za-z0-9_.:-]*)\s*=/gu),
  ].map((match) => match[1])

  return {
    elements: [...new Set(elements)].sort(),
    attributes: [...new Set(attributes)].sort(),
  }
}

describe('ST-Bridge synthetic fixture bytes', () => {
  it('mini-sjis.stb is not valid UTF-8', () => {
    const bytes = fixtureBytes('mini-sjis.stb')

    expect(() =>
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    ).toThrow()
  })

  it('mini-utf8.stb is valid UTF-8', () => {
    expect(() =>
      new TextDecoder('utf-8', { fatal: true }).decode(
        fixtureBytes('mini-utf8.stb'),
      ),
    ).not.toThrow()
  })

  it('keeps element and attribute name sets identical', () => {
    expect(namesAndAttributes(decodedText('mini-sjis.stb'))).toEqual(
      namesAndAttributes(decodedText('mini-utf8.stb')),
    )
  })
})
