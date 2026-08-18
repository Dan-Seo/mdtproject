import type { RebarZone } from '@/domain/model/rebar'

export const REBAR_ZONE_COLORS = {
  定着: '#4f9f98',
} as const satisfies Record<RebarZone['kind'], string>
