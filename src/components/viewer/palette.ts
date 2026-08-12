import type { RebarZone } from '@/domain/model/rebar'

export const REBAR_ZONE_COLORS = {
  定着: '#4f9f98',
  重ね継手: '#c2a34f',
} as const satisfies Record<RebarZone['kind'], string>
