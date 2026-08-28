import type { StbEncoding } from './types'

export type StbDecodeResult =
  | { ok: true; text: string; encoding: StbEncoding }
  | {
      ok: false
      issue: '未対応エンコーディング'
      declared: string
    }

function declaredEncoding(bytes: ArrayBuffer): string | undefined {
  const prefix = new TextDecoder('latin1').decode(
    new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 512)),
  )
  const declaration = prefix.match(/<\?xml\b[^?]*?\?>/iu)?.[0]
  return declaration?.match(/\bencoding\s*=\s*["']([^"']+)["']/iu)?.[1]
}

function normalizeEncoding(label: string | undefined): StbEncoding | undefined {
  if (!label) return 'utf-8'

  switch (label.trim().toLowerCase()) {
    case 'utf8':
    case 'utf-8':
      return 'utf-8'
    case 'shift_jis':
    case 'shift-jis':
    case 'sjis':
    case 'windows-31j':
      return 'shift_jis'
    default:
      return undefined
  }
}

export function decodeStbBytes(bytes: ArrayBuffer): StbDecodeResult {
  const declared = declaredEncoding(bytes)
  const encoding = normalizeEncoding(declared)

  if (!encoding) {
    return {
      ok: false,
      issue: '未対応エンコーディング',
      declared: declared ?? '',
    }
  }

  return {
    ok: true,
    text: new TextDecoder(encoding).decode(new Uint8Array(bytes)),
    encoding,
  }
}
