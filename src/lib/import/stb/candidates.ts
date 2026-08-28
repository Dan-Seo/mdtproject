import type {
  StbAxisGroupRaw,
  StbAxisRaw,
  StbDocument,
  StbGridCandidate,
  StbIssue,
  StbSkeletonCandidate,
} from './types'

const AXIS_DIRECTIONS = ['X', 'Y'] as const
type AxisDirection = (typeof AXIS_DIRECTIONS)[number]

const SUPPORTED_STORY_KINDS = new Set(['GENERAL', 'ROOF', 'PENTHOUSE'])

function addIssue(issues: StbIssue[], issue: StbIssue): void {
  if (!issues.includes(issue)) issues.push(issue)
}

function unsupportedItems(document: StbDocument): { name: string; count: number }[] {
  return [...document.unsupportedAxisKinds, ...document.unreadElements]
}

function normalizedAngle(angle: string | undefined):
  | { direction: AxisDirection; radians: number }
  | undefined {
  const value = Number(angle)
  if (!Number.isFinite(value)) return undefined

  const normalized = ((value % 360) + 360) % 360
  const quadrant = Math.round(normalized / 90)
  if (Math.abs(normalized - quadrant * 90) > 0.001) return undefined

  const quadrantInCycle = quadrant % 4
  return {
    direction:
      quadrantInCycle === 0 || quadrantInCycle === 2 ? 'Y' : 'X',
    radians: normalized,
  }
}

function originFor(group: StbAxisGroupRaw, direction: AxisDirection): number {
  const rawOrigin = direction === 'X' ? group.originX : group.originY
  return rawOrigin === undefined ? 0 : Number(rawOrigin)
}

function hasNodeAtAxisCoordinate(
  axis: StbAxisRaw,
  direction: AxisDirection,
  expectedCoordinate: number,
  nodesById: Map<string, { x?: string; y?: string }>,
): boolean {
  return axis.nodeIds.some((nodeId) => {
    const node = nodesById.get(nodeId)
    if (node === undefined) return false

    const coordinate = Number(direction === 'X' ? node.x : node.y)
    return Number.isFinite(coordinate) &&
      Math.abs(coordinate - expectedCoordinate) <= 1
  })
}

function gridForDirection(
  group: StbAxisGroupRaw,
  direction: AxisDirection,
  document: StbDocument,
  issues: StbIssue[],
): StbGridCandidate | undefined {
  const parsedAxes = group.axes.map((axis) => ({
    axis,
    distance: Number(axis.distance),
  }))

  if (parsedAxes.some(({ distance }) => !Number.isFinite(distance))) {
    addIssue(issues, '通り芯距離解釈不能')
    return undefined
  }

  if (
    group.axes.some(
      (axis) => axis.name === undefined || axis.name.length === 0,
    )
  ) {
    addIssue(issues, '通り芯ラベル欠落')
    return undefined
  }

  if (parsedAxes.length < 2) {
    addIssue(issues, '通り芯未検出')
    return undefined
  }

  const sortedAxes = [...parsedAxes].sort(
    (left, right) => left.distance - right.distance,
  )
  const hasDuplicate = sortedAxes.some(
    (entry, index) => index > 0 && entry.distance === sortedAxes[index - 1]!.distance,
  )
  if (hasDuplicate) {
    addIssue(issues, '通り芯位置重複')
    return undefined
  }

  const spansMm = sortedAxes.slice(1).map(
    (entry, index) => entry.distance - sortedAxes[index]!.distance,
  )
  if (spansMm.some((span) => span <= 0)) {
    addIssue(issues, '通り芯位置重複')
    return undefined
  }

  const nodesById = new Map(
    document.nodes.flatMap((node) =>
      node.id === undefined ? [] : [[node.id, node] as const],
    ),
  )
  const origin = originFor(group, direction)
  const hasMismatch = sortedAxes.some(({ axis, distance }) => {
    if (axis.nodeIds.length === 0) return false
    const expectedCoordinate = origin + distance
    return !hasNodeAtAxisCoordinate(
      axis,
      direction,
      expectedCoordinate,
      nodesById,
    )
  })
  if (hasMismatch) addIssue(issues, '通り芯位置と節点の不一致')

  const candidate: StbGridCandidate = {
    direction,
    axes: sortedAxes.map(({ axis }) => ({ label: axis.name! })),
    spansMm,
  }
  if (group.groupName !== undefined) candidate.groupName = group.groupName
  return candidate
}

