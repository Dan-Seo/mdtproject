import { describe, expect, it } from 'vitest'

import ja from '@/locales/ja.json'
import ko from '@/locales/ko.json'

import {
  ELEVATION_ISSUES,
  PLAN_GRID_ISSUES,
  PLAN_PLACEMENT_ROLES,
  type MemberPlacement,
  type PlanGridIssue,
} from './types'

describe('ParsedFramingPlan', () => {
  it('carries issue codes instead of free-form sentences', () => {
    // 파서가 완성 문장을 실으면 i18n 레이어를 우회한다 — 유니온이 좁혀 막는다
    const issue: PlanGridIssue = '縮尺不整合'
    expect(PLAN_GRID_ISSUES).toContain(issue)
  })

  it('has a ja·ko message for every grid issue code', () => {
    // 코드만 있고 키가 없으면 사용자에게 「縮尺不整合」 같은 코드가 그대로 보인다
    const missing = PLAN_GRID_ISSUES.flatMap((issue) => {
      const key = `planImport.issue.${issue}`
      return [
        ...(key in ja ? [] : [`ja:${key}`]),
        ...(key in ko ? [] : [`ko:${key}`]),
      ]
    })

    expect(missing).toEqual([])
  })

  it('has a ja·ko message for every placement role', () => {
    // 역할은 취입 화면에서 「이 부호를 어디에 놓는가」로 그대로 보인다
    const missing = PLAN_PLACEMENT_ROLES.flatMap((role) => {
      const key = `planImport.role.${role}`
      return [
        ...(key in ja ? [] : [`ja:${key}`]),
        ...(key in ko ? [] : [`ko:${key}`]),
      ]
    })

    expect(missing).toEqual([])
  })

  it('has a ja·ko message for every elevation issue code', () => {
    const missing = ELEVATION_ISSUES.flatMap((issue) => {
      const key = `planImport.issue.${issue}`
      return [
        ...(key in ja ? [] : [`ja:${key}`]),
        ...(key in ko ? [] : [`ko:${key}`]),
      ]
    })

    expect(missing).toEqual([])
  })

  it('辺だけが axis を持つ — 格子点·ベイ に方向はない', () => {
    const edge: MemberPlacement = {
      mark: 'G1',
      role: '辺',
      ix: 0,
      iy: 1,
      axis: 'X',
    }
    const point: MemberPlacement = { mark: 'C1', role: '格子点', ix: 0, iy: 0 }

    expect(edge.axis).toBe('X')
    expect(point.axis).toBeUndefined()
  })
})
