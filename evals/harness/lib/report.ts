export type CaseResult = {
  id: string
  track: 'review' | 'qa'
  pass: boolean
  reason: string
}

export type Summary = {
  total: number
  passed: number
  failed: CaseResult[]
  /** 실패가 있거나 결과가 비어 있으면 1 — 빈 실행이 초록으로 통과하지 않는다 */
  exitCode: 0 | 1
}

export function summarize(results: CaseResult[]): Summary {
  const failed = results.filter((r) => !r.pass)
  return {
    total: results.length,
    passed: results.length - failed.length,
    failed,
    exitCode: results.length === 0 || failed.length > 0 ? 1 : 0,
  }
}

export function formatSummary(results: CaseResult[]): string {
  const s = summarize(results)
  const lines = results.map((r) =>
    r.pass
      ? `PASS  ${r.track}/${r.id}`
      : `FAIL  ${r.track}/${r.id} — ${r.reason}`,
  )
  lines.push('')
  lines.push(
    `${s.total} cases: ${s.passed} pass, ${s.total - s.passed} fail`,
  )
  return lines.join('\n')
}
