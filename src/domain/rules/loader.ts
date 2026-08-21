import { load } from 'js-yaml'

import type {
  ResolvedSource,
  RuleEntry,
  RulePack,
} from './types'

interface SourceDefinition {
  short: string
  doc: string
  edition: string | null
  publisher: string
  url: string | null
}

type SourceDictionary = Record<string, SourceDefinition>

const REQUIRED_ENTRY_FIELDS = [
  'key',
  'label',
  'value',
  'unit',
  'source',
  'confidence',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fail(fileName: string, key: string, reason: string): never {
  throw new Error(`Rule pack ${fileName} [${key}]: ${reason}`)
}

function parseRequiredString(
  value: unknown,
  fileName: string,
  key: string,
  field: string,
): string {
  if (typeof value !== 'string' || value.length === 0) {
    fail(fileName, key, `${field} must be a non-empty string`)
  }
  return value
}

function parseNullableString(
  value: unknown,
  fileName: string,
  key: string,
  field: string,
): string | null {
  if (value === null) return null
  if (typeof value !== 'string' || value.length === 0) {
    fail(fileName, key, `${field} must be a non-empty string or null`)
  }
  return value
}

function parseSources(sourceYaml: string): SourceDictionary {
  const fileName = 'sources.yaml'
  const parsed: unknown = load(sourceYaml)
  if (!isRecord(parsed)) {
    fail(fileName, '<sources>', 'expected a source dictionary')
  }

  return Object.fromEntries(
    Object.entries(parsed).map(([ref, value]) => {
      if (!isRecord(value)) {
        fail(fileName, ref, 'source definition must be an object')
      }

      return [
        ref,
        {
          short: parseRequiredString(value.short, fileName, ref, 'short'),
          doc: parseRequiredString(value.doc, fileName, ref, 'doc'),
          edition: parseNullableString(
            value.edition,
            fileName,
            ref,
            'edition',
          ),
          publisher: parseRequiredString(
            value.publisher,
            fileName,
            ref,
            'publisher',
          ),
          url: parseNullableString(value.url, fileName, ref, 'url'),
        },
      ]
    }),
  )
}

function parseConditions(
  value: unknown,
  fileName: string,
  key: string,
): RuleEntry['conditions'] {
  if (value === undefined) return {}
  if (!isRecord(value)) {
    fail(fileName, key, 'conditions must be an object')
  }

  const conditions: RuleEntry['conditions'] = {}
  for (const [condition, conditionValue] of Object.entries(value)) {
    if (
      typeof conditionValue !== 'string' &&
      typeof conditionValue !== 'number' &&
      typeof conditionValue !== 'boolean'
    ) {
      fail(
        fileName,
        key,
        `condition ${condition} must be a string, number, or boolean`,
      )
    }
    conditions[condition] = conditionValue
  }
  return conditions
}

function resolveSource(
  raw: unknown,
  sources: SourceDictionary,
  fileName: string,
  key: string,
): ResolvedSource {
  if (!isRecord(raw) || typeof raw.ref !== 'string') {
    fail(fileName, key, 'source.ref must be a string')
  }

  const definition = sources[raw.ref]
  if (!definition) {
    fail(fileName, key, `unknown source.ref ${raw.ref}`)
  }

  const section = parseNullableString(
    raw.section ?? null,
    fileName,
    key,
    'source.section',
  )
  const page = raw.page ?? null
  if (page !== null && (typeof page !== 'number' || !Number.isFinite(page))) {
    fail(fileName, key, 'source.page must be a number or null')
  }

  return { ...definition, section, page }
}

function parseEntry(
  raw: unknown,
  sources: SourceDictionary,
  fileName: string,
): RuleEntry {
  if (!isRecord(raw)) {
    fail(fileName, '<unknown>', 'entry must be an object')
  }

  const key = typeof raw.key === 'string' ? raw.key : '<unknown>'
  for (const field of REQUIRED_ENTRY_FIELDS) {
    if (!(field in raw) || raw[field] === undefined || raw[field] === null) {
      fail(fileName, key, `missing required field ${field}`)
    }
  }

  if (typeof raw.key !== 'string' || raw.key.length === 0) {
    fail(fileName, key, 'key must be a non-empty string')
  }
  if (typeof raw.label !== 'string' || raw.label.length === 0) {
    fail(fileName, key, 'label must be a non-empty string')
  }
  if (typeof raw.value !== 'number' || !Number.isFinite(raw.value)) {
    fail(fileName, key, 'value must be a finite number')
  }
  if (typeof raw.unit !== 'string' || raw.unit.length === 0) {
    fail(fileName, key, 'unit must be a non-empty string')
  }
  if (
    raw.confidence !== 'stated' &&
    raw.confidence !== 'transcribed' &&
    raw.confidence !== 'inferred'
  ) {
    fail(
      fileName,
      key,
      "confidence must be 'stated', 'transcribed' or 'inferred'",
    )
  }

  const source = resolveSource(raw.source, sources, fileName, key)
  // 원문에 있다고 주장하는 등급은 어느 쪽 쪽수인지 반드시 대야 한다 —
  // 쪽수 없는 「원문 명시」는 대조할 수 없어서 주장만 남는다.
  if (
    (raw.confidence === 'stated' || raw.confidence === 'transcribed') &&
    source.page === null
  ) {
    fail(
      fileName,
      key,
      `confidence '${raw.confidence}' requires source.page`,
    )
  }

  if (raw.expr !== undefined && typeof raw.expr !== 'string') {
    fail(fileName, key, 'expr must be a string')
  }
  if (raw.note !== undefined && typeof raw.note !== 'string') {
    fail(fileName, key, 'note must be a string')
  }

  return {
    key: raw.key,
    label: raw.label,
    expr: raw.expr ?? '',
    conditions: parseConditions(raw.conditions, fileName, key),
    value: raw.value,
    unit: raw.unit,
    source,
    confidence: raw.confidence,
    note: raw.note ?? '',
  }
}

function conditionsSignature(conditions: RuleEntry['conditions']): string {
  return JSON.stringify(
    Object.entries(conditions).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  )
}

export function parseRulePack(files: Record<string, string>): RulePack {
  const sourceYaml = files['sources.yaml']
  if (sourceYaml === undefined) {
    fail('sources.yaml', '<sources>', 'file is required')
  }
  const sources = parseSources(sourceYaml)
  const entries: RuleEntry[] = []
  const seen = new Map<string, string>()

  for (const [fileName, yaml] of Object.entries(files)) {
    if (fileName === 'sources.yaml') continue

    const parsed: unknown = load(yaml)
    if (!Array.isArray(parsed)) {
      fail(fileName, '<unknown>', 'expected a list of rule entries')
    }

    for (const raw of parsed) {
      const entry = parseEntry(raw, sources, fileName)
      const signature = `${entry.key}\u0000${conditionsSignature(entry.conditions)}`
      const firstFile = seen.get(signature)
      if (firstFile) {
        fail(
          fileName,
          entry.key,
          `duplicate key and conditions (first declared in ${firstFile})`,
        )
      }
      seen.set(signature, fileName)
      entries.push(entry)
    }
  }

  return { id: 'jp-mlit', entries }
}
