import type { BarSize } from './member'

export type RebarRole = '主筋' | '帯筋'

export type RebarShape = 'straight' | 'hook90' | 'hoop'

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
  rules: string[]
  formula: string
}
