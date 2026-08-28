import type {
  StbAxisGroupRaw,
  StbAxisRaw,
  StbDocument,
  StbEncoding,
  StbIssue,
  StbNodeRaw,
  StbStoryRaw,
} from './types'

const SUPPORTED_VERSIONS = ['2.0.1', '2.0.2', '2.1.0', '2.1.1'] as const

const UNREAD_CONTAINER_NAMES = [
  'ST_BRIDGE',
  'StbCommon',
  'StbModel',
  'StbNodes',
  'StbAxes',
  'StbStories',
  'StbMembers',
] as const

const UNSUPPORTED_AXIS_NAMES = [
  'StbArcAxes',
  'StbRadialAxes',
  'StbDrawingAxes',
] as const

const SKELETON_ELEMENT_NAMES = [
  ...UNREAD_CONTAINER_NAMES,
  'StbParallelAxes',
  'StbParallelAxis',
  'StbNodeIdList',
  'StbNodeId',
  'StbStory',
  'StbNode',
] as const

function allElements(document: Document): Element[] {
  return Array.from(document.getElementsByTagName('*'))
}

function directChildren(element: Element, localName: string): Element[] {
  return Array.from(element.children).filter(
    (child) => child.localName === localName,
  )
}

function attribute(element: Element, name: string): string | undefined {
  const value = element.getAttribute(name)
  return value === null ? undefined : value
}

function versionOf(root: Element | null): string {
  const value = root?.getAttribute('version')
  return value === null || value === undefined ? '' : value
}

function emptyDocument(
  version: string,
  encoding: StbEncoding,
  issue?: StbIssue,
): StbDocument {
  return {
    version,
    encoding,
    axisGroups: [],
    stories: [],
    nodes: [],
    unsupportedAxisKinds: [],
    unreadElements: [],
    issues: issue === undefined ? [] : [issue],
  }
}

function readAxis(axisElement: Element): StbAxisRaw {
  const nodeIds = directChildren(axisElement, 'StbNodeIdList').flatMap((list) =>
    directChildren(list, 'StbNodeId')
      .map((node) => attribute(node, 'id'))
      .filter((id): id is string => id !== undefined),
  )
  const axis: StbAxisRaw = { nodeIds }

  const id = attribute(axisElement, 'id')
  if (id !== undefined) axis.id = id
  const name = attribute(axisElement, 'name')
  if (name !== undefined) axis.name = name
  const distance = attribute(axisElement, 'distance')
  if (distance !== undefined) axis.distance = distance

  return axis
}

function readAxisGroup(groupElement: Element): StbAxisGroupRaw {
  const group: StbAxisGroupRaw = {
    axes: directChildren(groupElement, 'StbParallelAxis').map(readAxis),
  }

  const groupName = attribute(groupElement, 'group_name')
  if (groupName !== undefined) group.groupName = groupName
  const angle = attribute(groupElement, 'angle')
  if (angle !== undefined) group.angle = angle
  const originX = attribute(groupElement, 'X')
  if (originX !== undefined) group.originX = originX
  const originY = attribute(groupElement, 'Y')
  if (originY !== undefined) group.originY = originY

  return group
}

function readStory(storyElement: Element): StbStoryRaw {
  const story: StbStoryRaw = {}

  const id = attribute(storyElement, 'id')
  if (id !== undefined) story.id = id
  const name = attribute(storyElement, 'name')
  if (name !== undefined) story.name = name
  const height = attribute(storyElement, 'height')
  if (height !== undefined) story.height = height
  const kind = attribute(storyElement, 'kind')
  if (kind !== undefined) story.kind = kind

  return story
}

function readNode(nodeElement: Element): StbNodeRaw {
  const node: StbNodeRaw = {}

  const id = attribute(nodeElement, 'id')
  if (id !== undefined) node.id = id
  const x = attribute(nodeElement, 'X')
  if (x !== undefined) node.x = x
  const y = attribute(nodeElement, 'Y')
  if (y !== undefined) node.y = y
  const z = attribute(nodeElement, 'Z')
  if (z !== undefined) node.z = z
  const kind = attribute(nodeElement, 'kind')
  if (kind !== undefined) node.kind = kind

  return node
}

function countedElements(
  elements: Element[],
  names: readonly string[],
): { name: string; count: number }[] {
  const counts = new Map<string, number>()

  for (const element of elements) {
    const name = element.localName
    if (!names.includes(name)) continue
    const current = counts.get(name)
    counts.set(name, current === undefined ? 1 : current + 1)
  }

  return [...counts].map(([name, count]) => ({ name, count }))
}

function unreadElements(elements: Element[]): { name: string; count: number }[] {
  const counts = new Map<string, number>()

  for (const element of elements) {
    const name = element.localName
    if (
      (SKELETON_ELEMENT_NAMES as readonly string[]).includes(name) ||
      (UNSUPPORTED_AXIS_NAMES as readonly string[]).includes(name)
    ) {
      continue
    }
    const current = counts.get(name)
    counts.set(name, current === undefined ? 1 : current + 1)
  }

  return [...counts].map(([name, count]) => ({ name, count }))
}

export function parseStbDocument(
  text: string,
  encoding: StbEncoding,
): StbDocument {
  const parsed = new DOMParser().parseFromString(text, 'application/xml')
  const root = parsed.documentElement
  const version = versionOf(root)
  const elements = allElements(parsed)

  if (elements.some((element) => element.localName === 'parsererror')) {
    return emptyDocument(version, encoding, 'XML解析不能')
  }

  if (root?.localName !== 'ST_BRIDGE') {
    return emptyDocument(version, encoding, 'ST-Bridge形式でない')
  }

  if (!(SUPPORTED_VERSIONS as readonly string[]).includes(version)) {
    return emptyDocument(version, encoding, '対応外バージョン')
  }

  const documentData = emptyDocument(version, encoding)
  const projectName = elements.find(
    (element) => element.localName === 'StbCommon',
  )
  const projectNameValue = projectName
    ? attribute(projectName, 'project_name')
    : undefined
  if (projectNameValue !== undefined) documentData.projectName = projectNameValue

  documentData.axisGroups = elements
    .filter((element) => element.localName === 'StbParallelAxes')
    .map(readAxisGroup)
  documentData.stories = elements
    .filter((element) => element.localName === 'StbStory')
    .map(readStory)
  documentData.nodes = elements
    .filter((element) => element.localName === 'StbNode')
    .map(readNode)
  documentData.unsupportedAxisKinds = countedElements(
    elements,
    UNSUPPORTED_AXIS_NAMES,
  )
  documentData.unreadElements = unreadElements(elements)

  return documentData
}
