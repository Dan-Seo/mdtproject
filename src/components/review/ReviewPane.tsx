'use client'

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import { sectionMarkLabel } from '@/domain/model/member'
import { findSection } from '@/domain/model/project'
import { jointRebarMemberIds, resolveJoint } from '@/domain/review/joint'
import type { EntityChange, LineChange, TakeoffSnapshot } from '@/domain/review/impact'
import {
  addItem,
  addExclusion,
  confirmItem,
  holdItem,
  newReviewId,
  removeExclusion,
  setClearance,
  setBaseline,
  updateItem,
} from '@/domain/review/state'
import type {
  Baseline,
  CheckExclusion,
  ElementRef,
  FindingKind,
  ClearanceBasis,
  RecordedFinding,
  ReviewItem,
} from '@/domain/review/types'
import {
  effectiveItemStatus,
  itemTargetMemberIds,
  itemValidity,
  itemsNeedingRecheck,
} from '@/domain/review/validity'
import type { RuleHit } from '@/domain/rules/types'
import type { RebarRole } from '@/domain/model/rebar'
import {
  rebarsUsingRule,
  xrayForRebar,
  xrayForRow,
  type RuleUse,
  type XRayView,
} from '@/lib/review/xray'
import { useReviewModel } from '@/lib/hooks/useReviewModel'
import {
  ConfidenceWarning,
  formatLength,
  SourceChips,
} from '@/components/quantity/TakeoffPane'
import { t } from '@/lib/i18n'
import { useAppStore } from '@/lib/store'
import * as geometryCheck from '@/lib/review/geometry-check'
import { jointLayout, segmentFor } from '@/lib/review/joint-layout'

import styles from './ReviewPane.module.css'

type ReviewRebar = TakeoffSnapshot['rebars'][number]
type ReviewLine = TakeoffSnapshot['lines'][number]

function conditionText(rule: RuleHit): string {
  return Object.entries(rule.conditions)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(', ')
}

const CHECK_ROLES: readonly RebarRole[] = [
  '主筋',
  '帯筋',
  'あばら筋',
  '上端筋',
  '下端筋',
  '縦筋',
  '横筋',
]

const CHECK_KINDS: FindingKind[] = ['干渉候補', 'あき不足候補', '接触']

function formatBarRef(project: TakeoffSnapshot['project'], ref: geometryCheck.BarRef): string {
  const member = project.members.find(({ id }) => id === ref.memberId)
  const mark = member === undefined ? ref.memberId : sectionMarkLabel(findSection(project, member.sectionId))
  return `${mark} / ${ref.role} / ${ref.size} / #${ref.barIndex}`
}

function basisText(finding: geometryCheck.Finding): string {
  if (finding.basis.kind === '利用者入力あき') {
    return `${finding.basis.kind}: ${finding.basis.valueMm}mm (${finding.basis.scope})`
  }
  return finding.basis.kind
}

interface ReviewCheckProps {
  onCreateItem?: (finding: geometryCheck.Finding, checkId?: string) => void
}

