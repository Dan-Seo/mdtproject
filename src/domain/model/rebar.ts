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
  /**
   * 이 구간 길이를 정한 룰 키. 산정부만 아는 사실이다 — 표시부가 형상·길이로
   * 되짚으면 두 번째 규준 판정이 되어 도메인과 조용히 어긋난다.
   */
  ruleKey: string
  /** 철근 polyline 시작점부터의 누적 경로거리 (mm) */
  pathFromMm: number
  pathToMm: number
}

/**
 * 반복 전개를 재현하는 데 필요한 값 전부. 표시부가 단면에서 피치·오프셋을
 * 다시 집어오면 배치 규칙이 두 곳에 박힌다 — `stirrupPositions` 인자를 그대로 싣는다.
 */
export interface RebarPlacement {
  /** 반복 전개의 기준축. 大梁 あばら筋은 로컬 x, 柱 帯筋은 높이 y를 쓴다. */
  axis: 'x' | 'y'
  /** `stirrupPositions`에 전달한 부재 内法 길이 (mm). */
  clearMm: number
  /** `stirrupPositions`에 전달한 피치 (mm) — 断面一覧의 입력 그대로. */
  pitchMm: number
  /** `stirrupPositions`에 전달한 첫 본 오프셋 (mm). */
  startOffsetMm: number
  /** `stirrupPositions`가 산출한 마지막 잔여 간격 (mm). */
  lastGapMm: number
  /**
   * 이 배치가 실제로 만드는 위치 개수. 数量의 `Rebar.count`와 다를 수 있다 —
   * 数量은 積算基準 1通則7)로 세고 배치는 초기 오프셋을 반영하기 때문이다 (ADR-019).
   * 표시부가 같은 인자로 `stirrupPositions`를 다시 돌린 결과와 대조하는 값이다.
   */
  positionCount: number
}

export interface Rebar {
  id: string
  memberId: string
  role: RebarRole
  size: BarSize
  shape: RebarShape
  /** 加工形状. 3D 표시의 유일한 출처이며 `length`와 일치하지 않을 수 있다. */
  points: [number, number, number][]
  closed: boolean
  /**
   * 数量積算基準の**設計長さ** (mm) — 内訳書·kg 산출이 쓰는 값이다.
   * フープ·スタラップ은 1通則2)가 「断面の設計寸法による周長、フックはない
   * ものとする」로 정하므로 `points`가 그리는 加工長과 어긋난다 (ADR-019).
   */
  length: number
  /**
   * 数量積算基準の**設計本数** — 1通則7)의 割付本数다.
   * 배치가 만드는 실제 개수는 `placement.positionCount`이며 다를 수 있다.
   */
  count: number
  /** 대표 1본을 실제 本数만큼 전개할 때 필요한 도메인 배치 입력. */
  placement?: RebarPlacement
  zones?: RebarZone[]
  /** 이 철근을 산정하며 실제로 조회한 룰 행 그대로 — 키만 남기면 조회 조건을 잃는다 */
  ruleHits: RuleHit[]
  formula: string
}
