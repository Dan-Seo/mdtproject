import { join } from 'node:path'
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import { renderHook } from '@testing-library/react'

import {
  deserializeProject,
  findSection,
  serializeProject,
  slabBay,
  type Project,
} from '@/domain/model/project'
import { createSampleProject } from '@/domain/model/sample-project'
import { MemberUnsupportedError } from '@/domain/model/unsupported'
import { applyFramingPlan } from '@/lib/import/framing-plan/apply'
import type {
  PlanBlock,
  PlanGridCandidate,
} from '@/lib/import/framing-plan/types'
import { useTakeoff } from '@/lib/hooks/useTakeoff'
import { useAppStore } from '@/lib/store'

interface ErrorObservation {
  constructor: string
  name: string | undefined
  message: string
  isError: boolean
  isMemberUnsupportedError: boolean
}

interface Observation {
  id: string
  status: 'upheld' | 'refuted'
  evidence: unknown[]
}

interface JsdomWindow {
  document: Document
  navigator: Navigator
  HTMLElement: typeof HTMLElement
  Node: typeof Node
  MutationObserver: typeof MutationObserver
  getComputedStyle: typeof getComputedStyle
}

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom') as {
  JSDOM: new (
    html: string,
    options: { url: string },
  ) => { window: JsdomWindow }
}

function installDom(): void {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/',
  })
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    navigator: { configurable: true, value: dom.window.navigator },
    HTMLElement: { configurable: true, value: dom.window.HTMLElement },
    Node: { configurable: true, value: dom.window.Node },
    MutationObserver: {
      configurable: true,
      value: dom.window.MutationObserver,
    },
    getComputedStyle: {
      configurable: true,
      value: dom.window.getComputedStyle,
    },
  })
  Object.assign(globalThis, {
    IS_REACT_ACT_ENVIRONMENT: true,
  })
}

function observeError(action: () => unknown): ErrorObservation | null {
  try {
    action()
    return null
  } catch (error) {
    return {
      constructor: error instanceof Error ? error.constructor.name : typeof error,
      name: error instanceof Error ? error.name : undefined,
      message: error instanceof Error ? error.message : String(error),
      isError: error instanceof Error,
      isMemberUnsupportedError: error instanceof MemberUnsupportedError,
    }
  }
}

function edgeKey(member: Project['members'][number]): string | null {
  if (!('axis' in member.position)) return null
  return `${member.storyId}|${member.position.axis}|${member.position.ix}|${member.position.iy}`
}

function gridCandidate(
  direction: 'X' | 'Y',
  spansMm: number[],
): PlanGridCandidate {
  return {
    direction,
    axes: Array.from({ length: spansMm.length + 1 }, (_, index) => ({
      label: `${direction}${index}`,
      positionPt: index,
    })),
    spansMm: [...spansMm],
    scalePtPerMm: 1,
    totalConfirmed: false,
  }
}

function blockFor(project: Project, placements: PlanBlock['placements']): PlanBlock {
  return {
    xGrid: gridCandidate('X', project.grid.xSpans),
    yGrid: gridCandidate('Y', project.grid.ySpans),
    placements,
    unplacedMarks: [],
  }
}

function lineFor(
  result: ReturnType<typeof useTakeoff>,
  storyName: string,
  mark: string,
  role: string,
) {
  const line = result.lines.find(
    (candidate) =>
      candidate.storyName === storyName &&
      candidate.mark === mark &&
      candidate.role === role &&
      candidate.unit === 'kg',
  )
  if (!line) throw new Error(`quantity line not found: ${storyName}/${mark}/${role}`)
  return line
}

function sourceText(path: string): string {
  return readFileSync(path, 'utf8')
}

function sourcePathsUnder(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name)
    return entry.isDirectory() ? sourcePathsUnder(path) : [path]
  })
}

