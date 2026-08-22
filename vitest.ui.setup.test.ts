import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

afterEach(() => cleanup())

/**
 * jsdom 은 scrollIntoView 를 구현하지 않는다. TakeoffPane 은 選択中の行を
 * 見えるところへ送るのに使うので、스텁이 없으면 그 컴포넌트를 그리는 테스트가
 * 「scrollIntoView is not a function」으로 죽는다.
 *
 * 지금까지는 TakeoffPane.test.tsx 가 자기 beforeEach 에서 심는 스텁이 같은
 * 워커의 다른 파일로 새어 우연히 살아 있었다 — 워커 배치는 부하에 따라 바뀌므로
 * page.test.tsx 가 간헐적으로 죽었다. 우연이 아니라 여기서 보장한다.
 */
beforeEach(() => {
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  })
})
