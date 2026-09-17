import { describe, expect, it } from 'vitest'

import { createSampleProject } from '../model/sample-project'
import type {
  Baseline,
  CheckExclusion,
  ClearanceBasis,
  ReviewFingerprints,
  ReviewItem,
  ReviewState,
  WorkPackage,
} from './types'
import {
  addItem,
  addExclusion,
  addPackage,
  confirmItem,
  emptyReviewState,
  holdItem,
  newReviewId,
  parseReviewState,
  removeExclusion,
  setBaseline,
  setChecklistStatus,
  setClearance,
  updateItem,
  updatePackage,
} from './state'

const HOLD = '\u4FDD\u7559'
const CONFIRMED = '\u78BA\u8A8D\u6E08'
const UNCONFIRMED = '\u672A\u78BA\u8A8D'
const USER_INPUT = '\u5229\u7528\u8005\u5165\u529B'

const fingerprints: ReviewFingerprints = {
  rulepack: 'rules-1',
  checkVersion: 0,
  checkConditions: null,
  members: {},
}

const item: ReviewItem = {
  id: 'item-1',
  createdAt: '2026-09-17T10:00:00+09:00',
  updatedAt: '2026-09-17T10:00:00+09:00',
  targets: [{ kind: 'member', memberId: 'C1' }],
  title: 'column review',
  body: 'review body',
  status: UNCONFIRMED,
  confirmations: [],
  snapshot: {
    capturedAt: '2026-09-17T10:00:00+09:00',
    fingerprints,
    viewer: {
      mode: 'member',
      pose: null,
      clip: { enabled: false, axis: 'x', ratio: 0 },
      layers: { main: true, hoop: true, concrete: true },
      selection: { group: null, memberId: 'C1', rowId: null },
    },
  },
}

const workPackage: WorkPackage = {
  id: 'package-1',
  name: 'first review',
  targets: [{ kind: 'member', memberId: 'C1' }],
  assignee: 'reviewer',
  dueDate: null,
  checklist: [
    {
      id: 'check-1',
      label: 'review entry',
      required: true,
      reviewItemIds: [],
      status: '\u672A\u5165\u529B',
    },
  ],
  createdAt: '2026-09-17T10:00:00+09:00',
  updatedAt: '2026-09-17T10:00:00+09:00',
}

function validState(): ReviewState {
  return { ...emptyReviewState(), items: [item], packages: [workPackage] }
}

describe('review state parser', () => {
  it('turns missing old review data into an empty state', () => {
    expect(parseReviewState(undefined)).toEqual(emptyReviewState())
    expect(parseReviewState(null)).toEqual(emptyReviewState())
  })

  it('rejects an unsupported review schema version', () => {
    expect(() => parseReviewState({ ...emptyReviewState(), reviewSchemaVersion: 2 })).toThrow(
      'Unsupported ReviewState reviewSchemaVersion; expected 1',
    )
  })

  it('rejects a held item without a reason', () => {
    expect(() => parseReviewState({
      ...validState(),
      items: [{ ...item, status: HOLD }],
    })).toThrow('ReviewState.items[0].holdReason')
  })

  it('rejects non-positive and non-finite numeric values', () => {
    const project = createSampleProject()
    expect(() => parseReviewState({
      ...validState(),
      settings: { clearance: {
        valueMm: 0,
        source: USER_INPUT,
        scope: 'all joint rebars',
        enteredAt: '2026-09-17',
        note: '',
      } },
    })).toThrow('ReviewState.settings.clearance.valueMm')

    expect(() => parseReviewState({
      ...validState(),
      baseline: {
        label: 'base',
        capturedAt: '2026-09-17',
        project: JSON.parse(JSON.stringify(project)),
        fingerprints: { ...fingerprints, checkVersion: Number.NaN },
      },
    })).toThrow('ReviewState.baseline.fingerprints.checkVersion')
  })

  it('rejects duplicate item ids', () => {
    expect(() => parseReviewState({
      ...validState(),
      items: [item, { ...item, updatedAt: '2026-09-17T11:00:00+09:00' }],
    })).toThrow('ReviewState.items[1].id')
  })

  it('rejects exclusions without finding kinds', () => {
    expect(() => parseReviewState({
      ...validState(),
      exclusions: [{
        id: 'exclusion-1',
        scope: { sameMemberOnly: true, roles: ['\u5E2F\u7B4B', '\u4E3B\u7B4B'], kinds: [] },
        reason: 'intentional contact',
        createdAt: '2026-09-17',
      }],
    })).toThrow('ReviewState.exclusions[0].scope.kinds')
  })

  it('requires a confirmation for an unlinked confirmed checklist entry', () => {
    expect(() => parseReviewState({
      ...validState(),
      packages: [{
        ...workPackage,
        checklist: [{ ...workPackage.checklist[0], status: CONFIRMED }],
      }],
    })).toThrow('ReviewState.packages[0].checklist[0].confirmation')
  })

  it('allows checklist references to deleted review items', () => {
    expect(parseReviewState({
      ...validState(),
      packages: [{
        ...workPackage,
        checklist: [{ ...workPackage.checklist[0], reviewItemIds: ['deleted-item'] }],
      }],
    })).toEqual(expect.objectContaining({ packages: expect.any(Array) }))
  })

  it('validates a baseline project with parseProject', () => {
    expect(() => parseReviewState({
      ...validState(),
      baseline: {
        label: 'base',
        capturedAt: '2026-09-17',
        project: { ...createSampleProject(), schemaVersion: 2 },
        fingerprints,
      },
    })).toThrow('Unsupported Project schemaVersion; expected 11')
  })
})

