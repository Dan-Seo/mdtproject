'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'

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
import { sourceLabel, sourceTooltip } from '@/lib/rule-source'
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
  // 똑같이 그려질 칩만 하나로 묶는다 — 문헌 위치로 묶으면 같은 표의 다른 행
  // (label·expr·confidence가 다른 지배 룰)이 뒤엣것에 덮여 툴팁에서 사라진다.
  // 툴팁은 위치·label·expr·확신도·note를 모두 담으므로 표시 동일성의 키다.
  const cited = [...new Map(rules.map((rule) => [sourceTooltip(rule), rule]))]

  return (
    <div
      className={styles.sourceChips}
      onClick={stopRowInteraction}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {cited.map(([citation, rule]) => (
        <SourceChip key={citation} rule={rule} />
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
        onClick={toggle}
        onMouseEnter={() => setHoverRow(line.id)}
        onMouseLeave={() => setHoverRow(null)}
        onFocus={() => setHoverRow(line.id)}
        onBlur={() => setHoverRow(null)}
      >
        <td className={styles.rebarCell}>
          {/* 행 어디를 눌러도 펼쳐지지만, 펼침 상태는 여기에 둔다 — role=row의
              aria-expanded는 treegrid 안에서만 유효해 평범한 table에서는 읽히지 않는다.
              onFocus/onBlur는 focusin/focusout이라 이 버튼에 포커스가 와도 tr에서 잡힌다. */}
          <button
            type="button"
            className={styles.disclosure}
            aria-expanded={expanded}
            onClick={(event) => {
              event.stopPropagation() // tr의 onClick으로 번지면 두 번 토글돼 아무 일도 안 일어난다
              toggle()
            }}
          >
            {line.role}
          </button>
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
  const { lines, unsupportedMembers } = useTakeoff()
  const locale = useAppStore(({ locale }) => locale)

  // 通し筋의 継手箇所数는 数量積算基準 1通則4)·（３）梁2)에 근거가 있으나 아직
  // 구현하지 않았다 (R8). 접힌 산출식에만 두면 사용자가 모르고 발주에 쓴다 —
  // 大梁 主筋 행이 있으면 항상 보이게 한다.
  const spliceOmitted = lines.some(
    ({ memberKind, role }) => memberKind === '大梁' && role !== 'あばら筋',
  )

  return (
    <>
      {spliceOmitted && (
        <p
          className={styles.spliceOmittedNotice}
          role="note"
          data-testid="splice-omitted-notice"
        >
          ▲ {t(locale, 'takeoff.spliceOmitted')}
        </p>
      )}
      {unsupportedMembers.length > 0 && (
        <div className={styles.unsupportedNotice} role="note">
          <strong>
            {t(locale, 'takeoff.unsupported.title')}{' '}
            {unsupportedMembers.length}
            {t(locale, 'takeoff.unsupported.count')}
          </strong>
          <ul className={styles.unsupportedList}>
            {unsupportedMembers.map((member) => (
              <li key={member.memberId}>
                {member.mark}（{member.storyName}）—{' '}
                {t(
                  locale,
                  `takeoff.unsupported.reason.${member.reason}`,
                )}
              </li>
            ))}
          </ul>
          <p data-testid="unsupported-plan">
            {[...new Set(unsupportedMembers.map(({ reason }) => reason))]
              .map((reason) =>
                t(locale, `takeoff.unsupported.plan.${reason}`),
              )
              .join(' / ')}
          </p>
        </div>
      )}
      <TakeoffTable lines={lines} />
    </>
  )
}

export function TakeoffActions() {
  const project = useAppStore(({ project }) => project)
  const locale = useAppStore(({ locale }) => locale)
  const { lines } = useTakeoff()
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
    void exportTakeoffXlsx({ project, lines, locale })
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
