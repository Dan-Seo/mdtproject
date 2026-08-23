/**
 * 셀을 빈칸으로 남긴 사유 코드 (section-list의 CANDIDATE_ISSUES 패턴).
 * 파서는 코드만 싣고 표시부가 번역한다.
 */
export const PLAN_GRID_ISSUES = [
  '通り芯ラベル未検出',
  '寸法欠落',
  '縮尺不整合',
  '合計不一致',
  'ラベル文字混在',
] as const

export type PlanGridIssue = (typeof PLAN_GRID_ISSUES)[number]

/** 伏図에서 읽은 通り芯 한 본. positionPt는 도면 좌표(pt) — 부재 스냅의 기준. */
export interface AxisCandidate {
  label: string
  positionPt: number
}

/** 한 방향(X 또는 Y)의 通り芯 열 후보. 승인 전에는 형상이 되지 않는다 (ADR-030). */
export interface PlanGridCandidate {
  /** 라벨의 축 문자 — 밴드의 기하 방향이 아니라 도면이 붙인 이름을 따른다 */
  direction: 'X' | 'Y'
  /** 위치 오름차순 */
  axes: AxisCandidate[]
  /** 인접 축 사이 치수(mm). 길이는 axes.length - 1 */
  spansMm: number[]
  /** 실측 축척(pt/mm) — 전 스팬 실측의 중앙값. 표기 축척은 용지 의존이라 믿지 않는다 */
  scalePtPerMm: number
  /** 도면에 전체 치수가 명기돼 있고 스팬 합과 일치했다 */
  totalConfirmed: boolean
}

/**
 * 부호가 그리드의 어디에 놓였는가 — 도면에서 잰 **기하**만 말한다.
 *
 * 「C면 柱」처럼 부호 접두로 부재 종별을 정하지 않는다. 종별은 断面リスト가
 * 이미 갖고 있으므로(ADR-018), 취입이 그 종별과 이 기하를 맞춰 본다 —
 * 어긋나면 사람이 판단할 일이지 파서가 고를 일이 아니다.
 */
export const PLAN_PLACEMENT_ROLES = ['格子点', '辺', 'ベイ'] as const

export type PlanPlacementRole = (typeof PLAN_PLACEMENT_ROLES)[number]

export interface MemberPlacement {
  mark: string
  role: PlanPlacementRole
  /** 格子点·ベイ는 격자점/베이 원점, 辺은 부재가 시작하는 격자점 */
  ix: number
  iy: number
  /** role === '辺' 일 때만 — 부재가 뻗는 방향 (GirderPosition.axis와 같은 뜻) */
  axis?: 'X' | 'Y'
}

/**
 * 도면 위의 伏図 한 장. 한 페이지에 여러 장이 실리므로(실물 yokohama p7은
 * 2階床伏図와 R階床伏図 두 장) 通り芯 정의가 같아도 **위치가 다르다** —
 * 그리드 정의는 접히지만 블록은 접히지 않는다.
 */
export interface PlanBlock {
  /** 블록 제목 원문(「2階床伏図1/100」). 어느 Story인지는 사람이 정한다 */
  title?: string
  /** 이 블록에서의 通り芯 실위치(pt). 라벨과 순서는 그리드 후보와 같다 */
  xAxes: AxisCandidate[]
  yAxes: AxisCandidate[]
  placements: MemberPlacement[]
  /** 블록 안에 있으나 스냅하지 못한 부호(중복 없음, 원문 순) — 지어내지 않는다 */
  unplacedMarks: string[]
}

export interface ParsedFramingPlan {
  /** 通り芯 정의 — 같은 그리드가 여러 블록에 반복되면 하나로 접힌다 */
  grids: PlanGridCandidate[]
  blocks: PlanBlock[]
  /** 후보를 못 낸 사유 — 첫 등장 순, 중복 없음 */
  issues: PlanGridIssue[]
}
