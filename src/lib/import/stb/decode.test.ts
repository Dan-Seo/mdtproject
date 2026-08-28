import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { decodeStbBytes } from './decode'

const fixtureDirectory = resolve(
  process.cwd(),
  'tests/fixtures/stb-import/synthetic',
)

function fixtureBytes(file: string): ArrayBuffer {
  const source = readFileSync(resolve(fixtureDirectory, file))
  const bytes = new Uint8Array(source.byteLength)
  bytes.set(source)
  return bytes.buffer
}

function textBytes(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer
}

function successful(result: ReturnType<typeof decodeStbBytes>) {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error('expected a successful decode')
  return result
}

function withoutEncodingLabel(text: string): string {
  return text.replace(
    /(<\?xml\b[^?]*?\bencoding\s*=\s*["'])[^"']+(["'])/iu,
    '$1<normalized>$2',
  )
}

describe('decodeStbBytes', () => {
  it('decodes the real CP932 bytes in the Shift_JIS fixture', () => {
    const result = successful(decodeStbBytes(fixtureBytes('mini-sjis.stb')))

    expect(result.encoding).toBe('shift_jis')
    expect(result.text).toContain('基準階サンプル')
  })

  it('decodes the UTF-8 fixture to the same text', () => {
    const sjis = successful(decodeStbBytes(fixtureBytes('mini-sjis.stb')))
    const utf8 = successful(decodeStbBytes(fixtureBytes('mini-utf8.stb')))

    expect(utf8.encoding).toBe('utf-8')
    expect(utf8.text).toContain('基準階サンプル')
    expect(withoutEncodingLabel(utf8.text)).toBe(
      withoutEncodingLabel(sjis.text),
    )
  })

  it('does not treat the Shift_JIS bytes as UTF-8', () => {
    const bytes = new Uint8Array(fixtureBytes('mini-sjis.stb'))
    const forcedUtf8 = new TextDecoder('utf-8').decode(bytes)

    expect(forcedUtf8).not.toContain('基準階サンプル')
  })

  it('defaults to UTF-8 when the XML declaration is absent', () => {
    const result = successful(
      decodeStbBytes(textBytes('<ST_BRIDGE version="2.0.2" />')),
    )

    expect(result.encoding).toBe('utf-8')
  })

  it('defaults to UTF-8 when the declaration has no encoding attribute', () => {
    const result = successful(
      decodeStbBytes(textBytes('<?xml version="1.0"?><ST_BRIDGE />')),
    )

    expect(result.encoding).toBe('utf-8')
  })

  it('normalizes all supported UTF-8 and Shift_JIS labels', () => {
    const labels: Array<[string, 'utf-8' | 'shift_jis']> = [
      ['utf8', 'utf-8'],
      ['utf-8', 'utf-8'],
      ['Shift_JIS', 'shift_jis'],
      ['shift-jis', 'shift_jis'],
      ['sjis', 'shift_jis'],
      ['windows-31j', 'shift_jis'],
    ]

    for (const [label, expected] of labels) {
      const result = successful(
        decodeStbBytes(
          textBytes(`<?xml version="1.0" encoding="${label}"?><ST_BRIDGE />`),
        ),
      )

      expect(result.encoding).toBe(expected)
    }
  })

  it('returns an issue for an unsupported declaration without throwing', () => {
    expect(
      decodeStbBytes(
        textBytes(
          '<?xml version="1.0" encoding="EUC-JP"?><ST_BRIDGE />',
        ),
      ),
    ).toEqual({
      ok: false,
      issue: '未対応エンコーディング',
      declared: 'EUC-JP',
    })
  })
})
