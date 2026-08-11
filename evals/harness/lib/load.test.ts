import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from 'vitest'

import { validateCaseSet } from './cases'
import { loadCases } from './load'

// 실제 golden set을 대상으로 하는 무결성/균형 게이트 — API 키 없이 npm test에서 돈다.
const CASES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'cases')

test('golden set 전체가 파싱된다 (라벨 스키마 위반이 없다)', () => {
  expect(() => loadCases(CASES_DIR)).not.toThrow()
})

test('golden set이 무결성/균형 검증을 통과한다', () => {
  const cases = loadCases(CASES_DIR)
  expect(validateCaseSet(cases)).toEqual([])
})
