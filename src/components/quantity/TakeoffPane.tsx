'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'
import posthog from 'posthog-js'

import type { RebarShape } from '@/domain/model/rebar'
import { memberGroupKey, setNote } from '@/domain/model/project'
import {
  grandTotal,
  storySubtotals,
  type QuantityLine,
} from '@/domain/quantity'
import type { RuleHit } from '@/domain/rules/types'
import { lookupMarkup } from '@/domain/rules/lookup'
import { exportTakeoffXlsx } from '@/lib/export'
import { useTakeoff } from '@/lib/hooks/useTakeoff'
import { t } from '@/lib/i18n'
import { useAppStore } from '@/lib/store'
import { jpMlitRulePack } from '@/rulepack'

import styles from './TakeoffPane.module.css'

export interface TakeoffTableProps {
  lines: QuantityLine[]
}

interface QuantityGroup {
  id: string
  memberKind: QuantityLine['memberKind']
  mark: string
  sectionLabel: string
  places: number
  lines: QuantityLine[]
}

function formatLength(lengthMm: number): string {
  return (lengthMm / 1000).toFixed(3)
}

function formatMass(massKg: number): string {
  return massKg.toFixed(3)
}

function groupsByStory(lines: QuantityLine[]): Map<string, QuantityGroup[]> {
  const stories = new Map<string, Map<string, QuantityGroup>>()

  for (const line of lines) {
    let groups = stories.get(line.storyName)
    if (!groups) {
      groups = new Map<string, QuantityGroup>()
      stories.set(line.storyName, groups)
    }

    const group = groups.get(line.groupId)
    if (group) {
      group.lines.push(line)
      continue
    }

    groups.set(line.groupId, {
      id: line.groupId,
      memberKind: line.memberKind,
      mark: line.mark,
      sectionLabel: line.sectionLabel,
      places: line.places,
      lines: [line],
    })
  }

  return new Map(
    [...stories].map(([story, groups]) => [story, [...groups.values()]]),
  )
}

function ShapeIcon({ shape }: { shape: RebarShape }) {
  const locale = useAppStore(({ locale }) => locale)

  return (
    <svg
      className={styles.shapeIcon}
      viewBox="0 0 32 18"
      width="32"
      height="18"
      role="img"
      aria-label={t(locale, `shape.${shape}`)}
    >
      {shape === 'straight' && <path d="M3 9H29" />}
      {shape === 'hook90' && <path d="M3 14H23V4H29" />}
      {shape === 'hoop' && <rect x="4" y="3" width="24" height="12" />}
    </svg>
  )
}

function sourceLabel(rule: RuleHit): string {
  return [rule.source.short, rule.source.section].filter(Boolean).join(' ')
}

function sourceTooltip(rule: RuleHit): string {
  const edition = rule.source.edition ? `（${rule.source.edition}）` : ''
  const location = [
    `${rule.source.doc}${edition}`,
    rule.source.section,
    rule.source.page === null ? null : `${rule.source.page}頁`,
  ]
    .filter(Boolean)
    .join(' ')
  const note = rule.source.url
    ? rule.note
    : `原文URL未確保 — ${rule.note}`

  return [
    `${rule.label} ＝ ${rule.expr}`,
    location,
    rule.confidence === 'inferred' ? '⚠ 未確認 —' : null,
    note,
  ]
    .filter(Boolean)
    .join('\n')
}

function stopRowInteraction(event: MouseEvent<HTMLElement>): void {
  event.stopPropagation()
}

function SourceChip({ rule }: { rule: RuleHit }) {
  const label = sourceLabel(rule)
  const className = [
    styles.sourceChip,
    rule.confidence === 'inferred' ? styles.inferredSourceChip : '',
    rule.source.url === null ? styles.disabledSourceChip : '',
  ]
    .filter(Boolean)
    .join(' ')
  const title = sourceTooltip(rule)

  if (rule.source.url === null) {
    return (
      <span
        className={className}
        role="link"
        aria-disabled="true"
        tabIndex={0}
        title={title}
        onClick={stopRowInteraction}
      >
        {label}
      </span>
    )
  }

  return (
    <a
      className={className}
      href={rule.source.url}
      target="_blank"
      rel="noreferrer noopener"
      title={title}
      onClick={stopRowInteraction}
    >
      {label}
    </a>
  )
}

