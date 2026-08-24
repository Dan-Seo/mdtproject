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
  '通り芯対応不明',
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

export type MemberPlacement =
  | { mark: string; role: '格子点' | 'ベイ'; ix: number; iy: number }
  | {
      mark: string
      role: '辺'
      /** 부재가 시작하는 격자점 */
      ix: number
      iy: number
      /** 부재가 뻗는 방향 (GirderPosition.axis와 같은 뜻) */
      axis: 'X' | 'Y'
    }

/**
 * 도면 위의 伏図 한 장. 한 페이지에 여러 장이 실리므로(실물 yokohama p7은
 * 2階床伏図와 R階床伏図 두 장) 通り芯 정의가 같아도 **위치가 다르다** —
 * 그리드 정의는 접히지만 블록은 접히지 않는다.
 */
export interface PlanBlock {
  /** 블록 제목 원문(「2階床伏図1/100」). 어느 Story인지는 사람이 정한다 */
  title?: string
  /** 이 블록과 짝지어진 X·Y 通り芯 정의. 취입은 반드시 이 둘을 쓴다 */
  xGrid: PlanGridCandidate
  yGrid: PlanGridCandidate
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

/** 軸組図에서 계열을 못 낸 사유. 파서는 코드만 싣고 표시부가 번역한다 */
export const ELEVATION_ISSUES = ['寸法列未検出'] as const

export type ElevationIssue = (typeof ELEVATION_ISSUES)[number]

export interface ElevationLevel {
  /** 그 높이에 적힌 라벨 원문 전부. 없으면 빈 배열 — 지어내지 않는다 */
  labels: string[]
  positionPt: number
}

/**
 * 軸組図 한 계열의 높이 방향 읽기. 「어느 레벨이 Story의 경계인가」는 정하지
 * 않는다 — 원문에는 FL·GL·基礎下端·RCL이 섞여 있고, 그중 무엇이 階인지는
 * 조문이 아니라 설계 의도라 사람이 읽을 일이다 (ADR-030).
 *
 * 通り芯과 달리 라벨의 좌우 정렬이 일정하지 않아(실물 p8의 좌단 x는 108~198로
 * 흩어진다) 라벨 밴드를 앵커로 쓸 수 없다. 앵커는 **치수 열**이고, 치수가 자기
 * 구간의 중점에 놓인다는 관계로 축척과 레벨 위치를 함께 푼다.
 */
export interface ElevationCandidate {
  /** 이 계열이 걸리는 軸組図 제목들(원문). 한 계열이 여러 通り에 공통으로 걸린다 */
  titles: string[]
  /** 도면 좌표 순 — 위에서 아래로 */
  levels: ElevationLevel[]
  /** 인접 레벨 사이 치수(mm). 길이는 levels.length - 1 */
  heightsMm: number[]
  scalePtPerMm: number
}

export interface ParsedFrameElevations {
  elevations: ElevationCandidate[]
  issues: ElevationIssue[]
}

/** 취입을 통째로 거부한 사유. 이때 案件은 손대지 않은 원본 그대로다 */
export const PLAN_APPLY_REFUSALS = [
  '階未指定',
  '他階部材あり通り芯変更不可',
] as const

export type PlanApplyRefusal = (typeof PLAN_APPLY_REFUSALS)[number]

/** 부호 하나를 넣지 못한 사유. 지어내는 대신 이 코드로 남긴다 */
export const PLAN_APPLY_SKIPS = [
  '断面未登録',
  '部材種別相違',
  '格子外',
] as const

export type PlanApplySkip = (typeof PLAN_APPLY_SKIPS)[number]

/** 階高 취입을 통째로 거부한 사유. 이때 案件은 손대지 않은 원본 그대로다 */
export const ELEVATION_APPLY_REFUSALS = [
  '階範囲不正',
  '部材あり階置換不可',
] as const

export type ElevationApplyRefusal =
  (typeof ELEVATION_APPLY_REFUSALS)[number]
