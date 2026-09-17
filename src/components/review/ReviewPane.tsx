'use client'

import { useMemo, useRef, useState, type KeyboardEvent } from 'react'

import { sectionMarkLabel } from '@/domain/model/member'
import { findSection } from '@/domain/model/project'
import { jointRebarMemberIds, resolveJoint } from '@/domain/review/joint'
import type { TakeoffSnapshot } from '@/domain/review/impact'
import {
  addExclusion,
  removeExclusion,
  setClearance,
} from '@/domain/review/state'
import type {
  CheckExclusion,
  FindingKind,
  ClearanceBasis,
} from '@/domain/review/types'
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
  onCreateItem?: (finding: geometryCheck.Finding) => void
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
                    <td><button type="button" onClick={() => onCreateItem(finding)}>{t(locale, 'review.check.createItem')}</button></td>
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

export function ReviewPane({ onCreateItem }: ReviewCheckProps) {
  return (
    <div className={styles.pane}>
      <JointSection />
      <XRaySection />
      <ReviewCheckSection onCreateItem={onCreateItem} />
    </div>
  )
}
