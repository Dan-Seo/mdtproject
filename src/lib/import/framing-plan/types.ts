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

/** 伏図에서 읽은 通り芯 한 본. positionPt는 도면 좌표(pt) — 부재 스냅(B2)의 기준. */
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

export interface ParsedPlanGrids {
  candidates: PlanGridCandidate[]
  /** 후보를 못 낸 사유 — 첫 등장 순, 중복 없음 */
  issues: PlanGridIssue[]
}
