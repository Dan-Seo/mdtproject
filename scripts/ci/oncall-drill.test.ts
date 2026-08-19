import assert from 'node:assert/strict'
import { test } from 'node:test'

import { drillAnswer } from './oncall-drill'

test('drillAnswer는 숫자 타입을 유지한다', () => {
  assert.equal(drillAnswer, 42)
})
