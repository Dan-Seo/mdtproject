import { createSampleProject } from '../../../src/domain/model/sample-project'
import type { Project } from '../../../src/domain/model/project'
import type { Rebar } from '../../../src/domain/model/rebar'
import { buildTakeoff } from '../../../src/lib/hooks/useTakeoff'
import { projectFingerprints } from '../../../src/domain/review/fingerprint'
import type { ReviewSnapshot } from '../../../src/domain/review/types'
import { jpMlitRulePack } from '../../../src/rulepack'

export function reviewSnapshot(project: Project): {
  project: Project
  rebars: Rebar[]
  lines: ReturnType<typeof buildTakeoff>['lines']
  unsupportedMemberIds: ReadonlySet<string>
  fingerprints: ReturnType<typeof projectFingerprints>
} {
  const takeoff = buildTakeoff(project)
  const unsupportedMemberIds = new Set(
    takeoff.unsupportedMembers.map(({ memberId }) => memberId),
  )

  return {
    project,
    rebars: takeoff.rebars,
    lines: takeoff.lines,
    unsupportedMemberIds,
    fingerprints: projectFingerprints(
      project,
      takeoff.rebars,
      unsupportedMemberIds,
      jpMlitRulePack,
      1,
      null,
    ),
  }
}

export function sampleProject(): Project {
  return createSampleProject()
}

export function cloneProject(project: Project): Project {
  return JSON.parse(JSON.stringify(project)) as Project
}

export function reviewViewerSnapshot(
  fingerprints: ReturnType<typeof projectFingerprints>,
  memberId: string | null = '1F-X1Y1',
): ReviewSnapshot {
  return {
    capturedAt: '2026-09-17T10:00:00+09:00',
    fingerprints,
    viewer: {
      mode: 'joint',
      pose: null,
      clip: { enabled: false, axis: 'x', ratio: 0.5 },
      layers: { main: true, hoop: true, concrete: true },
      selection: { group: null, memberId, rowId: null },
    },
  }
}