function SourceChips({ rules }: { rules: RuleHit[] }) {
  return (
    <div
      className={styles.sourceChips}
      onClick={stopRowInteraction}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {rules.map((rule, index) => (
        <SourceChip key={`${rule.key}-${index}`} rule={rule} />
      ))}
    </div>
  )
}

function InferredWarning({ line }: { line: QuantityLine }) {
  if (!line.inferred) return null

  const labels = line.rules
    .filter(({ confidence }) => confidence === 'inferred')
    .map(({ label }) => label)
    .join('、')

  return (
    <span
      className={styles.inferredWarning}
      role="img"
      aria-label="未確認の規準値"
      title={labels}
    >
      ▲
    </span>
  )
}

function isActivationKey(event: KeyboardEvent<HTMLTableRowElement>): boolean {
  return event.key === 'Enter' || event.key === ' '
}

function NoteInput({ lineId }: { lineId: string }) {
  const note = useAppStore(({ project }) => project.notes?.[lineId] ?? '')
  const updateProject = useAppStore(({ updateProject }) => updateProject)

  return (
    <input
      className={styles.noteInput}
      value={note}
      aria-label={`${lineId} 備考`}
      onChange={(event) => {
        const next = event.currentTarget.value
        updateProject((project) => setNote(project, lineId, next))
      }}
      onClick={stopRowInteraction}
      onKeyDown={(event) => event.stopPropagation()}
    />
  )
}

export function TakeoffTable({ lines }: TakeoffTableProps) {
  const project = useAppStore(({ project }) => project)
  const locale = useAppStore(({ locale }) => locale)
  const selectedGroup = useAppStore(({ sel }) => sel.group)
  const selectGroup = useAppStore(({ selectGroup }) => selectGroup)
  const setHoverRow = useAppStore(({ setHoverRow }) => setHoverRow)
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)
  const groupRows = useRef(new Map<string, HTMLTableRowElement>())
  const subtotals = useMemo(() => storySubtotals(lines), [lines])
  const total = useMemo(() => grandTotal(lines), [lines])
  const storyGroups = useMemo(() => groupsByStory(lines), [lines])
  const representatives = useMemo(() => {
    const result = new Map<string, string>()

    for (const member of project.members) {
      const groupId = memberGroupKey(project, member)
      if (!result.has(groupId)) result.set(groupId, member.id)
    }

    return result
  }, [project])

  useEffect(() => {
    if (!selectedGroup) return
    groupRows.current.get(selectedGroup)?.scrollIntoView({ block: 'nearest' })
  }, [selectedGroup])

  const selectQuantityGroup = (groupId: string, memberId: string) => {
    selectGroup(groupId, memberId)
    posthog.capture('member_selected', { source: 'takeoff' })
  }

  const toggleLine = (line: QuantityLine, memberId: string) => {
    selectQuantityGroup(line.groupId, memberId)
    setExpandedRowId((current) => (current === line.id ? null : line.id))
  }

  return (
    <div className={styles.tableFrame}>
      <table className={styles.table}>
        <thead data-testid="takeoff-head">
          <tr>
            <th scope="col">{t(locale, 'takeoff.rebar')}</th>
            <th scope="col" className={styles.numericCell}>
              {t(locale, 'takeoff.diameter')}
            </th>
            <th scope="col">{t(locale, 'takeoff.shape')}</th>
            <th scope="col" className={styles.numericCell}>
              {t(locale, 'takeoff.length')}
            </th>
            <th scope="col" className={styles.numericCell}>
              {t(locale, 'takeoff.count')}
            </th>
            <th scope="col" className={styles.numericCell}>
              {t(locale, 'takeoff.places')}
            </th>
            <th scope="col" className={styles.numericCell}>
              {t(locale, 'takeoff.totalLength')}
            </th>
            <th scope="col" className={styles.numericCell}>
              {t(locale, 'takeoff.unitMass')}
            </th>
            <th scope="col" className={styles.numericCell}>
              {t(locale, 'takeoff.designQuantity')}
            </th>
            <th
              scope="col"
              className={`${styles.numericCell} ${styles.requiredColumn}`}
            >
              {t(locale, 'takeoff.requiredQuantity')}
            </th>
            <th scope="col">{t(locale, 'takeoff.source')}</th>
            <th scope="col">{t(locale, 'takeoff.note')}</th>
          </tr>
        </thead>
        <tbody>
          {subtotals.map((subtotal) => (
            <StoryRows
              key={subtotal.storyName}
              storyName={subtotal.storyName}
              designKg={subtotal.designKg}
              requiredKg={subtotal.requiredKg}
              groups={storyGroups.get(subtotal.storyName) ?? []}
              representatives={representatives}
              selectedGroup={selectedGroup}
              expandedRowId={expandedRowId}
              groupRows={groupRows.current}
              selectQuantityGroup={selectQuantityGroup}
              toggleLine={toggleLine}
              setHoverRow={setHoverRow}
            />
          ))}
          <tr className={styles.totalRow} data-testid="grand-total">
            <th scope="row" colSpan={8}>
              {t(locale, 'takeoff.total')}
            </th>
            <td className={styles.numericCell}>{formatMass(total.designKg)}</td>
            <td className={`${styles.numericCell} ${styles.requiredColumn}`}>
              {formatMass(total.requiredKg)}
            </td>
            <td colSpan={2} />
          </tr>
        </tbody>
      </table>
    </div>
  )
}

