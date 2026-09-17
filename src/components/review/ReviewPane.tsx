'use client'

import { useMemo, useState } from 'react'

import { jointRebarMemberIds, resolveJoint } from '@/domain/review/joint'
import type { TakeoffSnapshot } from '@/domain/review/impact'
import type { RuleHit } from '@/domain/rules/types'
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

import styles from './ReviewPane.module.css'

type ReviewRebar = TakeoffSnapshot['rebars'][number]
type ReviewLine = TakeoffSnapshot['lines'][number]

function conditionText(rule: RuleHit): string {
  return Object.entries(rule.conditions)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(', ')
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

export function ReviewPane() {
  return (
    <div className={styles.pane}>
      <JointSection />
      <XRaySection />
    </div>
  )
}
