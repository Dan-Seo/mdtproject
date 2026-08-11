import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { parseCaseFile, type EvalCase } from './cases'

/** cases/ 아래 track 디렉터리들의 *.md를 전부 파싱해 돌려준다. */
export function loadCases(casesDir: string): EvalCase[] {
  const cases: EvalCase[] = []
  for (const track of readdirSync(casesDir)) {
    const trackDir = join(casesDir, track)
    for (const file of readdirSync(trackDir)) {
      if (!file.endsWith('.md')) continue
      const path = join(trackDir, file)
      cases.push(parseCaseFile(readFileSync(path, 'utf8'), `${track}/${file}`))
    }
  }
  return cases
}