function ReviewCheckSection({ onCreateItem = () => {} }: ReviewCheckProps) {
  const project = useAppStore(({ project }) => project)
  const review = useAppStore(({ review }) => review)
  const memberId = useAppStore(({ sel }) => sel.memberId)
  const locale = useAppStore(({ locale }) => locale)
  const setReview = useAppStore(({ setReview }) => setReview)
  const setReviewFocus = useAppStore(({ setReviewFocus }) => setReviewFocus)
  const setViewerMode = useAppStore(({ setViewerMode }) => setViewerMode)
  const { current, currentSnapshot } = useReviewModel()
  const jointResolution = useMemo(
    () => resolveJoint(project, memberId ?? ''),
    [project, memberId],
  )
  const joint = jointResolution.status === 'joint' ? jointResolution.joint : null
  const layout = useMemo(
    () => joint === null
      ? null
      : jointLayout(
          project,
          currentSnapshot.rebars,
          currentSnapshot.unsupportedMemberIds,
          joint,
        ),
    [project, currentSnapshot.rebars, currentSnapshot.unsupportedMemberIds, joint],
  )
  const [clearanceInput, setClearanceInput] = useState(
    review.settings.clearance === null ? '' : String(review.settings.clearance.valueMm),
  )
  const [scope, setScope] = useState('接合部の全鉄筋')
  const [note, setNote] = useState(review.settings.clearance?.note ?? '')
  const [result, setResult] = useState<geometryCheck.CheckResult | null>(null)
  const [firstRole, setFirstRole] = useState<RebarRole>('帯筋')
  const [secondRole, setSecondRole] = useState<RebarRole>('主筋')
  const [sameMemberOnly, setSameMemberOnly] = useState(true)
  const [exclusionReason, setExclusionReason] = useState('')
  const lastClearanceCommit = useRef<string | null>(null)

  const commitClearance = () => {
    const valueText = clearanceInput.trim()
    const value = valueText === '' ? null : Number(valueText)
    if (value !== null && (!Number.isFinite(value) || value <= 0)) return
    const basis: ClearanceBasis | null = value === null
      ? null
      : {
          valueMm: value,
          source: '利用者入力',
          scope,
          enteredAt: new Date().toISOString(),
          note,
        }
    const commitKey = JSON.stringify(basis)
    if (lastClearanceCommit.current === commitKey) return
    lastClearanceCommit.current = commitKey
    setReview((state) => setClearance(state, basis))
  }

  const commitOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitClearance()
    }
  }

  const addDefaultExclusions = () => {
    const now = new Date().toISOString()
    setReview((state) => geometryCheck.defaultExclusions(now).reduce(addExclusion, state))
  }

  const addManualExclusion = () => {
    const reason = exclusionReason.trim()
    if (reason === '') return
    const createdAt = new Date().toISOString()
    const exclusion: CheckExclusion = {
      id: `manual-${createdAt}`,
      scope: {
        sameMemberOnly,
        roles: [firstRole, secondRole],
        kinds: CHECK_KINDS,
      },
      reason,
      createdAt,
    }
    setReview((state) => addExclusion(state, exclusion))
    setExclusionReason('')
  }

  const runCheck = () => {
    if (joint === null) return
    setResult(geometryCheck.runGeometryCheck({
      project,
      rebars: currentSnapshot.rebars,
      unsupportedMemberIds: currentSnapshot.unsupportedMemberIds,
      joint,
      settings: review.settings,
      exclusions: review.exclusions,
      fingerprints: current.fingerprints,
    }))
  }

  const focusFinding = (finding: geometryCheck.Finding) => {
    if (layout === null) return
    const a = segmentFor(layout, finding.a)
    const b = segmentFor(layout, finding.b)
    if (a === null || b === null) return
    const [pa, pb] = finding.closestPoints
    setReviewFocus({
      point: [
        (pa[0] + pb[0]) / 2,
        (pa[1] + pb[1]) / 2,
        (pa[2] + pb[2]) / 2,
      ],
      segments: [a, b],
      label: `${finding.kind}: ${formatBarRef(project, finding.a)} × ${formatBarRef(project, finding.b)}`,
    })
    setViewerMode('joint')
  }

  return (
    <section aria-labelledby="review-check-title" data-testid="review-check">
      <h2 id="review-check-title">{t(locale, 'review.check.title')}</h2>
      <label>
        {t(locale, 'review.check.clearance')}
        <input
          aria-label={t(locale, 'review.check.clearance')}
          type="number"
          min="0"
          value={clearanceInput}
          onChange={(event) => setClearanceInput(event.target.value)}
          onBlur={commitClearance}
          onKeyDown={commitOnEnter}
        />
      </label>
      <label>
        {t(locale, 'review.check.scope')}
        <input
          aria-label={t(locale, 'review.check.scope')}
          type="text"
          value={scope}
          onChange={(event) => setScope(event.target.value)}
          onBlur={commitClearance}
          onKeyDown={commitOnEnter}
        />
      </label>
      <label>
        {t(locale, 'review.check.note')}
        <input
          aria-label={t(locale, 'review.check.note')}
          type="text"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          onBlur={commitClearance}
          onKeyDown={commitOnEnter}
        />
      </label>
      <p>{t(locale, 'review.check.source')}</p>

      <div>
        <h3>{t(locale, 'review.check.exclusions')}</h3>
        {review.exclusions.length === 0 && (
          <button type="button" onClick={addDefaultExclusions}>
            {t(locale, 'review.check.addDefaults')}
          </button>
        )}
        <ul>
          {review.exclusions.map((exclusion) => (
            <li key={exclusion.id}>
              <span>
                {t(locale, 'review.check.exclusion.roles')}: {exclusion.scope.roles.join(' × ')}; {t(locale, 'review.check.exclusion.sameMemberOnly')}: {String(exclusion.scope.sameMemberOnly)}; {t(locale, 'review.check.exclusion.memberIds')}: {exclusion.scope.memberIds?.join(', ') ?? '—'}
              </span>
              <span>{exclusion.reason}</span>
              <button type="button" onClick={() => setReview((state) => removeExclusion(state, exclusion.id))}>
                {t(locale, 'review.check.remove')}
              </button>
            </li>
          ))}
        </ul>
        <div>
          <label>
            {t(locale, 'review.check.exclusion.roles')}
            <select aria-label={`${t(locale, 'review.check.exclusion.roles')} 1`} value={firstRole} onChange={(event) => setFirstRole(event.target.value as RebarRole)}>
              {CHECK_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
            <select aria-label={`${t(locale, 'review.check.exclusion.roles')} 2`} value={secondRole} onChange={(event) => setSecondRole(event.target.value as RebarRole)}>
              {CHECK_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
          </label>
          <label>
            <input type="checkbox" checked={sameMemberOnly} onChange={(event) => setSameMemberOnly(event.target.checked)} />
            {t(locale, 'review.check.exclusion.sameMemberOnly')}
          </label>
          <label>
            {t(locale, 'review.check.exclusion.reason')}
            <input aria-label={t(locale, 'review.check.exclusion.reason')} type="text" value={exclusionReason} onChange={(event) => setExclusionReason(event.target.value)} />
          </label>
          <button type="button" disabled={exclusionReason.trim() === ''} onClick={addManualExclusion}>
            {t(locale, 'review.check.add')}
          </button>
        </div>
      </div>

      <button type="button" disabled={joint === null} onClick={runCheck}>
        {t(locale, 'review.check.execute')}
      </button>

      {result !== null && (
        <div>
          <p data-testid="review-check-id">{t(locale, 'review.check.checkId')}: {result.checkId}</p>
          <div>
            <h3>{t(locale, 'review.check.verdict')}</h3>
            <p data-testid="review-verdict" data-review-verdict="clash">{t(locale, 'review.check.verdict.clash')}: {result.verdict.clash}</p>
            <p data-testid="review-verdict" data-review-verdict="clearance">{t(locale, 'review.check.verdict.clearance')}: {result.verdict.clearance}</p>
            <p data-testid="review-verdict" data-review-verdict="contact">{t(locale, 'review.check.verdict.contact')}: {result.verdict.contact}</p>
          </div>
          <div>
            <h3>{t(locale, 'review.check.unchecked')}</h3>
            <ul data-testid="review-unchecked">
              {result.unchecked.map((item) => <li key={`${item.what}-${item.source}`}>{item.what}: {item.reason} ({item.source})</li>)}
            </ul>
          </div>
          <div>
            <h3>{t(locale, 'review.check.scopeTitle')}</h3>
            <ul>
              <li>{t(locale, 'review.check.scope.members')}: {result.scope.memberIds.length}</li>
              <li>{t(locale, 'review.check.scope.rebars')}: {result.scope.barCount}</li>
              <li>{t(locale, 'review.check.scope.segments')}: {result.scope.segmentCount}</li>
              <li>{t(locale, 'review.check.scope.pairs')}: {result.scope.pairsTested}</li>
              <li>{t(locale, 'review.check.scope.dropped')}: {result.scope.droppedOutsideRegion}</li>
              <li>{t(locale, 'review.check.scope.region')}: x={result.scope.regionMm.x.join('..')}, y={result.scope.regionMm.y.join('..')}, z={result.scope.regionMm.z.join('..')}mm</li>
            </ul>
          </div>
          <div>
            <h3>{t(locale, 'review.check.assumptions')}</h3>
            <ul>{result.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul>
          </div>
          <p>{t(locale, 'review.check.tolerance')}: {result.toleranceMm}</p>
          <table className={styles.table} data-testid="review-findings">
            <caption>{t(locale, 'review.check.findings')}</caption>
            <tbody>
              {result.findings.map((finding) => {
                const exclusion = finding.excludedBy === null
                  ? null
                  : review.exclusions.find(({ id }) => id === finding.excludedBy)
                return (
                  <tr
                    key={finding.id}
                    tabIndex={0}
                    onClick={() => focusFinding(finding)}
                    onKeyDown={(event) => { if (event.key === 'Enter') focusFinding(finding) }}
                  >
                    <td>{finding.kind}</td>
                    <td>{formatBarRef(project, finding.a)}</td>
                    <td>{formatBarRef(project, finding.b)}</td>
                    <td>{finding.clearanceMm.toFixed(1)}</td>
                    <td>{basisText(finding)}</td>
                    <td>{exclusion === null || exclusion === undefined ? null : <span className={styles.excluded}>{t(locale, 'review.check.excluded')}: {exclusion.reason}</span>}</td>
                    <td><button type="button" onClick={() => onCreateItem(finding, result.checkId)}>{t(locale, 'review.check.createItem')}</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function JointSection() {
  const project = useAppStore(({ project }) => project)
  const memberId = useAppStore(({ sel }) => sel.memberId)
  const locale = useAppStore(({ locale }) => locale)
  const setViewerMode = useAppStore(({ setViewerMode }) => setViewerMode)
  const resolution = resolveJoint(project, memberId ?? '')

  return (
    <section aria-labelledby="review-joint-title" data-testid="review-joint">
      <h2 id="review-joint-title">{t(locale, 'review.joint.title')}</h2>
      {resolution.status === 'unsupported' ? (
        <p role="alert">
          {t(locale, 'review.joint.unsupported')}: {t(
            locale,
            `viewer.joint.unsupported.${resolution.reason}`,
          )} — {t(locale, 'review.joint.selectColumn')}
        </p>
      ) : (
        <>
          <p>
            {resolution.joint.column.section.mark} · {resolution.joint.column.story.name}
          </p>
          <ul>
            {resolution.joint.girders.map(({ member, section, end }) => (
              <li key={member.id}>{section.mark} {end}</li>
            ))}
          </ul>
          {resolution.joint.reference.memberIds.length > 0 && (
            <div>
              <h3>{t(locale, 'viewer.joint.reference')}</h3>
              <ul>
                {resolution.joint.reference.memberIds.map((referenceId) => (
                  <li key={referenceId}>{referenceId}</li>
                ))}
              </ul>
            </div>
          )}
          <button type="button" onClick={() => setViewerMode('joint')}>
            {t(locale, 'review.joint.view3d')}
          </button>
        </>
      )}
    </section>
  )
}

function shapeCount(view: XRayView): string {
  if (!view.shape.drawn) return view.shape.reason
  const positionCount = view.shape.positionCount === null
    ? '—'
    : String(view.shape.positionCount)
  return `${view.shape.placedCount} + ${positionCount}`
}

function RebarRuleUsers({
  rule,
  project,
  rebars,
  lines,
  expanded,
  onToggle,
  setHoverRow,
}: {
  rule: RuleUse
  project: TakeoffSnapshot['project']
  rebars: ReviewRebar[]
  lines: ReviewLine[]
  expanded: boolean
  onToggle(): void
  setHoverRow(rowId: string | null): void
}) {
  const users = useMemo(() => rebarsUsingRule(rule.rule, rebars), [rule.rule, rebars])
  const locale = useAppStore(({ locale }) => locale)

  return (
    <>
      <button type="button" onClick={onToggle}>
        {t(locale, 'review.xray.ruleUsers')}
      </button>
      {expanded && (
        <ul>
          {users.map((rebar) => {
            const view = xrayForRebar(rebar, project, lines)
            const rowId = view.quantity.lineIds.mass ?? view.quantity.lineIds.splice
            return (
              <li key={rebar.id}>
                <button
                  type="button"
                  data-testid={`rule-rebar-${rebar.id}`}
                  onClick={() => setHoverRow(rowId)}
                >
                  {view.member.mark} · {rebar.role}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

function RuleTable({
  rules,
  project,
  rebars,
  lines,
  setHoverRow,
}: {
  rules: RuleUse[]
  project: TakeoffSnapshot['project']
  rebars: ReviewRebar[]
  lines: ReviewLine[]
  setHoverRow(rowId: string | null): void
}) {
  const locale = useAppStore(({ locale }) => locale)
  const [expandedIdentity, setExpandedIdentity] = useState<string | null>(null)

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>{t(locale, 'review.xray.rule')}</th>
          <th>{t(locale, 'review.xray.usedFor')}</th>
          <th>{t(locale, 'review.xray.conditions')}</th>
          <th>{t(locale, 'review.xray.source')}</th>
          <th>{t(locale, 'review.xray.confidence')}</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rules.map((rule) => (
          <tr key={rule.identity} data-testid={`xray-rule-${rule.rule.key}`}>
            <th>{rule.rule.key}</th>
            <td>{rule.usedFor.join('・')}</td>
            <td>{conditionText(rule.rule)}</td>
            <td><SourceChips rules={[rule.rule]} /></td>
            <td><ConfidenceWarning line={rule.rule} /></td>
            <td>
              <RebarRuleUsers
                rule={rule}
                project={project}
                rebars={rebars}
                lines={lines}
                expanded={expandedIdentity === rule.identity}
                onToggle={() => setExpandedIdentity(
                  expandedIdentity === rule.identity ? null : rule.identity,
                )}
                setHoverRow={setHoverRow}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function XRayCard({
  view,
  project,
  rebars,
  lines,
  setHoverRow,
}: {
  view: XRayView
  project: TakeoffSnapshot['project']
  rebars: ReviewRebar[]
  lines: ReviewLine[]
  setHoverRow(rowId: string | null): void
}) {
  const locale = useAppStore(({ locale }) => locale)
  const differs = view.shape.drawn && (
    view.shape.differsFromDesign.length || view.shape.differsFromDesign.count
  )

  return (
    <article data-testid={`xray-member-${view.member.id}`}>
      <h3>{view.member.storyName} · {view.member.mark} · {view.rebar.role}</h3>
      <table className={styles.table}>
        <thead>
          <tr>
            <th />
            <th>{t(locale, 'review.xray.design')}</th>
            <th>{t(locale, 'review.xray.shape')}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>{t(locale, 'review.xray.length')}</th>
            <td data-testid="xray-design-length">{formatLength(view.quantity.designLengthMm)}</td>
            <td data-testid="xray-drawn-length">
              {view.shape.drawn ? formatLength(view.shape.drawnLengthMm) : view.shape.reason}
            </td>
          </tr>
          <tr>
            <th>{t(locale, 'review.xray.count')}</th>
            <td data-testid="xray-design-count">{view.quantity.designCount}</td>
            <td data-testid="xray-placed-count">{shapeCount(view)}</td>
          </tr>
          {differs && (
            <tr>
              <th colSpan={3} data-testid="xray-differs">
                {t(locale, 'review.xray.differs')}
              </th>
            </tr>
          )}
        </tbody>
      </table>
      <pre className={styles.formula}>{view.formula}</pre>
      <RuleTable
        rules={view.rules}
        project={project}
        rebars={rebars}
        lines={lines}
        setHoverRow={setHoverRow}
      />
      {view.zones.length > 0 && (
        <ul>
          {view.zones.map((zone) => (
            <li key={`${zone.ruleKey}-${zone.fromMm}`}>
              {t(locale, 'review.xray.zone')}: {zone.fromMm}–{zone.toMm}mm ({formatLength(zone.lengthMm)}m) · {zone.ruleKey}
              <SourceChips rules={[zone.rule]} />
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}

function XRaySection() {
  const project = useAppStore(({ project }) => project)
  const memberId = useAppStore(({ sel }) => sel.memberId)
  const hoverRowId = useAppStore(({ hoverRowId }) => hoverRowId)
  const setHoverRow = useAppStore(({ setHoverRow }) => setHoverRow)
  const locale = useAppStore(({ locale }) => locale)
  const { currentSnapshot } = useReviewModel()
  const jointResolution = resolveJoint(project, memberId ?? '')
  const jointMemberIds = jointResolution.status === 'joint'
    ? new Set(jointRebarMemberIds(project, jointResolution.joint))
    : new Set<string>()
  const jointRebars = currentSnapshot.rebars.filter(({ memberId: id }) => jointMemberIds.has(id))
  const ruleRebars = jointRebars.length === 0 ? currentSnapshot.rebars : jointRebars
  const views = hoverRowId === null
    ? []
    : xrayForRow(
        hoverRowId,
        currentSnapshot.rebars,
        currentSnapshot.project,
        currentSnapshot.lines,
      )

  return (
    <section aria-labelledby="review-xray-title" data-testid="review-xray">
      <h2 id="review-xray-title">{t(locale, 'review.xray.title')}</h2>
      {hoverRowId === null ? (
        <p>{t(locale, 'review.xray.empty')}</p>
      ) : views.length === 0 ? (
        <p>{t(locale, 'review.xray.notFound')}</p>
      ) : (
        views.map((view) => (
          <XRayCard
            key={view.rebar.id}
            view={view}
            project={currentSnapshot.project}
            rebars={ruleRebars}
            lines={currentSnapshot.lines}
            setHoverRow={setHoverRow}
          />
        ))
      )}
    </section>
  )
}

const REVIEW_LAYERS = ['main', 'hoop', 'concrete'] as const

type ReviewDraft = {
  title: string
  body: string
  targets: ElementRef[]
  finding?: RecordedFinding
}

interface ReviewItemRequest {
  token: number
  finding: geometryCheck.Finding | null
  checkId: string | null
}

function recordedFinding(finding: geometryCheck.Finding, checkId: string): RecordedFinding {
  const [firstPoint, secondPoint] = finding.closestPoints
  return {
    checkId,
    findingId: finding.id,
    kind: finding.kind,
    clearanceMm: finding.clearanceMm,
    a: {
      memberId: finding.a.memberId,
      rebarId: finding.a.rebarId,
      role: finding.a.role,
      barIndex: finding.a.barIndex,
      segmentIndex: finding.a.segmentIndex,
    },
    b: {
      memberId: finding.b.memberId,
      rebarId: finding.b.rebarId,
      role: finding.b.role,
      barIndex: finding.b.barIndex,
      segmentIndex: finding.b.segmentIndex,
    },
    closestPoints: [
      [firstPoint[0], firstPoint[1], firstPoint[2]],
      [secondPoint[0], secondPoint[1], secondPoint[2]],
    ],
    basis: basisText(finding),
  }
}

function fingerprintsForItem(
  item: ReviewItem,
  project: TakeoffSnapshot['project'],
  fingerprints: ReturnType<typeof useReviewModel>['current']['fingerprints'],
) {
  const members = Object.fromEntries(
    itemTargetMemberIds(item, project).memberIds.flatMap((memberId) => {
      const fingerprint = fingerprints.members[memberId]
      return fingerprint === undefined ? [] : [[memberId, fingerprint] as const]
    }),
  )
  return { ...fingerprints, members }
}

function targetMemberId(ref: ElementRef): string | null {
  if (ref.kind === 'member' || ref.kind === 'joint') {
    return ref.kind === 'member' ? ref.memberId : ref.columnMemberId
  }
  if (ref.kind === 'rebar') return ref.rebarId.split('|', 1)[0] ?? null
  return null
}

function targetLabel(ref: ElementRef): string {
  if (ref.kind === 'member') return ref.memberId
  if (ref.kind === 'joint') return `接合部 ${ref.columnMemberId}`
  if (ref.kind === 'rebar') return `鉄筋 ${ref.rebarId}`
  return `内訳 ${ref.lineId}`
}

function cloneProject(project: TakeoffSnapshot['project']): TakeoffSnapshot['project'] {
  return JSON.parse(JSON.stringify(project)) as TakeoffSnapshot['project']
}

function lineForChange(
  change: LineChange,
  baseline: TakeoffSnapshot | null,
  current: TakeoffSnapshot,
): ReviewLine | undefined {
  return current.lines.find(({ id }) => id === change.lineId)
    ?? baseline?.lines.find(({ id }) => id === change.lineId)
}

function lineLabel(line: ReviewLine | undefined, lineId: string): string {
  if (line === undefined) return lineId
  return `${line.memberKind} ${line.role} ${line.mark} ${line.size}`
}

function massValue(value: number | null): string {
  return value === null ? '—' : value.toFixed(3)
}

function massState(value: '算出' | '単位質量未入力' | null): string {
  return value ?? '—'
}

type ComparableEntity = Exclude<EntityChange, { kind: 'displayOnly' }>

function entityKindLabel(locale: Parameters<typeof t>[0], kind: ComparableEntity['kind']): string {
  return t(locale, `review.compare.entity.kind.${kind}`)
}

function entityChangeLabel(locale: Parameters<typeof t>[0], change: ComparableEntity['change']): string {
  if (change === '追加') return t(locale, 'review.compare.entity.change.added')
  if (change === '削除') return t(locale, 'review.compare.entity.change.removed')
  if (change === '変更') return t(locale, 'review.compare.entity.change.changed')
  return t(locale, 'review.compare.entity.change.needsReview')
}

function ReviewCompareSection() {
  const project = useAppStore(({ project }) => project)
  const review = useAppStore(({ review }) => review)
  const locale = useAppStore(({ locale }) => locale)
  const setReview = useAppStore(({ setReview }) => setReview)
  const selectMember = useAppStore(({ selectMember }) => selectMember)
  const { current, currentSnapshot, baselineSnapshot } = useReviewModel()
  const [label, setLabel] = useState('')
  const [discardConfirmation, setDiscardConfirmation] = useState(false)
  const baseline = review.baseline
  const impact = current.impact

  const captureBaseline = () => {
    const capturedAt = new Date().toISOString()
    const nextBaseline: Baseline = {
      label: label.trim(),
      capturedAt,
      project: cloneProject(project),
      fingerprints: current.fingerprints,
    }
    setReview((state) => setBaseline(state, nextBaseline))
  }

  const discardBaseline = () => {
    if (!discardConfirmation) {
      setDiscardConfirmation(true)
      return
    }
    setReview((state) => setBaseline(state, null))
    setDiscardConfirmation(false)
  }

  return (
    <section className={styles.compare} aria-labelledby="review-compare-title" data-testid="review-compare">
      <h2 id="review-compare-title">{t(locale, 'review.compare.title')}</h2>
      {baseline === null ? (
        <div>
          <label>
            {t(locale, 'review.compare.label')}
            <input
              aria-label={t(locale, 'review.compare.label')}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </label>
          <button type="button" onClick={captureBaseline}>
            {t(locale, 'review.compare.capture')}
          </button>
        </div>
      ) : (
        <>
          <dl>
            <dt>{t(locale, 'review.compare.baseline')}</dt>
            <dd>{baseline.label || t(locale, 'review.compare.untitled')}</dd>
            <dt>{t(locale, 'review.compare.capturedAt')}</dt>
            <dd><time dateTime={baseline.capturedAt}>{baseline.capturedAt}</time></dd>
          </dl>
          <button type="button" onClick={discardBaseline}>
            {t(locale, 'review.compare.discard')}
          </button>
          {discardConfirmation && (
            <p role="status">{t(locale, 'review.compare.discardConfirm')}</p>
          )}
          {impact === null ? (
            <p>{t(locale, 'review.compare.noImpact')}</p>
          ) : (
            <>
              <p data-testid="review-compare-summary">
                {t(locale, 'review.compare.summary.members')} {impact.members.length} ·{' '}
                {t(locale, 'review.compare.summary.lines')} {impact.lines.length} ·{' '}
                {t(locale, 'review.compare.summary.displayOnly')} {impact.displayOnly.length}
              </p>
              {impact.rulepackChanged && (
                <p>{t(locale, 'review.compare.rulepackChanged')}</p>
              )}
              {impact.checkVersionChanged && (
                <p>{t(locale, 'review.compare.checkVersionChanged')}</p>
              )}

              <div>
                <h3>{t(locale, 'review.compare.entities')}</h3>
                <ul data-testid="review-compare-entities">
                  {impact.entities
                    .filter((entity) => entity.kind !== 'displayOnly')
                    .map((entity, index) => (
                      <li
                        key={`${entity.kind}-${index}`}
                        data-review-entity
                        data-review-entity-kind={entity.kind}
                        data-review-entity-change={entity.change}
                      >
                        <span className={styles.compareEntityKind}>{entityKindLabel(locale, entity.kind)}</span>{' '}
                        <span className={entity.change === '対応要確認' ? styles.compareNeedsReview : styles.compareEntityChange} data-review-entity-needs-review={entity.change === '対応要確認' ? true : undefined}>
                          {entityChangeLabel(locale, entity.change)}
                        </span>{' '}
                        <span>{entity.detail}</span>
                        {entity.change === '対応要確認' && (
                          <span> — {t(locale, 'review.compare.needsReviewDetail')}</span>
                        )}
                      </li>
                    ))}
                </ul>
              </div>

              <div data-testid="review-compare-members">
                <h3>{t(locale, 'review.compare.members')}</h3>
                <table>
                  <thead>
                    <tr>
                      <th>{t(locale, 'review.compare.member')}</th>
                      <th>{t(locale, 'review.compare.categories')}</th>
                      <th>{t(locale, 'review.compare.paths')}</th>
                      <th>{t(locale, 'review.compare.support')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {impact.members.map((member) => {
                      const canSelect = currentSnapshot.project.members.some(({ id }) => id === member.memberId)
                      return (
                        <tr key={member.memberId}>
                          <td>
                            <button
                              type="button"
                              disabled={!canSelect}
                              onClick={() => { if (canSelect) selectMember(member.memberId) }}
                            >
                              {member.memberId}
                            </button>
                          </td>
                          <td>
                            {member.categories.map((category) => (
                              <span className={styles.compareCategory} data-review-member-category={category} key={category}>{category}</span>
                            ))}
                          </td>
                          <td>
                            <ul>
                              {member.path.map((path) => <li key={path}>{path}</li>)}
                            </ul>
                          </td>
                          <td data-review-support>{member.support.before} → {member.support.after}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div data-testid="review-compare-lines">
                <h3>{t(locale, 'review.compare.lines')}</h3>
                <table>
                  <thead>
                    <tr>
                      <th>{t(locale, 'review.compare.line')}</th>
                      <th>{t(locale, 'review.compare.change')}</th>
                      <th>{t(locale, 'review.compare.fields')}</th>
                      <th>{t(locale, 'review.compare.mass')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {impact.lines.map((change) => {
                      const line = lineForChange(change, baselineSnapshot, currentSnapshot)
                      return (
                        <tr key={change.lineId} data-line-id={change.lineId}>
                          <td>{lineLabel(line, change.lineId)}</td>
                          <td>{change.change}</td>
                          <td>{change.fields.join('・')}</td>
                          <td data-review-line-mass>
                            {change.mass === undefined
                              ? '—'
                              : `${massState(change.mass.before)} → ${massState(change.mass.after)} ` +
                                `(${massValue(change.mass.beforeKg)} → ${massValue(change.mass.afterKg)}kg)`}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <details data-testid="review-compare-display-only">
                <summary>{t(locale, 'review.compare.displayOnly')}</summary>
                <ul>
                  {impact.displayOnly.map((change, index) => (
                    <li data-review-display-only-item key={`${change.kind}-${index}`}>{change.detail}</li>
                  ))}
                </ul>
              </details>
            </>
          )}
        </>
      )}
    </section>
  )
}

function itemStatusLabel(locale: Parameters<typeof t>[0], status: ReturnType<typeof effectiveItemStatus>): string {
  if (status === '未確認') return t(locale, 'review.items.status.unconfirmed')
  if (status === '確認済') return t(locale, 'review.items.status.confirmed')
  if (status === '保留') return t(locale, 'review.items.status.hold')
  if (status === '判断不可') return t(locale, 'review.items.status.unavailable')
  return t(locale, 'review.items.status.recheck')
}

function ReviewItemsSection({
  request,
  onRequestConsumed,
}: {
  request: ReviewItemRequest | null
  onRequestConsumed(): void
}) {
  const project = useAppStore(({ project }) => project)
  const review = useAppStore(({ review }) => review)
  const sel = useAppStore(({ sel }) => sel)
  const hoverRowId = useAppStore(({ hoverRowId }) => hoverRowId)
  const locale = useAppStore(({ locale }) => locale)
  const viewerMode = useAppStore(({ viewerMode }) => viewerMode)
  const viewerLayers = useAppStore(({ viewerLayers }) => viewerLayers)
  const viewerClip = useAppStore(({ viewerClip }) => viewerClip)
  const viewerPose = useAppStore(({ viewerPose }) => viewerPose)
  const setReview = useAppStore(({ setReview }) => setReview)
  const selectMember = useAppStore(({ selectMember }) => selectMember)
  const setViewerMode = useAppStore(({ setViewerMode }) => setViewerMode)
  const toggleViewerLayer = useAppStore(({ toggleViewerLayer }) => toggleViewerLayer)
  const setViewerClip = useAppStore(({ setViewerClip }) => setViewerClip)
  const setHoverRow = useAppStore(({ setHoverRow }) => setHoverRow)
  const requestViewerPose = useAppStore(({ requestViewerPose }) => requestViewerPose)
  const { current } = useReviewModel()
  const [draft, setDraft] = useState<ReviewDraft | null>(null)
  const [showRecheckOnly, setShowRecheckOnly] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [confirmBy, setConfirmBy] = useState('')
  const [confirmNote, setConfirmNote] = useState('')
  const [confirmError, setConfirmError] = useState(false)
  const [holdingId, setHoldingId] = useState<string | null>(null)
  const [holdReason, setHoldReason] = useState('')
  const [holdError, setHoldError] = useState(false)

  // 接合部が成立しない部材に接合部タゲットを付けると、validity が 対象なし を
  // 付け続けて項目が永久に 再検討必要 になる。判定は domain の resolveJoint が持つ
  // ので、ここで種別分岐を書き直さずにその結果を使う。
  const draftColumnMemberId = sel.memberId ?? null
  const draftJoint = draftColumnMemberId === null
    ? ({ status: 'unsupported', reason: '部材なし' } as const)
    : resolveJoint(project, draftColumnMemberId)
  const jointUnavailableReason = draftJoint.status === 'unsupported' ? draftJoint.reason : null

  const openDraft = (finding?: geometryCheck.Finding, checkId?: string) => {
    const columnMemberId = sel.memberId ?? finding?.a.memberId ?? null
    if (columnMemberId === null || resolveJoint(project, columnMemberId).status !== 'joint') return
    const targets: ElementRef[] = [{ kind: 'joint', columnMemberId }]
    if (finding !== undefined) {
      targets.push(
        { kind: 'rebar', rebarId: finding.a.rebarId },
        { kind: 'rebar', rebarId: finding.b.rebarId },
      )
    }
    setDraft({
      title: finding === undefined ? '' : `${finding.kind}: ${formatBarRef(project, finding.a)} × ${formatBarRef(project, finding.b)}`,
      body: '',
      targets,
      ...(finding === undefined || checkId === undefined ? {} : { finding: recordedFinding(finding, checkId) }),
    })
  }

  useEffect(() => {
    if (request === null) return
    openDraft(request.finding ?? undefined, request.checkId ?? undefined)
    onRequestConsumed()
  }, [openDraft, onRequestConsumed, request])

  const saveDraft = () => {
    if (draft === null) return
    const capturedAt = new Date().toISOString()
    const item: ReviewItem = {
      id: newReviewId('review-item', review.items.map(({ id }) => id)),
      createdAt: capturedAt,
      updatedAt: capturedAt,
      targets: draft.targets,
      title: draft.title,
      body: draft.body,
      status: '未確認',
      confirmations: [],
      snapshot: {
        capturedAt,
        fingerprints: current.fingerprints,
        viewer: {
          mode: viewerMode,
          pose: viewerPose,
          clip: viewerClip,
          layers: { ...viewerLayers },
          selection: {
            group: sel.group,
            memberId: sel.memberId,
            rowId: hoverRowId,
          },
        },
      },
      ...(draft.finding === undefined ? {} : { finding: draft.finding }),
    }
    item.snapshot = {
      ...item.snapshot,
      fingerprints: fingerprintsForItem(item, project, current.fingerprints),
    }
    setReview((state) => addItem(state, item))
    setDraft(null)
  }

  const saveConfirmation = (itemId: string) => {
    const by = confirmBy.trim()
    if (by === '') {
      setConfirmError(true)
      return
    }
    const at = new Date().toISOString()
    const confirmation = { by, at, note: confirmNote }
    setReview((state) => {
      const item = state.items.find(({ id }) => id === itemId)
      if (item === undefined) return state
      const confirmed = confirmItem(state, itemId, confirmation)
      return updateItem(confirmed, itemId, {
        snapshot: {
          ...item.snapshot,
          fingerprints: fingerprintsForItem(item, project, current.fingerprints),
        },
      })
    })
    setConfirmingId(null)
    setConfirmBy('')
    setConfirmNote('')
    setConfirmError(false)
  }

  const saveHold = (itemId: string) => {
    const reason = holdReason.trim()
    if (reason === '') {
      setHoldError(true)
      return
    }
    setReview((state) => holdItem(state, itemId, reason))
    setHoldingId(null)
    setHoldReason('')
    setHoldError(false)
  }

  const replay = (item: ReviewItem) => {
    const { viewer } = item.snapshot
    setViewerMode(viewer.mode)
    setViewerClip(viewer.clip)
    for (const layer of REVIEW_LAYERS) {
      if (viewerLayers[layer] !== viewer.layers[layer]) toggleViewerLayer(layer)
    }
    if (viewer.selection.memberId !== null) selectMember(viewer.selection.memberId)
    setHoverRow(viewer.selection.rowId)
    requestViewerPose(viewer.pose)
  }

  const visibleItems = showRecheckOnly
    ? itemsNeedingRecheck(review.items, current)
    : review.items

  return (
    <section aria-labelledby="review-items-title" data-testid="review-items">
      <h2 id="review-items-title">{t(locale, 'review.items.title')}</h2>
      <button type="button" disabled={jointUnavailableReason !== null} onClick={() => openDraft()}>
        {t(locale, 'review.items.add')}
      </button>
      {jointUnavailableReason !== null && (
        <p role="status" data-testid="review-items-joint-unavailable">
          {t(locale, 'review.items.jointUnavailable')} — {jointUnavailableReason}
        </p>
      )}
      <label>
        <input
          type="checkbox"
          checked={showRecheckOnly}
          onChange={(event) => setShowRecheckOnly(event.target.checked)}
        />
        {t(locale, 'review.items.filterRecheck')}
      </label>

      {draft !== null && (
        <form onSubmit={(event) => { event.preventDefault(); saveDraft() }}>
          <label>
            {t(locale, 'review.items.formTitle')}
            <input
              aria-label={t(locale, 'review.items.formTitle')}
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
          </label>
          <label>
            {t(locale, 'review.items.body')}
            <textarea
              aria-label={t(locale, 'review.items.body')}
              value={draft.body}
              onChange={(event) => setDraft({ ...draft, body: event.target.value })}
            />
          </label>
          <button type="submit">{t(locale, 'review.items.save')}</button>
          <button type="button" onClick={() => setDraft(null)}>{t(locale, 'review.items.cancel')}</button>
        </form>
      )}

      <div>
        {visibleItems.map((item) => {
          const validity = itemValidity(item, current)
          const status = effectiveItemStatus(item, validity)
          return (
            <article key={item.id} data-testid={item.id} className={styles.itemCard}>
              <h3>{item.title || t(locale, 'review.items.untitled')}</h3>
              <p>{item.body}</p>
              <p className={styles.itemStatus} data-review-status={status}>
                {itemStatusLabel(locale, status)}
              </p>
              {validity.state === '再検討必要' && (
                <ul>
                  {validity.reasons.map((reason) => (
                    <li key={`${reason.kind}-${reason.memberId ?? ''}`}>
                      {reason.kind}{reason.memberId === undefined ? '' : ` · ${reason.memberId}`} — {reason.detail}
                    </li>
                  ))}
                </ul>
              )}
              <div>
                {item.targets.map((target, index) => {
                  const memberId = targetMemberId(target)
                  return (
                    <button
                      key={`${target.kind}-${index}`}
                      type="button"
                      disabled={memberId === null}
                      onClick={() => { if (memberId !== null) selectMember(memberId) }}
                    >
                      {targetLabel(target)}
                    </button>
                  )
                })}
              </div>
              {item.finding !== undefined && (
                <p>
                  <strong>{t(locale, 'review.items.recordedMeasurement')}</strong>:{' '}
                  {item.finding.kind} · {item.finding.clearanceMm}mm · {t(locale, 'review.items.notCurrentValue')}
                </p>
              )}
              <div>
                <button type="button" onClick={() => replay(item)}>{t(locale, 'review.items.replay')}</button>
                <button type="button" onClick={() => { setConfirmingId(item.id); setHoldingId(null); setConfirmError(false) }}>
                  {t(locale, 'review.items.confirm')}
                </button>
                <button type="button" onClick={() => { setHoldingId(item.id); setConfirmingId(null); setHoldError(false) }}>
                  {t(locale, 'review.items.hold')}
                </button>
                <button type="button" onClick={() => setReview((state) => updateItem(state, item.id, { status: '判断不可' }))}>
                  {t(locale, 'review.items.unavailable')}
                </button>
              </div>
              {confirmingId === item.id && (
                <div>
                  <label>
                    {t(locale, 'review.items.confirmBy')}
                    <input
                      aria-label={t(locale, 'review.items.confirmBy')}
                      value={confirmBy}
                      onChange={(event) => setConfirmBy(event.target.value)}
                    />
                  </label>
                  <label>
                    {t(locale, 'review.items.confirmNote')}
                    <input
                      aria-label={t(locale, 'review.items.confirmNote')}
                      value={confirmNote}
                      onChange={(event) => setConfirmNote(event.target.value)}
                    />
                  </label>
                  {confirmError && <p role="alert">{t(locale, 'review.items.confirmByRequired')}</p>}
                  <button type="button" onClick={() => saveConfirmation(item.id)}>{t(locale, 'review.items.saveConfirmation')}</button>
                </div>
              )}
              {holdingId === item.id && (
                <div>
                  <label>
                    {t(locale, 'review.items.holdReason')}
                    <input
                      aria-label={t(locale, 'review.items.holdReason')}
                      value={holdReason}
                      onChange={(event) => setHoldReason(event.target.value)}
                    />
                  </label>
                  {holdError && <p role="alert">{t(locale, 'review.items.holdReasonRequired')}</p>}
                  <button type="button" onClick={() => saveHold(item.id)}>{t(locale, 'review.items.saveHold')}</button>
                </div>
              )}
              {validity.state === '再検討必要' && (
                <p>{t(locale, 'review.items.staleNotice')}</p>
              )}
            </article>
          )
        })}
      </div>
      <p data-testid="data-review-notice" data-review-notice>{t(locale, 'review.items.notice')}</p>
    </section>
  )
}

export function ReviewPane({ onCreateItem }: ReviewCheckProps) {
  const [request, setRequest] = useState<ReviewItemRequest | null>(null)
  const requestToken = useRef(0)
  const requestItem = (finding: geometryCheck.Finding, checkId?: string) => {
    requestToken.current += 1
    setRequest({ token: requestToken.current, finding, checkId: checkId ?? null })
    onCreateItem?.(finding, checkId)
  }

  return (
    <div className={styles.pane}>
      <JointSection />
      <XRaySection />
      <ReviewCheckSection onCreateItem={requestItem} />
      <ReviewItemsSection request={request} onRequestConsumed={() => setRequest(null)} />
      <ReviewCompareSection />
    </div>
  )
}
