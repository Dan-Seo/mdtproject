import type { BarSize } from './member'
import type { RuleHit } from '../rules/types'

export type RebarRole =
  | '主筋'
  | '帯筋'
  | '上端筋'
  | '下端筋'
  | 'あばら筋'

export type RebarShape = 'straight' | 'hook90' | 'hoop'

export interface RebarZone {
  kind: '定着' | '重ね継手'
  /** 철근 polyline 시작점부터의 누적 경로거리 (mm) */
  pathFromMm: number
  pathToMm: number
}

export interface Rebar {
  id: string
  memberId: string
  role: RebarRole
  size: BarSize
  shape: RebarShape
  points: [number, number, number][]
  closed: boolean
  length: number
  count: number
  zones?: RebarZone[]
  /** 이 철근을 산정하며 실제로 조회한 룰 행 그대로 — 키만 남기면 조회 조건을 잃는다 */
  ruleHits: RuleHit[]
  formula: string
}
