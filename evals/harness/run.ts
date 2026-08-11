// 라이브 회귀 게이트 — 네트워크·비용이 드는 유일한 진입점 (npm run eval).
// golden set을 subject(Sonnet·temp0)에 돌리고 judge(Opus)가 pass/fail을 채점한다.
// 하나라도 실패하면 exit 1. 실행 오류도 fail-closed로 실패에 계상한다.
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import Anthropic from '@anthropic-ai/sdk'

import { validateCaseSet, type EvalCase } from './lib/cases'
import { loadCases } from './lib/load'
import { formatSummary, summarize, type CaseResult } from './lib/report'
import { parseVerdict, type Verdict } from './lib/verdict'
import {
  JUDGE_SYSTEM,
  REVIEWER_SYSTEM,
  qaJudgePrompt,
  qaSystem,
  reviewJudgePrompt,
} from './prompts'

const here = dirname(fileURLToPath(import.meta.url))

// subject는 temp0 요구 때문에 Sonnet 4.6이다 — Sonnet 5는 sampling 파라미터를
// 400으로 거부하므로, 모델을 올리려면 temperature를 함께 제거해야 한다.
export const SUBJECT_MODEL = 'claude-sonnet-4-6'
export const JUDGE_MODEL = 'claude-opus-5'

export const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    pass: { type: 'boolean' },
    reason: { type: 'string' },
  },
  required: ['pass', 'reason'],
  additionalProperties: false,
} as const

export function reviewerRequest(body: string) {
  return {
    model: SUBJECT_MODEL,
    max_tokens: 2000,
    temperature: 0,
    system: REVIEWER_SYSTEM,
    messages: [{ role: 'user' as const, content: body }],
  }
}

export function qaRequest(body: string, claudeMd: string) {
  return {
    model: SUBJECT_MODEL,
    max_tokens: 2000,
    temperature: 0,
    system: qaSystem(claudeMd),
    messages: [{ role: 'user' as const, content: body }],
  }
}

export function judgeRequest(prompt: string) {
  return {
    model: JUDGE_MODEL,
    max_tokens: 16000,
    // Opus 5 안전 분류기의 드문 오탐(refusal)이 게이트를 흔들지 않도록 서버측 폴백을 켠다
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default' as const,
    system: JUDGE_SYSTEM,
    output_config: {
      format: { type: 'json_schema' as const, schema: VERDICT_SCHEMA },
    },
    messages: [{ role: 'user' as const, content: prompt }],
  }
}

export function extractText(
  blocks: ReadonlyArray<{ type: string; text?: string }>,
): string {
  return blocks
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('')
}

async function runCase(
  client: Anthropic,
  c: EvalCase,
  claudeMd: string,
): Promise<Verdict> {
  const subjectParams =
    c.track === 'review' ? reviewerRequest(c.body) : qaRequest(c.body, claudeMd)
  const subjectRes = await client.messages.create(subjectParams)
  if (subjectRes.stop_reason === 'refusal')
    throw new Error('subject가 refusal로 종료됨')
  const subjectOut = extractText(subjectRes.content)

  const prompt =
    c.track === 'review'
      ? reviewJudgePrompt(c, subjectOut)
      : qaJudgePrompt(c, subjectOut)
  const judgeRes = await client.beta.messages.create(judgeRequest(prompt))
  if (judgeRes.stop_reason === 'refusal')
    throw new Error('judge가 refusal로 종료됨 (폴백 체인 전체 거부)')
  return parseVerdict(extractText(judgeRes.content))
}

async function main(): Promise<void> {
  const cases = loadCases(join(here, 'cases'))
  const problems = validateCaseSet(cases)
  if (problems.length > 0) {
    console.error('golden set 무결성 검증 실패:')
    for (const p of problems) console.error(`  - ${p}`)
    process.exit(1)
  }

  const claudeMd = readFileSync(join(here, '..', '..', 'CLAUDE.md'), 'utf8')
  // 500/529 같은 일시 장애로 게이트가 흔들리지 않게 재시도를 올린다 (SDK 기본 2회로 부족했음)
  const client = new Anthropic({ maxRetries: 5 })
  const results: CaseResult[] = []

  console.log(
    `eval 시작: ${cases.length} cases (subject=${SUBJECT_MODEL}, judge=${JUDGE_MODEL})\n`,
  )

  for (const [i, c] of cases.entries()) {
    let result: CaseResult
    try {
      const verdict = await runCase(client, c, claudeMd)
      result = { id: c.id, track: c.track, ...verdict }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes('Could not resolve authentication method')) {
        console.error(
          '\nAPI 인증 정보가 없다 — ANTHROPIC_API_KEY를 설정하고 다시 실행하라.',
        )
        process.exit(1)
      }
      result = {
        id: c.id,
        track: c.track,
        pass: false,
        reason: `실행 오류: ${message}`,
      }
    }
    results.push(result)
    console.log(
      `[${i + 1}/${cases.length}] ${result.pass ? 'PASS' : 'FAIL'}  ${c.track}/${c.id}${
        result.pass ? '' : ` — ${result.reason}`
      }`,
    )
  }

  console.log(`\n${formatSummary(results)}`)
  process.exit(summarize(results).exitCode)
}

// vitest가 import할 때는 실행하지 않는다 — 직접 실행(tsx evals/harness/run.ts)일 때만.
const isDirectRun =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]).toLowerCase() ===
    fileURLToPath(import.meta.url).toLowerCase()

if (isDirectRun) {
  await main()
}