function gridsForDocument(
  document: StbDocument,
  issues: StbIssue[],
): StbGridCandidate[] {
  const hasArcOrRadial = document.unsupportedAxisKinds.some(
    ({ name, count }) =>
      count > 0 && (name === 'StbArcAxes' || name === 'StbRadialAxes'),
  )
  const hasDrawing = document.unsupportedAxisKinds.some(
    ({ name, count }) => count > 0 && name === 'StbDrawingAxes',
  )

  if (hasArcOrRadial) addIssue(issues, '非直交通り芯')
  if (hasDrawing) addIssue(issues, '未対応通り芯種別')
  if (hasArcOrRadial) return []

  if (document.axisGroups.length === 0) {
    addIssue(issues, '通り芯未検出')
    return []
  }
  if (document.axisGroups.length !== 2) {
    addIssue(issues, '通り芯グループ数不一致')
    return []
  }

  const groupsWithDirections = document.axisGroups.map((group) => ({
    group,
    angle: normalizedAngle(group.angle),
  }))
  if (groupsWithDirections.some(({ angle }) => angle === undefined)) {
    addIssue(issues, '非直交通り芯')
    return []
  }

  const directions = groupsWithDirections.map(({ angle }) => angle!.direction)
  if (directions[0] === directions[1]) {
    addIssue(issues, '通り芯方向不明')
    return []
  }

  const grids = groupsWithDirections.flatMap(({ group, angle }) =>
    gridForDirection(group, angle!.direction, document, issues) ?? [],
  )
  return grids.sort(
    (left, right) =>
      AXIS_DIRECTIONS.indexOf(left.direction) -
      AXIS_DIRECTIONS.indexOf(right.direction),
  )
}

function storiesForDocument(
  document: StbDocument,
  issues: StbIssue[],
): StbSkeletonCandidate['stories'] {
  if (document.stories.length === 0) {
    addIssue(issues, '階不足')
    return []
  }

  const levels = document.stories.map((story) => ({
    story,
    height: Number(story.height),
  }))
  if (levels.some(({ height }) => !Number.isFinite(height))) {
    addIssue(issues, '階レベル解釈不能')
    return []
  }

  let hasBasement = false
  let hasUnsupportedKind = false
  for (const { story, height } of levels) {
    if (story.kind === 'BASEMENT' || height < 0) hasBasement = true
    if (
      story.kind === undefined ||
      (story.kind !== 'BASEMENT' && !SUPPORTED_STORY_KINDS.has(story.kind))
    ) {
      hasUnsupportedKind = true
    }
  }
  if (hasBasement) addIssue(issues, '地下レベル未対応')
  if (hasUnsupportedKind) addIssue(issues, '対応外の階種別')

  const sortedLevels = [...levels].sort(
    (left, right) => left.height - right.height,
  )
  const hasDuplicate = sortedLevels.some(
    (entry, index) => index > 0 && entry.height === sortedLevels[index - 1]!.height,
  )
  if (hasDuplicate) addIssue(issues, '階レベル重複')
  if (sortedLevels.length < 2) addIssue(issues, '階不足')
  if (
    document.stories.some(
      (story) => story.name === undefined || story.name.length === 0,
    )
  ) {
    addIssue(issues, '階レベル解釈不能')
  }

  if (
    hasBasement ||
    hasUnsupportedKind ||
    hasDuplicate ||
    sortedLevels.length < 2 ||
    document.stories.some(
      (story) => story.name === undefined || story.name.length === 0,
    )
  ) {
    return []
  }

  return sortedLevels.slice(0, -1).map((level, index) => ({
    name: level.story.name!,
    heightMm: sortedLevels[index + 1]!.height - level.height,
  }))
}

export function toSkeletonCandidate(
  document: StbDocument,
): StbSkeletonCandidate {
  const issues: StbIssue[] = []
  const unsupported = unsupportedItems(document)

  if (document.issues.length > 0) {
    const candidate: StbSkeletonCandidate = {
      version: document.version,
      grids: [],
      stories: [],
      unsupported,
      issues: [],
    }
    if (document.projectName !== undefined) {
      candidate.projectName = document.projectName
    }
    for (const issue of document.issues) addIssue(candidate.issues, issue)
    return candidate
  }

  const grids = gridsForDocument(document, issues)
  const stories = storiesForDocument(document, issues)
  const candidate: StbSkeletonCandidate = {
    version: document.version,
    grids,
    stories,
    unsupported,
    issues,
  }
  if (document.projectName !== undefined) candidate.projectName = document.projectName
  return candidate
}
