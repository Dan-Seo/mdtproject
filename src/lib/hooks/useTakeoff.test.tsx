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
})