describe('review state reducers', () => {
  it('returns new state without mutating input and confirms an item', () => {
    const state = validState()
    const next = addItem(state, { ...item, id: 'item-2' })
    expect(next).not.toBe(state)
    expect(state.items).toHaveLength(1)

    const confirmation = { by: 'reviewer', at: '2026-09-17T12:00:00+09:00', note: 'confirmed' }
    const confirmed = confirmItem(next, 'item-1', confirmation)
    expect(confirmed.items[0]).toEqual(expect.objectContaining({
      status: CONFIRMED,
      updatedAt: confirmation.at,
      confirmations: [confirmation],
    }))
    expect(next.items[0].status).toBe(UNCONFIRMED)
  })

  it('covers the remaining reducers without mutating the input state', () => {
    const state = validState()
    const basis: ClearanceBasis = {
      valueMm: 40,
      source: USER_INPUT,
      scope: 'all joint rebars',
      enteredAt: '2026-09-17',
      note: 'entered by reviewer',
    }
    const exclusion: CheckExclusion = {
      id: 'exclusion-1',
      scope: {
        sameMemberOnly: true,
        roles: ['\u5E2F\u7B4B', '\u4E3B\u7B4B'],
        kinds: ['\u63A5\u89E6'],
      },
      reason: 'intentional contact',
      createdAt: '2026-09-17',
    }
    const baseline: Baseline = {
      label: 'baseline',
      capturedAt: '2026-09-17',
      project: createSampleProject(),
      fingerprints,
    }

    expect(updateItem(state, 'item-1', { body: 'updated' }).items[0].body).toBe('updated')
    expect(holdItem(state, 'item-1', 'needs review').items[0]).toEqual(
      expect.objectContaining({ status: HOLD, holdReason: 'needs review' }),
    )
    expect(setClearance(state, basis).settings.clearance).toEqual(basis)
    expect(addExclusion(state, exclusion).exclusions).toEqual([exclusion])
    expect(removeExclusion(addExclusion(state, exclusion), exclusion.id)).toEqual(state)
    expect(addPackage(state, { ...workPackage, id: 'package-2' }).packages).toHaveLength(2)
    expect(updatePackage(state, 'package-1', { name: 'updated package' }).packages[0].name).toBe(
      'updated package',
    )
    expect(setChecklistStatus(state, 'package-1', 'check-1', '\u672A\u78BA\u8A8D').packages[0].checklist[0].status).toBe(
      '\u672A\u78BA\u8A8D',
    )
    expect(setBaseline(state, baseline).baseline).toEqual(baseline)
    expect(newReviewId('item', ['item-1', 'item-2'])).toBe('item-3')
    expect(state).toEqual(validState())

    expect(() => addItem(state, item)).toThrow('duplicate id')
    expect(() => updateItem(state, 'missing', {})).toThrow('not found')
    expect(() => removeExclusion(state, 'missing')).toThrow('not found')
    expect(() => addPackage(state, workPackage)).toThrow('duplicate id')
    expect(() => updatePackage(state, 'missing', {})).toThrow('not found')
    expect(() => setChecklistStatus(state, 'missing', 'check-1', '\u672A\u5165\u529B')).toThrow('not found')
    expect(() => setChecklistStatus(state, 'package-1', 'missing', '\u672A\u5165\u529B')).toThrow('not found')
    expect(() => setBaseline(state, { ...baseline, project: { ...baseline.project, schemaVersion: 2 } })).toThrow(
      'Unsupported Project schemaVersion; expected 11',
    )
  })
})