function main(): void {
  installDom()

  const sample = createSampleProject()
  const wall = sample.members.find((member) => member.kind === '耐震壁')
  if (!wall) throw new Error('sample has no 耐震壁')
  const wallEdge = edgeKey(wall)
  if (wallEdge === null) throw new Error('sample 耐震壁 is not on an edge')

  const wallTopGirderIds = sample.members
    .filter((member) => member.kind === '大梁' && edgeKey(member) === wallEdge)
    .map(({ id }) => id)
  if (wallTopGirderIds.length === 0) {
    throw new Error('sample 耐震壁 has no matching 大梁 to remove')
  }

  const missingWallGirder: Project = {
    ...sample,
    members: sample.members.filter(({ id }) => !wallTopGirderIds.includes(id)),
  }

  const healthyHook = renderHook(() => useTakeoff())
  const healthyTakeoff = healthyHook.result.current
  healthyHook.unmount()

  useAppStore.setState({ project: missingWallGirder })
  const wallCrash = observeError(() => renderHook(() => useTakeoff()))
  useAppStore.setState({ project: sample })

  const wallSection = findSection(sample, wall.sectionId)
  const wallPlacement = wall.position
  if (!('axis' in wallPlacement)) throw new Error('sample wall position is not an edge')
  const importResult = applyFramingPlan(sample, {
    block: blockFor(sample, [
      {
        mark: wallSection.mark,
        role: '辺',
        ix: wallPlacement.ix,
        iy: wallPlacement.iy,
        axis: wallPlacement.axis,
      },
    ]),
    storyId: wall.storyId,
  })
  const importedWall = importResult.project.members.filter(
    (member) => member.storyId === wall.storyId,
  )
  const importedWallHasTopGirder = importedWall.some(
    (member) => member.kind === '大梁' && edgeKey(member) === wallEdge,
  )
  const importedWallRoundTrip = deserializeProject(
    serializeProject(importResult.project),
  )

  const slab = sample.members.find((member) => member.kind === '床板')
  if (!slab) throw new Error('sample has no 床板')
  const healthyBay = slabBay(sample, slab)
  const supportIds = Object.fromEntries(
    Object.entries(healthyBay.supports).map(([key, support]) => [
      key,
      support.memberId,
    ]),
  )
  const missingSlabSupportId = healthyBay.supports.minX.memberId
  const missingSlabSupportProject: Project = {
    ...sample,
    members: sample.members.filter(({ id }) => id !== missingSlabSupportId),
  }
  const slabCrash = observeError(() => slabBay(missingSlabSupportProject, slab))

  const firstColumn = sample.members.find((member) => member.kind === '柱')
  const secondColumn = sample.members.find(
    (member) =>
      member.kind === '柱' &&
      member.storyId === firstColumn?.storyId &&
      member.id !== firstColumn?.id,
  )
  if (!firstColumn || !secondColumn) throw new Error('sample has too few 柱 members')
  const duplicateIdProject: Project = {
    ...sample,
    members: sample.members.map((member) =>
      member.id === secondColumn.id ? { ...member, id: firstColumn.id } : member,
    ),
  }
  const duplicateRoundTrip = deserializeProject(
    serializeProject(duplicateIdProject),
  )
  const duplicateFirstPosition = duplicateRoundTrip.members.find(
    ({ id }) => id === firstColumn.id,
  )?.position
  useAppStore.setState({ project: duplicateIdProject })
  const duplicateHook = renderHook(() => useTakeoff())
  const duplicateTakeoff = duplicateHook.result.current
  duplicateHook.unmount()
  useAppStore.setState({ project: sample })
  const healthyColumnLine = lineFor(
    healthyTakeoff,
    '1階',
    'C1',
    '主筋',
  )
  const duplicateColumnLine = lineFor(
    duplicateTakeoff,
    '1階',
    'C1',
    '主筋',
  )
  useAppStore.setState({ project: duplicateIdProject })
  useAppStore.getState().selectMember(firstColumn.id)
  const selectedDuplicateMember = useAppStore
    .getState()
    .project.members.find(({ id }) => id === firstColumn.id)
  useAppStore.setState({ project: sample })

  const duplicatePlacementResult = applyFramingPlan(sample, {
    block: blockFor(sample, [
      {
        mark: wallSection.mark,
        role: '辺',
        ix: wallPlacement.ix,
        iy: wallPlacement.iy,
        axis: wallPlacement.axis,
      },
      {
        mark: wallSection.mark,
        role: '辺',
        ix: wallPlacement.ix,
        iy: wallPlacement.iy,
        axis: wallPlacement.axis,
      },
    ]),
    storyId: wall.storyId,
  })

  const planEditor = sourceText('src/components/plan/PlanEditor.tsx')
  const sectionTable = sourceText('src/components/section/SectionTable.tsx')
  const planImport = sourceText('src/components/plan/PlanImport.tsx')
  const slabEnds = sourceText('src/domain/rebar/slab-ends.ts')
  const slabRebar = sourceText('src/domain/rebar/slab.ts')
  const slabEndsTakesSupportInput = slabEnds.includes('supportWidthMm')
  const slabRebarPassesBothEndSupports =
    slabRebar.includes('run.startSupport.widthMm') &&
    slabRebar.includes('run.endSupport.widthMm')
  const freeMemberMutation =
    /\b(?:addMember|removeMember|deleteMember)\b|(?:project\.)?members\.(?:push|splice)|\bproject\.members\s*=/
  const planEditorHasFreeMemberMutation =
    freeMemberMutation.test(planEditor)
  const sectionTableHasMemberCollectionMutation =
    freeMemberMutation.test(sectionTable)
  const planImportHasCandidateApproval =
    planImport.includes('applyFramingPlan') &&
    planImport.includes('data-testid={`plan-import-apply-${index}`}')
  const sourcePaths = sourcePathsUnder('src')
  const sourceHasUndo = sourcePaths.some((path) =>
    /\b(?:undo|redo|history)\b/i.test(sourceText(path)),
  )

  const observations: Observation[] = [
    {
      id: 'plain-error-crash',
      status:
        wallCrash !== null &&
        wallCrash.isError &&
        !wallCrash.isMemberUnsupportedError
          ? 'upheld'
          : 'refuted',
      evidence: [
        'healthy sample useTakeoff completed',
        { removedWallTopGirderIds: wallTopGirderIds, thrown: wallCrash },
        'useTakeoff catch path rethrows errors that are not MemberUnsupportedError',
      ],
    },
    {
      id: 'reachable-today',
      status:
        importResult.applied === 1 &&
        !importedWallHasTopGirder &&
        importedWallRoundTrip.members.some(
          (member) =>
            member.kind === '耐震壁' && member.storyId === wall.storyId,
        )
          ? 'upheld'
          : 'refuted',
      evidence: [
        {
          path: 'src/lib/import/framing-plan/apply.ts',
          applied: importResult.applied,
          wallMembersInTargetStory: importedWall.length,
          importedWallHasTopGirder,
          refusal: importResult.refusal,
        },
        'deserializeProject(serializeProject(importResult.project)) completed',
        'sample useTakeoff completed before the support was removed',
      ],
    },
    {
      id: 'slab-needs-four-girders',
      status:
        slabCrash !== null &&
        slabCrash.isError &&
        !slabCrash.isMemberUnsupportedError
          ? 'upheld'
          : 'refuted',
      evidence: [
        { supportIds, missingSupport: missingSlabSupportId, thrown: slabCrash },
        'slabBay resolves minX, maxX, minY, and maxY through girderSectionAt',
        {
          slabEndsTakesSupportInput,
          slabRebarPassesBothEndSupports,
        },
      ],
    },
    {
      id: 'no-member-creation-ui',
      status:
        !planEditorHasFreeMemberMutation &&
        !sectionTableHasMemberCollectionMutation &&
        planImportHasCandidateApproval
          ? 'upheld'
          : 'refuted',
      evidence: [
        {
          planEditorHasFreeMemberMutation,
          sectionTableHasMemberCollectionMutation,
          planImportHasCandidateApproval,
        },
        'PlanEditor contains span/opening/wallExtent mutations only; no member add/remove action',
        'SectionTable replaces Section values only; it has no Member collection mutation',
        'PlanImport exposes PDF candidate approval via planImport.apply and calls applyFramingPlan; this is candidate approval, not free placement',
      ],
    },
    {
      id: 'id-convention',
      status:
        duplicateRoundTrip.members.filter(({ id }) => id === firstColumn.id).length === 2 &&
        duplicatePlacementResult.applied === 1 &&
        duplicateColumnLine.places < healthyColumnLine.places &&
        selectedDuplicateMember?.id === firstColumn.id
          ? 'upheld'
          : 'refuted',
      evidence: [
        {
          applyIdTemplate: '${storyId}-${placement.mark}-${placement.ix}-${placement.iy}[-${axis}]',
          duplicatePlacementApplied: duplicatePlacementResult.applied,
        },
        {
          duplicateId: firstColumn.id,
          duplicateCountAfterRoundTrip: duplicateRoundTrip.members.filter(
            ({ id }) => id === firstColumn.id,
          ).length,
          lookupReturnsFirstPosition: duplicateFirstPosition,
          selectionMemberId: useAppStore.getState().sel.memberId,
          healthyPlaces: healthyColumnLine.places,
          duplicatePlaces: duplicateColumnLine.places,
          healthyRebarCount: healthyTakeoff.rebars.length,
          duplicateRebarCount: duplicateTakeoff.rebars.length,
        },
        'duplicate IDs collapse in quantity memberIds while duplicate rebar objects are generated',
      ],
    },
    {
      id: 'no-undo',
      status: sourceHasUndo ? 'refuted' : 'upheld',
      evidence: [
        'src/lib/store.ts AppState exposes updateProject/loadProject but no undo/redo/history action',
        'PlanEditor and SectionTable expose direct updateProject mutations without a history stack',
        {
          scannedSources: sourcePaths.length,
          undoOrRedoTokenFound: sourceHasUndo,
        },
      ],
    },
  ]

  const upheld = observations.filter(({ status }) => status === 'upheld')
  const output = {
    premises: observations,
    verdict: observations.some(({ status }) => status === 'refuted')
      ? 'refuted'
      : 'upheld',
    summary: `${observations.filter(({ status }) => status === 'refuted').length} premise(s) refuted; ${upheld.length} premise(s) upheld`,
  }

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)

  if (output.verdict !== 'upheld') {
    throw new Error(
      `ADR-038 premise verification changed: ${observations
        .filter(({ status }) => status === 'refuted')
        .map(({ id }) => id)
        .join(', ')}`,
    )
  }
}

main()
