import type { Member, MemberKind, Section } from '@/domain/model/member'
import type { Grid, Project, Story } from '@/domain/model/project'

import type {
  ElevationApplyRefusal,
  ElevationCandidate,
  PlanApplyRefusal,
  PlanApplySkip,
  PlanBlock,
  PlanPlacementRole,
  MemberPlacement,
} from './types'

/**
 * 伏図에서 읽은 형상을 案件에 반영한다 (ADR-030).
 *
 * 断面リスト 취입(ADR-018)과 같은 자리에 선다 — 사용자가 승인한 뒤에만 불리고,
 * 반영하지 못한 것은 지어내지 않고 사유와 함께 돌려준다.
 */

/** 種別이 놓일 수 있는 자리. 조문이 아니라 형상의 정의다 */
const ROLE_FOR_KIND: Record<MemberKind, PlanPlacementRole> = {
  柱: '格子点',
  大梁: '辺',
  耐震壁: '辺',
  床板: 'ベイ',
}

export interface PlanApplyOptions {
  block: PlanBlock
  storyId: string
  /**
   * 어느 階의 断面을 쓸지 — 断面リスト 원문 그대로(`2階`·`6F`). 사람이 고른다.
   * undefined는 「고르지 않았다」이지 「storyLabel이 없는 断面」이 아니다.
   */
  sectionStoryLabel?: string
  /**
   * 通り芯이 바뀔 때 다른 층의 부재를 버리고 진행한다. 기본은 false이고,
   * 화면은 거부를 한 번 보여준 뒤에만 이 선택지를 낸다 — 조용한 기본값으로
   * 두면 사용자가 모르는 사이에 다른 층이 사라진다
   */
  discardOtherStories?: boolean
}

export interface PlanApplyResult {
  project: Project
  /** 반영한 부재 수 */
  applied: number
  /** 반영하지 못한 부호와 사유 — 원문 순, 같은 부호가 여러 번 걸리면 여러 번 */
  skipped: Array<{ mark: string; reason: PlanApplySkip }>
  /** 통째로 거부한 사유. 있으면 project는 손대지 않은 원본 그대로다 */
  refusal?: PlanApplyRefusal
}

function gridOf(block: PlanBlock): Grid {
  const { xGrid, yGrid } = block
  return {
    xSpans: [...xGrid.spansMm],
    ySpans: [...yGrid.spansMm],
    // 通り芯의 이름은 도면에 있는 것이고, 이것이 있어야 「Y3端／Y4端」처럼
    // 좌우가 다른 断面リスト를 런의 실제 방향과 맞출 수 있다 (R13의 선결 조건)
    xLabels: xGrid.axes.map((axis) => axis.label),
    yLabels: yGrid.axes.map((axis) => axis.label),
  }
}

/**
 * 스팬만 본다 — 라벨은 数量도 격자 index도 바꾸지 않으므로, 이름만 달라진
 * 그리드를 「바뀌었다」로 보면 다른 층의 부재를 버리라는 물음이 이유 없이 뜬다.
 */
function sameGrid(left: Grid, right: Grid): boolean {
  return (
    left.xSpans.length === right.xSpans.length &&
    left.ySpans.length === right.ySpans.length &&
    left.xSpans.every((span, i) => span === right.xSpans[i]) &&
    left.ySpans.every((span, i) => span === right.ySpans[i])
  )
}

function positionOf(placement: MemberPlacement) {
  return placement.role === '辺'
    ? { axis: placement.axis, ix: placement.ix, iy: placement.iy }
    : { ix: placement.ix, iy: placement.iy }
}

/**
 * 배치가 격자 안을 가리키는가. 辺은 부재가 뻗는 쪽으로 한 칸 더 필요하고,
 * ベイ는 원점 쪽 격자점이므로 양쪽으로 한 칸씩 남아야 한다.
 */
function withinGrid(placement: MemberPlacement, grid: Grid): boolean {
  const nx = grid.xSpans.length + 1
  const ny = grid.ySpans.length + 1
  const lastIx =
    placement.role === 'ベイ' || (placement.role === '辺' && placement.axis === 'X')
      ? nx - 2
      : nx - 1
  const lastIy =
    placement.role === 'ベイ' || (placement.role === '辺' && placement.axis === 'Y')
      ? ny - 2
      : ny - 1

  return (
    placement.ix >= 0 &&
    placement.ix <= lastIx &&
    placement.iy >= 0 &&
    placement.iy <= lastIy
  )
}