interface StoryRowsProps {
  storyName: string
  designKg: number
  requiredKg: number
  groups: QuantityGroup[]
  representatives: Map<string, string>
  selectedGroup: string | null
  expandedRowId: string | null
  groupRows: Map<string, HTMLTableRowElement>
  selectQuantityGroup(groupId: string, memberId: string): void
  toggleLine(line: QuantityLine, memberId: string): void
  setHoverRow(rowId: string | null): void
}

function StoryRows({
  storyName,
  designKg,
  requiredKg,
  groups,
  representatives,
  selectedGroup,
  expandedRowId,
  groupRows,
  selectQuantityGroup,
  toggleLine,
  setHoverRow,
}: StoryRowsProps) {
  return (
    <>
      <tr className={styles.storyRow} data-testid={`story-subtotal-${storyName}`}>
        <th scope="row" colSpan={8}>
          {storyName}
        </th>
        <td className={styles.numericCell}>{formatMass(designKg)}</td>
        <td className={`${styles.numericCell} ${styles.requiredColumn}`}>
          {formatMass(requiredKg)}
        </td>
        <td colSpan={2} />
      </tr>
      {groups.map((group) => {
        const representative = representatives.get(group.id)
        if (!representative) {
          throw new Error(`Representative member not found: ${group.id}`)
        }

        const selected = selectedGroup === group.id

        return (
          <GroupRows
            key={group.id}
            group={group}
            representative={representative}
            selected={selected}
            expandedRowId={expandedRowId}
            groupRows={groupRows}
            selectQuantityGroup={selectQuantityGroup}
            toggleLine={toggleLine}
            setHoverRow={setHoverRow}
          />
        )
      })}
    </>
  )
}

interface GroupRowsProps {
  group: QuantityGroup
  representative: string
  selected: boolean
  expandedRowId: string | null
  groupRows: Map<string, HTMLTableRowElement>
  selectQuantityGroup(groupId: string, memberId: string): void
  toggleLine(line: QuantityLine, memberId: string): void
  setHoverRow(rowId: string | null): void
}

function GroupRows({
  group,
  representative,
  selected,
  expandedRowId,
  groupRows,
  selectQuantityGroup,
  toggleLine,
  setHoverRow,
}: GroupRowsProps) {
  const select = () => selectQuantityGroup(group.id, representative)

  return (
    <>
      <tr
        ref={(element) => {
          if (element) groupRows.set(group.id, element)
          else groupRows.delete(group.id)
        }}
        className={`${styles.groupRow} ${
          selected ? styles.selectedGroupRow : ''
        }`}
        data-testid={`quantity-group-${group.id}`}
        tabIndex={0}
        aria-selected={selected}
        onClick={select}
        onKeyDown={(event) => {
          if (!isActivationKey(event)) return
          event.preventDefault()
          select()
        }}
      >
        <th scope="row" colSpan={12}>
          {group.memberKind}　{group.mark}　{group.sectionLabel}　[
          {group.places} 箇所]
        </th>
      </tr>
      {group.lines.map((line) => {
        const expanded = expandedRowId === line.id
        return (
          <LineRows
            key={line.id}
            line={line}
            representative={representative}
            expanded={expanded}
            toggleLine={toggleLine}
            setHoverRow={setHoverRow}
          />
        )
      })}
    </>
  )
}

