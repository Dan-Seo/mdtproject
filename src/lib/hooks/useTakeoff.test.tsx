import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { createSampleProject } from '@/domain/model/sample-project'
import { useAppStore } from '@/lib/store'

import { useTakeoff } from './useTakeoff'

describe('useTakeoff', () => {
  beforeEach(() => {
    useAppStore.setState({ project: createSampleProject() })
  })

  it('derives M1 柱 rebars, quantity lines and inferred metadata', () => {
    const { result } = renderHook(() => useTakeoff())

    expect(result.current.rebars.length).toBeGreaterThan(0)
    expect(result.current.lines.length).toBeGreaterThan(0)
    expect(result.current.hasInferred).toBe(true)
    expect(result.current.inferredRules.length).toBeGreaterThan(0)
  })

  it('shares one computation across every consumer of the same Project', () => {
    // TakeoffPane · TakeoffActions · Viewer3D가 각각 호출한다. 각자 계산하면
    // 입력 한 글자에 파이프라인이 세 번 돈다.
    const first = renderHook(() => useTakeoff())
    const second = renderHook(() => useTakeoff())

    expect(second.result.current.lines).toBe(first.result.current.lines)
    expect(second.result.current.rebars).toBe(first.result.current.rebars)
  })

  it('recomputes once the Project is replaced', () => {
    const { result } = renderHook(() => useTakeoff())
    const before = result.current.lines

    useAppStore
      .getState()
      .updateProject((project) => ({ ...project, name: '別案件' }))

    const after = renderHook(() => useTakeoff()).result.current.lines

    expect(after).not.toBe(before)
    expect(after).toHaveLength(before.length)
  })
})