export function applyFramingPlan(
  project: Project,
  {
    block,
    storyId,
    sectionStoryLabel,
    discardOtherStories = false,
  }: PlanApplyOptions,
): PlanApplyResult {
  if (!project.stories.some((story) => story.id === storyId)) {
    return { project, applied: 0, skipped: [], refusal: '階未指定' }
  }

  const grid = gridOf(block)
  const changesGrid = !sameGrid(project.grid, grid)
  const otherStoryMembers = project.members.some(
    (member) => member.storyId !== storyId,
  )
  // 격자 index는 스팬 배열에 매여 있다 — 스팬을 바꾸면 손대지 않은 층의 부재가
  // 조용히 다른 자리로 옮겨간다. 부분 반영으로 넘어가면 「틀린 채로 완성된 것」이
  // 되므로 통째로 거부하고, 어느 쪽을 버릴지는 사용자가 정한다
  if (changesGrid && otherStoryMembers && !discardOtherStories) {
    return {
      project,
      applied: 0,
      skipped: [],
      refusal: '他階部材あり通り芯変更不可',
    }
  }

  const sections = new Map<string, Section[]>()
  for (const section of project.sections) {
    const candidates = sections.get(section.mark)
    if (candidates) candidates.push(section)
    else sections.set(section.mark, [section])
  }

  const members: Member[] = []
  const skipped: PlanApplyResult['skipped'] = []
  for (const placement of block.placements) {
    const candidates = (sections.get(placement.mark) ?? []).filter(
      (section) =>
        sectionStoryLabel === undefined ||
        section.storyLabel === sectionStoryLabel,
    )
    if (candidates.length === 0) {
      skipped.push({ mark: placement.mark, reason: '断面未登録' })
      continue
    }
    if (candidates.length > 1) {
      skipped.push({ mark: placement.mark, reason: '断面複数該当' })
      continue
    }
    const section = candidates[0]
    if (ROLE_FOR_KIND[section.kind] !== placement.role) {
      skipped.push({ mark: placement.mark, reason: '部材種別相違' })
      continue
    }
    if (!withinGrid(placement, grid)) {
      skipped.push({ mark: placement.mark, reason: '格子外' })
      continue
    }

    members.push({
      // id는 사람이 읽는 값이 아니라 충돌만 피하면 된다. 같은 자리에 같은 符号을
      // 두 번 반영해도 하나로 접히도록 자리를 id에 넣는다
      id: `${storyId}-${placement.mark}-${placement.ix}-${placement.iy}${placement.role === '辺' ? `-${placement.axis}` : ''}`,
      kind: section.kind,
      memberClass: '躯体',
      sectionId: section.id,
      storyId,
      position: positionOf(placement),
    })
  }

  const deduped = new Map<string, Member>()
  for (const member of members) deduped.set(member.id, member)

  return {
    project: {
      ...project,
      grid,
      // 취입하는 층은 갈아 끼운다 — 두 번 눌러도 겹치지 않아야 하고, 도면에서
      // 사라진 부재가 案件에 남아 있으면 그것도 「틀린 채로 완성된 것」이다
      members: [
        // 통り芯이 바뀌면 남은 부재의 index가 다른 자리를 가리키게 되므로,
        // 동의를 받았을 때는 남기지 않고 전부 버린다 — 반쯤 옮겨 놓느니 비운다
        ...(changesGrid && discardOtherStories
          ? []
          : project.members.filter((member) => member.storyId !== storyId)),
        ...deduped.values(),
      ],
    },
    applied: deduped.size,
    skipped,
  }
}

export interface ElevationApplyOptions {
  candidate: ElevationCandidate
  /**
   * 階의 경계로 쓸 레벨의 범위. index는 **도면 순서**(위에서 아래)다.
   * 위 끝(top)이 최상階의 천장, 아래 끝(bottom)이 최하階의 바닥이 된다 —
   * パラペット 천단이나 基礎下端처럼 階가 아닌 레벨은 범위 밖에 둔다.
   */
  topLevelIndex: number
  bottomLevelIndex: number
  /** 階를 갈면 부재가 갈 곳을 잃는다. 화면은 거부를 보여준 뒤에만 이 선택지를 낸다 */
  discardMembers?: boolean
}

export interface ElevationApplyResult {
  project: Project
  /** 만든 階 수 */
  applied: number
  refusal?: ElevationApplyRefusal
}

/**
 * 軸組図에서 읽은 높이를 案件의 階로 반영한다 (ADR-030).
 *
 * 「어느 레벨이 階의 경계인가」는 파서가 정하지 않으므로(FL·GL·基礎下端·RCL이
 * 섞여 있다) 여기서 사용자의 선택을 받는다. 階의 이름도 지어내지 않고 그 階의
 * **바닥이 되는 레벨의 원문**을 그대로 쓴다 — 같은 높이에 라벨이 둘이면 둘 다
 * 남긴다(실물의 「中央棟1FL」과 「基準GL」이 그렇다).
 */
export function applyElevation(
  project: Project,
  {
    candidate,
    topLevelIndex,
    bottomLevelIndex,
    discardMembers = false,
  }: ElevationApplyOptions,
): ElevationApplyResult {
  const valid =
    Number.isInteger(topLevelIndex) &&
    Number.isInteger(bottomLevelIndex) &&
    topLevelIndex >= 0 &&
    bottomLevelIndex > topLevelIndex &&
    bottomLevelIndex < candidate.levels.length
  if (!valid) {
    return { project, applied: 0, refusal: '階範囲不正' }
  }

  // 階를 갈면 부재의 storyId가 가리키던 階가 사라진다. 부분 반영으로 넘어가면
  // 「틀린 채로 완성된 것」이 되므로 통째로 거부하고, 사용자가 정한다
  if (project.members.length > 0 && !discardMembers) {
    return { project, applied: 0, refusal: '部材あり階置換不可' }
  }

  const stories: Story[] = []
  // 도면은 위에서 아래, `Project.stories`는 아래에서 위다 (columnEnds가
  // stories[level - 1]을 「아래 階」로 읽는다)
  for (let i = bottomLevelIndex - 1; i >= topLevelIndex; i--) {
    const floor = candidate.levels[i + 1]
    const name =
      floor.labels.length > 0
        ? floor.labels.join('／')
        : `${bottomLevelIndex - i}`
    stories.push({
      id: `story-${bottomLevelIndex - i}`,
      name,
      height: candidate.heightsMm[i],
    })
  }

  return {
    project: { ...project, stories, members: [] },
    applied: stories.length,
  }
}
