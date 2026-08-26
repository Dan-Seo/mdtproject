'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'

import type { ShearBarSize } from '@/domain/model/member'
import type { RebarShape } from '@/domain/model/rebar'
import { memberGroupKey, setNote, setUnitMass } from '@/domain/model/project'
import {
  grandTotal,
  isMassLine,
  massLines,
  spliceLines,
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
import { capture, captureException, sizeBucket } from '@/lib/telemetry'
import { jpMlitRulePack } from '@/rulepack'

import styles from './TakeoffPane.module.css'
import { TakeoffPrint } from './TakeoffPrint'

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

// 単位質量が未入力なら質量は「まだ分からない」— 0 と書くと合計されてしまう。
function formatMass(massKg: number | null): string {
  return massKg === null ? NOT_APPLICABLE : massKg.toFixed(3)
}

// 継手箇所数には （３）梁2) の 0.5か所がある — 整数に丸めると条文と違う数になる。
function formatCount(count: number): string {
  return Number.isInteger(count) ? String(count) : count.toFixed(1)
}

/** 単位が違って値を持たないセル。空欄だと入力漏れに見える。 */
const NOT_APPLICABLE = '—'

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
    rule.confidence === 'transcribed' ? styles.transcribedSourceChip : '',
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

/**
 * 行の근거 등급 표시. ▲(원문에 값 없음)와 △(원문 명시·검토 대기)를 갈라
 * 붙인다 — 예전에는 둘 다 ▲ 여서 전 행에 ▲ 가 붙었고, 그래서 ▲ 가 아무것도
 * 가리키지 못했다.
 */
function ConfidenceWarning({ line }: { line: QuantityLine }) {
  if (line.confidence === 'stated') return null

  const inferredRow = line.confidence === 'inferred'
  const labels = line.rules
    .filter(({ confidence }) =>
      inferredRow ? confidence === 'inferred' : confidence !== 'stated',
    )
    .map(({ label }) => label)
    .join('、')

  return (
    <span
      className={
        inferredRow ? styles.inferredWarning : styles.transcribedWarning
      }
      role="img"
      aria-label={inferredRow ? '原文に値のない規準値' : '独立検討待ちの規準値'}
      title={labels}
    >
      {inferredRow ? '▲' : '△'}
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

/**
 * 単位質量は積算基準 1通則 前文が JIS G 3112 に委ねた値で、その JIS は有償
 * 規格だ。製品が値を持てないので利用者に聞く — 入るまで質量は算出しない。
 */
function UnitMassField({ size }: { size: ShearBarSize }) {
  const stored = useAppStore(({ project }) => project.unitMass?.[size])
  const updateProject = useAppStore(({ updateProject }) => updateProject)
  // 打鍵の途中（"0" → "0.9"）で欄が消えないよう、表示は打った文字列のまま持つ。
  const [draft, setDraft] = useState(stored === undefined ? '' : String(stored))

  return (
    <label className={styles.unitMassField}>
      <span className={styles.unitMassSize}>{size}</span>
      <input
        className={styles.unitMassInput}
        type="number"
        min="0"
        step="0.001"
        inputMode="decimal"
        data-size={size}
        aria-label={`${size} 単位質量`}
        value={draft}
        onChange={(event) => {
          const next = event.currentTarget.value
          setDraft(next)

          // 空欄も 0 も「入っていない」だ。0 を通すと 0kg として合計され、
          // 内訳書では入力漏れと区別がつかない。
          const parsed = Number(next)
          const value =
            next.trim() !== '' && Number.isFinite(parsed) && parsed > 0
              ? parsed
              : null

          updateProject((project) => setUnitMass(project, size, value))
        }}
      />
    </label>
  )
}

export function UnitMassInput({ lines }: TakeoffTableProps) {
  const locale = useAppStore(({ locale }) => locale)
  const sizes = useMemo(
    () =>
      // 呼び径で並べ、同径は呼び名で決める — D13 と高強度の K13・S13 が
      // 同じ 13 になるので、ここを径だけにすると並びが入力順で揺れる。
      [...new Set(massLines(lines).map(({ size }) => size))].sort(
        (left, right) =>
          Number(left.slice(1)) - Number(right.slice(1)) ||
          left.localeCompare(right),
      ),
    [lines],
  )

  if (sizes.length === 0) return null

  return (
    <section className={styles.unitMassPanel} data-testid="unit-mass-input">
      <h3 className={styles.unitMassTitle}>
        {t(locale, 'takeoff.unitMassInput.title')}
      </h3>
      <p
        className={styles.unitMassNotice}
        role="note"
        data-testid="unit-mass-notice"
      >
        {t(locale, 'takeoff.unitMassInput.notice')}
      </p>
      <div className={styles.unitMassFields}>
        {sizes.map((size) => (
          <UnitMassField key={size} size={size} />
        ))}
      </div>
    </section>
  )
}

export function TakeoffTable({ lines }: TakeoffTableProps) {
  const project = useAppStore(({ project }) => project)
  const locale = useAppStore(({ locale }) => locale)
  const selectedGroup = useAppStore(({ sel }) => sel.group)
  const selectedMemberId = useAppStore(({ sel }) => sel.memberId)
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
    // toggleLine도 이 함수를 거친다 — 같은 그룹의 산식 행을 펼치고 접는 것은
    // 선택이 아니다. 매번 발화하면 source별 선택 수 비교가 takeoff 쪽으로 부푼다.
    // groupId만 보면 같은 그룹 안에서 부재가 바뀌는 선택(대표 부재 갱신)이
    // 안 잡힌다 — memberId도 함께 본다 (9차 리뷰 minor).
    const changed = groupId !== selectedGroup || memberId !== selectedMemberId
    selectGroup(groupId, memberId)
    if (changed) capture('member_selected', { source: 'takeoff' })
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
            <th scope="col">{t(locale, 'takeoff.unit')}</th>
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
            <td colSpan={3} />
          </tr>
        </tbody>
      </table>
    </div>
  )
}

interface StoryRowsProps {
  storyName: string
  designKg: number | null
  requiredKg: number | null
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
        <td colSpan={3} />
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
        <th scope="row" colSpan={13}>
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
            {isMassLine(line)
              ? line.role
              : `${line.role}　継手（${line.method}）`}
          </button>
          <ConfidenceWarning line={line} />
        </td>
        <td className={styles.numericCell}>{line.size}</td>
        {isMassLine(line) ? (
          <>
            <td>
              <ShapeIcon shape={line.shape} />
            </td>
            <td className={styles.numericCell}>
              {formatLength(line.lengthMm)}
            </td>
            <td className={styles.numericCell}>{line.countPerMember}</td>
            <td className={styles.numericCell}>{line.places}</td>
            <td className={styles.numericCell}>
              {formatLength(line.totalLengthMm)}
            </td>
            <td className={`${styles.numericCell} ${styles.unitMass}`}>
              {formatMass(line.unitMassKgPerM)}
            </td>
            <td className={styles.numericCell}>{formatMass(line.designKg)}</td>
            <td className={`${styles.numericCell} ${styles.requiredColumn}`}>
              {formatMass(line.requiredKg)}
            </td>
          </>
        ) : (
          // 継手は箇所で数える。長さ・質量の列は空欄ではなく「値がない」と示す —
          // 割増（1通則9)）も設計「数量」＝質量への規定なので所要数量は出ない。
          <>
            <td>{NOT_APPLICABLE}</td>
            <td className={styles.numericCell}>{NOT_APPLICABLE}</td>
            <td className={styles.numericCell}>
              {formatCount(line.countPerMember)}
            </td>
            <td className={styles.numericCell}>{line.places}</td>
            <td className={styles.numericCell}>{NOT_APPLICABLE}</td>
            <td className={`${styles.numericCell} ${styles.unitMass}`}>
              {NOT_APPLICABLE}
            </td>
            <td className={styles.numericCell}>
              {formatCount(line.totalCount)}
            </td>
            <td className={`${styles.numericCell} ${styles.requiredColumn}`}>
              {NOT_APPLICABLE}
            </td>
          </>
        )}
        <td>{line.unit}</td>
        <td>
          <SourceChips rules={line.rules} />
        </td>
        <td>
          <NoteInput lineId={line.id} />
        </td>
      </tr>
      {expanded && (
        <tr className={styles.formulaRow} data-testid={`formula-${line.id}`}>
          <td colSpan={13}>
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

  // 箇所数は計上したが位置は決まっていない（表5.3.3 が原文で画像）。接힌
  // 산출식에만 두면 3D에 継手가 안 보이는 이유를 사용자가 알 수 없다 —
  // 継手 행이 하나라도 있으면 항상 보이게 한다.
  const hasSplice = spliceLines(lines).length > 0
  // 描かれる長さが設計長さより短い理由も同じ扱いにする — 3D とつき合わせる
  // ときに読む必要があるので、折りたたまれた算出式の中だけには置かない。
  const hasCutoff = lines.some(
    ({ role }) =>
      role === '上端カットオフ筋' || role === '下端カットオフ筋',
  )
  // 開口部の欠除（1通則8)）を計上していても、開口補強筋は設計図書からの転記入力であり、
  // 製品が転記の完全性を判定できるわけではない。「빠진 것」ではなく「틀린 채로 완성된 것」になるため、
  // 壁や床板の行が1つでもあれば常に見せる (ADR-025・ADR-028)。1通則8) は窓・出入口だけでなく
  // 床板の開口（階段・設備）にも同じように掛かる。
  const hasOpeningRisk = lines.some(({ memberKind }) =>
    ['耐震壁', '床板'].includes(memberKind),
  )

  return (
    <>
      {hasSplice && (
        <p
          className={styles.splicePositionNotice}
          role="note"
          data-testid="splice-position-notice"
        >
          ▲ {t(locale, 'takeoff.splicePosition')}
        </p>
      )}
      {hasCutoff && (
        <p
          className={styles.splicePositionNotice}
          role="note"
          data-testid="cutoff-anchorage-notice"
        >
          ▲ {t(locale, 'takeoff.cutoffAnchorage')}
        </p>
      )}
      {hasOpeningRisk && (
        <p
          className={styles.splicePositionNotice}
          role="note"
          data-testid="wall-opening-notice"
        >
          ▲ {t(locale, 'takeoff.wallOpening')}
        </p>
      )}
      {unsupportedMembers.length > 0 && (
        <div
          className={styles.unsupportedNotice}
          role="note"
          data-testid="unsupported-notice"
        >
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
      <UnitMassInput lines={lines} />
      <TakeoffTable lines={lines} />
    </>
  )
}

export function TakeoffActions() {
  const project = useAppStore(({ project }) => project)
  const locale = useAppStore(({ locale }) => locale)
  const { lines, hasUnverified, inferredRules } = useTakeoff()
  const markupRate = useMemo(() => {
    const rates = [
      ...new Set(
        project.members.map(
          ({ memberClass }) =>
            lookupMarkup(jpMlitRulePack, memberClass).value,
        ),
      ),
    ]

    // 部材が一本もなければ引く対象がない — 誤りではなく空である。区分ごとに
    // 率が割れているときだけが誤りで、それは黙って一方を選べない (ADR-014)
    if (rates.length > 1) {
      throw new Error('Takeoff header requires exactly one markup rate')
    }

    return rates[0]
  }, [project])
  const formattedMarkup =
    markupRate === undefined
      ? undefined
      : new Intl.NumberFormat(locale === 'ja' ? 'ja-JP' : 'ko-KR', {
          style: 'percent',
          maximumFractionDigits: 2,
        }).format(markupRate)

  const exportWorkbook = () => {
    // 클릭이 아니라 결과에 이벤트를 건다 — 내보내기는 이 제품의 산출물이고,
    // 클릭 시점에 성공을 기록하면 exceljs 청크 실패가 성공으로 집계된다.
    // 룰팩 key만 싣는다. 치수·본수는 도면 데이터라 브라우저 밖으로 내보내지 않는다.
    // lines.length 원값도 부재 수에서 파생된 모델 규모라 마찬가지다 — 원문을
    // 복원할 수 없는 버킷으로만 보낸다.
    exportTakeoffXlsx({ project, lines, locale }).then(
      () => {
        capture('takeoff_exported', {
          locale,
          size_bucket: sizeBucket(lines.length),
          // 텔레메트리 키는 「원문에 값이 없는 근거를 썼는가」 그대로 둔다 —
          // 独立検討 대기(transcribed)는 전 행에 붙어 있어 신호가 되지 않는다.
          has_inferred: inferredRules.length > 0,
          has_unverified: hasUnverified,
          inferred_rules: inferredRules.map(({ key }) => key),
        })
      },
      (error: unknown) => {
        captureException(error, { stage: 'takeoff_export' })
        capture('takeoff_export_failed', { locale })
      },
    )
  }

  return (
    <div className={styles.takeoffActions}>
      {formattedMarkup === undefined ? null : (
        <span className={styles.markupBadge}>
          {t(locale, 'takeoff.markup')} {formattedMarkup}
        </span>
      )}
      <button
        type="button"
        className={styles.exportButton}
        onClick={exportWorkbook}
      >
        {t(locale, 'takeoff.export')}
      </button>
      <TakeoffPrint />
    </div>
  )
}