function LineRows({
  line,
  representative,
  expanded,
  toggleLine,
  setHoverRow,
}: {
  line: QuantityLine
  representative: string
  expanded: boolean
  toggleLine(line: QuantityLine, memberId: string): void
  setHoverRow(rowId: string | null): void
}) {
  const toggle = () => toggleLine(line, representative)

  return (
    <>
      <tr
        className={styles.lineRow}
        data-testid={`quantity-line-${line.id}`}
        tabIndex={0}
        aria-expanded={expanded}
        onClick={toggle}
        onKeyDown={(event) => {
          if (!isActivationKey(event)) return
          event.preventDefault()
          toggle()
        }}
        onMouseEnter={() => setHoverRow(line.id)}
        onMouseLeave={() => setHoverRow(null)}
        onFocus={() => setHoverRow(line.id)}
        onBlur={() => setHoverRow(null)}
      >
        <td className={styles.rebarCell}>
          <span>{line.role}</span>
          <InferredWarning line={line} />
        </td>
        <td className={styles.numericCell}>{line.size}</td>
        <td>
          <ShapeIcon shape={line.shape} />
        </td>
        <td className={styles.numericCell}>{formatLength(line.lengthMm)}</td>
        <td className={styles.numericCell}>{line.countPerMember}</td>
        <td className={styles.numericCell}>{line.places}</td>
        <td className={styles.numericCell}>{formatLength(line.totalLengthMm)}</td>
        <td className={`${styles.numericCell} ${styles.unitMass}`}>
          {line.unitMassKgPerM.toFixed(3)}
        </td>
        <td className={styles.numericCell}>{formatMass(line.designKg)}</td>
        <td className={`${styles.numericCell} ${styles.requiredColumn}`}>
          {formatMass(line.requiredKg)}
        </td>
        <td>
          <SourceChips rules={line.rules} />
        </td>
        <td>
          <NoteInput lineId={line.id} />
        </td>
      </tr>
      {expanded && (
        <tr className={styles.formulaRow} data-testid={`formula-${line.id}`}>
          <td colSpan={12}>
            <pre>{line.formula}</pre>
          </td>
        </tr>
      )}
    </>
  )
}

export function TakeoffPane() {
  const { lines } = useTakeoff()
  const locale = useAppStore(({ locale }) => locale)
  const hasGirder = useAppStore(({ project }) =>
    project.members.some(({ kind }) => kind === '大梁'),
  )

  return (
    <>
      {hasGirder && (
        <p className={styles.pendingNotice} role="note">
          {t(locale, 'takeoff.girderPending')}
        </p>
      )}
      <TakeoffTable lines={lines} />
    </>
  )
}

export function TakeoffActions() {
  const project = useAppStore(({ project }) => project)
  const locale = useAppStore(({ locale }) => locale)
  const { lines, hasInferred, inferredRules } = useTakeoff()
  const markupRate = useMemo(() => {
    const rates = [
      ...new Set(
        project.members.map(
          ({ memberClass }) =>
            lookupMarkup(jpMlitRulePack, memberClass).value,
        ),
      ),
    ]

    if (rates.length !== 1) {
      throw new Error('Takeoff header requires exactly one markup rate')
    }

    return rates[0]
  }, [project])
  const formattedMarkup = new Intl.NumberFormat(
    locale === 'ja' ? 'ja-JP' : 'ko-KR',
    { style: 'percent', maximumFractionDigits: 2 },
  ).format(markupRate)

  const exportWorkbook = () => {
    // 클릭이 아니라 결과에 이벤트를 건다 — 내보내기는 이 제품의 산출물이고,
    // 클릭 시점에 성공을 기록하면 exceljs 청크 실패가 성공으로 집계된다.
    // 룰팩 key만 싣는다. 치수·본수는 도면 데이터라 브라우저 밖으로 내보내지 않는다.
    exportTakeoffXlsx({ project, lines, locale }).then(
      () => {
        posthog.capture('takeoff_exported', {
          locale,
          line_count: lines.length,
          has_inferred: hasInferred,
          inferred_rules: inferredRules.map(({ key }) => key),
        })
      },
      (error: unknown) => {
        posthog.captureException(error, { stage: 'takeoff_export' })
        posthog.capture('takeoff_export_failed', {
          locale,
          line_count: lines.length,
        })
      },
    )
  }

  return (
    <div className={styles.takeoffActions}>
      <span className={styles.markupBadge}>
        {t(locale, 'takeoff.markup')} {formattedMarkup}
      </span>
      <button
        type="button"
        className={styles.exportButton}
        onClick={exportWorkbook}
      >
        {t(locale, 'takeoff.export')}
      </button>
    </div>
  )
}
