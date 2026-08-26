import { compact } from './runs'

const STORY_TOKEN_PATTERN = /(?:RF|R階|\d+(?:F|階))/g

function canonicalNumber(value: string): string {
  return value.replace(/^0+(?=\d)/, '')
}

/**
 * Return the canonical key for a supported story label.
 *
 * The input is compacted before the exact match so labels from PDF text such
 * as full-width digits or separated glyphs follow the same rule as the
 * framing-plan parser. Unsupported labels deliberately return undefined.
 */
export function storyKey(label: string): string | undefined {
  const value = compact(label)
  if (value === 'RF' || value === 'R階') return 'R'

  const numeric = value.match(/^(\d+)(?:F|階)$/)?.[1]
  return numeric === undefined ? undefined : canonicalNumber(numeric)
}

function isStandaloneStoryToken(text: string, index: number): boolean {
  const previous = text[index - 1]
  if (previous !== undefined && /[A-Za-z0-9]/.test(previous)) return false

  // 「地下1階」 is an unsupported basement label, not the supported token
  // 「1階」 embedded in a longer label.
  return text.slice(Math.max(0, index - 2), index) !== '地下'
}

/**
 * Extract a supported story token from a framing-plan title.
 *
 * A title may repeat an equivalent token (for example, 「2階 ... 2F」), but
 * different canonical keys make the title ambiguous and are rejected.
 */
export function storyLabelFromTitle(title: string): string | undefined {
  const value = compact(title)
  const tokens: Array<{ label: string; key: string }> = []
  const pattern = new RegExp(STORY_TOKEN_PATTERN.source, 'g')
  let match: RegExpExecArray | null

  while ((match = pattern.exec(value)) !== null) {
    const label = match[0]
    const index = match.index
    if (!isStandaloneStoryToken(value, index)) continue

    const key = storyKey(label)
    if (key !== undefined) tokens.push({ label, key })
  }

  if (tokens.length === 0) return undefined

  const keys = new Set(tokens.map((token) => token.key))
  return keys.size === 1 ? tokens[0].label : undefined
}
