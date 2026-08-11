export type Verdict = {
  pass: boolean
  reason: string
}

/** judge 출력(JSON 문자열, 코드 펜스 허용)을 검증해 Verdict로 만든다. 순수 함수. */
export function parseVerdict(text: string): Verdict {
  let s = text.trim()
  const fence = s.match(/^```(?:json)?\r?\n([\s\S]*?)\r?\n```$/)
  if (fence) s = fence[1].trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(s)
  } catch {
    throw new Error(`judge 출력이 JSON이 아니다: ${text.slice(0, 200)}`)
  }

  if (typeof parsed !== 'object' || parsed === null)
    throw new Error(`judge 출력이 객체가 아니다: ${s.slice(0, 200)}`)
  const obj = parsed as Record<string, unknown>
  if (typeof obj.pass !== 'boolean')
    throw new Error(`judge 출력의 pass가 boolean이 아니다: ${s.slice(0, 200)}`)
  if (typeof obj.reason !== 'string')
    throw new Error(`judge 출력에 reason(string)이 없다: ${s.slice(0, 200)}`)

  return { pass: obj.pass, reason: obj.reason }
}
