'use client'

import { useRef, type KeyboardEvent } from 'react'

import {
  BAR_SIZES,
  type BarSize,
  type Member,
  type Opening,
  type OpeningReinforcement,
} from '@/domain/model/member'
import {
  findSection,
  gridPoint,
  slabBay,
  storyNotFound,
  wallSpan,
  type Project,
} from '@/domain/model/project'
import { lookupRule } from '@/domain/rules/lookup'
import { jpMlitRulePack } from '@/rulepack'
import { t } from '@/lib/i18n'
import { useAppStore } from '@/lib/store'
import { capture } from '@/lib/telemetry'

import { spanCoordinates, updateProjectSpans, type SpanAxis } from './grid'
import styles from './PlanEditor.module.css'

// 壁の面線を通り芯からどれだけ離すか (px)。大梁のヒット領域が片側 9px
// (girderHitArea の stroke-width 18) なので、その外に出さないと壁を選べない。
const wallFaceOffset = 12

// 床板の塗りを通り芯からどれだけ引っ込めるか (px)。壁の面線のヒット領域が
// 通り芯から片側 12＋8 ＝ 20px まで届くので、その外から塗り始めないと
// 床板が上に載って大梁も壁も選べなくなる。
const slabEdgeInset = 22

const viewWidth = 640
const viewHeight = 420
const plotLeft = 96
const plotTop = 56
const plotWidth = 476
const plotHeight = 282

interface DrawingTransform {
  x(value: number): number
  y(value: number): number
}

function drawingTransform(project: Project): DrawingTransform {
  const xCoordinates = spanCoordinates(project.grid.xSpans)
  const yCoordinates = spanCoordinates(project.grid.ySpans)
  const totalX = xCoordinates[xCoordinates.length - 1]
  const totalY = yCoordinates[yCoordinates.length - 1]
  const scale = Math.min(plotWidth / totalX, plotHeight / totalY)
  const drawingWidth = totalX * scale
  const drawingHeight = totalY * scale
  const offsetX = plotLeft + (plotWidth - drawingWidth) / 2
  const offsetY = plotTop + (plotHeight - drawingHeight) / 2

  return {
    x: (value) => offsetX + value * scale,
    y: (value) => offsetY + drawingHeight - value * scale,
  }
}

function activateMember(
  event: KeyboardEvent<SVGGElement>,
  select: () => void,
): void {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  select()
}

export function StoryTabs() {
  const stories = useAppStore(({ project }) => project.stories)
  const activeStoryId = useAppStore(({ activeStoryId }) => activeStoryId)
  const locale = useAppStore(({ locale }) => locale)
  const setActiveStory = useAppStore(({ setActiveStory }) => setActiveStory)

  return (
    <div
      className={styles.storyTabs}
      role="tablist"
      aria-label={t(locale, 'plan.storyTabs')}
    >
      {stories.map((story) => {
        const selected = story.id === activeStoryId
        return (
          <button
            key={story.id}
            type="button"
            role="tab"
            className={`${styles.storyTab} ${
              selected ? styles.storyTabActive : ''
            }`}
            aria-selected={selected}
            onClick={() => {
              setActiveStory(story.id)
              // ViewerTabs·member_selected와 같은 기준 — 이미 활성인 층을
              // 다시 눌러도 전환이 아니다 (10차 리뷰 minor).
              if (!selected) capture('story_selected')
            }}
          >
            {story.name}
          </button>
        )
      })}
    </div>
  )
}

function PlanMember({
  member,
  project,
  transform,
}: {
  member: Member
  project: Project
  transform: DrawingTransform
}) {
  const selectedMemberId = useAppStore(({ sel }) => sel.memberId)
  const selectMember = useAppStore(({ selectMember }) => selectMember)
  const section = findSection(project, member.sectionId)
  const selected = selectedMemberId === member.id
  // 부재 id는 그리드 좌표를 담고 있어 보내지 않는다 — 어느 페인에서 골랐는지만 남긴다.
  // 이미 선택된 부재를 다시 클릭해도 재발화하지 않는다 — SectionTable·TakeoffPane과
  // 같은 판정이라 source별 선택 수 비교가 어느 한쪽으로 부풀지 않는다.
  const select = () => {
    selectMember(member.id)
    if (!selected) capture('member_selected', { source: 'plan' })
  }

  if (member.kind === '柱' && !('axis' in member.position)) {
    const point = gridPoint(
      project.grid,
      member.position.ix,
      member.position.iy,
    )
    const x = transform.x(point.x)
    const y = transform.y(point.y)

    // 라벨은 그룹 밖에 둔다 — 안에 있으면 그룹 bbox가 라벨까지 감싸
    // 클릭 중심이 마커를 벗어나 大梁 히트영역으로 밀린다.
    return (
      <>
        <g
          className={`${styles.member} ${
            selected ? styles.memberSelected : ''
          }`}
          role="button"
          tabIndex={0}
          aria-label={`${section.mark} ${member.id}`}
          aria-pressed={selected}
          onClick={select}
          onKeyDown={(event) => activateMember(event, select)}
        >
          <rect
            className={styles.column}
            x={x - 7}
            y={y - 7}
            width="14"
            height="14"
            rx="2"
          />
        </g>
        <text className={styles.memberLabel} x={x + 10} y={y - 9}>
          {section.mark}
        </text>
      </>
    )
  }

  if (member.kind === '床板' && !('axis' in member.position)) {
    const { ix, iy } = member.position
    const origin = gridPoint(project.grid, ix, iy)
    const far = gridPoint(project.grid, ix + 1, iy + 1)
    const left = Math.min(transform.x(origin.x), transform.x(far.x))
    const right = Math.max(transform.x(origin.x), transform.x(far.x))
    const top = Math.min(transform.y(origin.y), transform.y(far.y))
    const bottom = Math.max(transform.y(origin.y), transform.y(far.y))
    const width = right - left - 2 * slabEdgeInset
    const height = bottom - top - 2 * slabEdgeInset

    // ベイが小さすぎて塗る場所が残らないなら描かない。潰れた矩形を置くと
    // 見えないヒット領域だけが残る。
    if (width <= 0 || height <= 0) return null

    return (
      <g
        className={`${styles.member} ${selected ? styles.memberSelected : ''}`}
        role="button"
        tabIndex={0}
        aria-label={`${section.mark} ${member.id}`}
        aria-pressed={selected}
        onClick={select}
        onKeyDown={(event) => activateMember(event, select)}
      >
        <rect
          className={styles.slab}
          x={left + slabEdgeInset}
          y={top + slabEdgeInset}
          width={width}
          height={height}
          rx="3"
        />
        {slabOpeningRects(project, member, transform).map(
          ({ id, x, y, width: openingWidth, height: openingHeight }) => (
            <rect
              key={id}
              className={styles.opening}
              x={x}
              y={y}
              width={openingWidth}
              height={openingHeight}
            />
          ),
        )}
      </g>
    )
  }

  if (member.kind === '耐震壁' && 'axis' in member.position) {
    const { axis, ix, iy } = member.position
    const start = gridPoint(project.grid, ix, iy)
    const end = gridPoint(
      project.grid,
      axis === 'X' ? ix + 1 : ix,
      axis === 'Y' ? iy + 1 : iy,
    )
    const x1 = transform.x(start.x)
    const y1 = transform.y(start.y)
    const x2 = transform.x(end.x)
    const y2 = transform.y(end.y)

    // 壁は大梁と同じ辺に立つ。通り芯の上に重ねて1本で描くと、大梁のヒット領域が
    // 上に載って**壁を選べなくなる**（実ブラウザ検証で判明）。平面図の慣用どおり
    // 両側の面線2本で描き、大梁の線の外側に出すことでどちらも選べるようにする。
    // 通り芯に対して対称なので、壁が芯上にあるという事実も曲げていない。
    const faceOffset = wallFaceOffset
    const faces =
      axis === 'X'
        ? [
            { x1, y1: y1 - faceOffset, x2, y2: y2 - faceOffset },
            { x1, y1: y1 + faceOffset, x2, y2: y2 + faceOffset },
          ]
        : [
            { x1: x1 - faceOffset, y1, x2: x2 - faceOffset, y2 },
            { x1: x1 + faceOffset, y1, x2: x2 + faceOffset, y2 },
          ]

    return (
      <g
        className={`${styles.member} ${selected ? styles.memberSelected : ''}`}
        role="button"
        tabIndex={0}
        aria-label={`${section.mark} ${member.id}`}
        aria-pressed={selected}
        onClick={select}
        onKeyDown={(event) => activateMember(event, select)}
      >
        {faces.map((face, index) => (
          <line
            key={`hit-${index}`}
            className={styles.wallHitArea}
            x1={face.x1}
            y1={face.y1}
            x2={face.x2}
            y2={face.y2}
          />
        ))}
        {faces.map((face, index) => (
          <line
            key={`face-${index}`}
            className={styles.wall}
            x1={face.x1}
            y1={face.y1}
            x2={face.x2}
            y2={face.y2}
          />
        ))}
        <text
          className={styles.memberLabel}
          x={(x1 + x2) / 2 + (axis === 'Y' ? faceOffset + 12 : 0)}
          y={(y1 + y2) / 2 + (axis === 'X' ? faceOffset + 14 : 0)}
          textAnchor="middle"
        >
          {section.mark}
        </text>
      </g>
    )
  }

  if (member.kind === '大梁' && 'axis' in member.position) {
    const { axis, ix, iy } = member.position
    const start = gridPoint(project.grid, ix, iy)
    const end = gridPoint(
      project.grid,
      axis === 'X' ? ix + 1 : ix,
      axis === 'Y' ? iy + 1 : iy,
    )
    const x1 = transform.x(start.x)
    const y1 = transform.y(start.y)
    const x2 = transform.x(end.x)
    const y2 = transform.y(end.y)

    return (
      <g
        className={`${styles.member} ${
          selected ? styles.memberSelected : ''
        }`}
        role="button"
        tabIndex={0}
        aria-label={`${section.mark} ${member.id}`}
        aria-pressed={selected}
        onClick={select}
        onKeyDown={(event) => activateMember(event, select)}
      >
        <line
          className={styles.girderHitArea}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
        />
        <line
          className={styles.girder}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
        />
        <text
          className={styles.memberLabel}
          x={(x1 + x2) / 2}
          y={(y1 + y2) / 2 - 6}
          textAnchor="middle"
        >
          {section.mark}
        </text>
      </g>
    )
  }

  return null
}

/**
 * 床板の開口部を平面の px に写す (数量積算基準 1通則8))。座標はベイ局所なので、
 * 内法域の原点（受ける大梁の内側面）を通り芯からの実寸で足してから写す —
 * 塗りの `slabEdgeInset` は大梁・壁を掴めるようにするための見た目の逃げであって
 * 内法ではないので、それを基準にすると開口が実寸からずれる。
 *
 * 内法が決まらないベイ（受ける大梁が欠けている）では何も描かない。その部材は
 * そもそも数量に出ていない。
 */
function slabOpeningRects(
  project: Project,
  member: Member,
  transform: DrawingTransform,
): { id: string; x: number; y: number; width: number; height: number }[] {
  const openings = member.openings ?? []
  if (openings.length === 0 || 'axis' in member.position) return []

  let bay
  try {
    bay = slabBay(project, member)
  } catch {
    return []
  }

  const origin = gridPoint(
    project.grid,
    member.position.ix,
    member.position.iy,
  )
  const originXMm = origin.x + bay.startFaceOffsetXMm
  const originYMm = origin.y + bay.startFaceOffsetYMm

  return openings.map((opening) => {
    const left = transform.x(originXMm + opening.xMm)
    const right = transform.x(originXMm + opening.xMm + opening.widthMm)
    // y は上下が反転している（transform.y が下から上へ数える）。
    const bottom = transform.y(originYMm + opening.yMm)
    const top = transform.y(originYMm + opening.yMm + opening.heightMm)

    return {
      id: opening.id,
      x: Math.min(left, right),
      y: Math.min(top, bottom),
      width: Math.abs(right - left),
      height: Math.abs(bottom - top),
    }
  })
}

function SpanEditor({ axis }: { axis: SpanAxis }) {
  const project = useAppStore(({ project }) => project)
  const locale = useAppStore(({ locale }) => locale)
  const updateProject = useAppStore(({ updateProject }) => updateProject)
  const spans = axis === 'x' ? project.grid.xSpans : project.grid.ySpans
  // 도면에서 읽은 通り芯 이름. 없으면 이름 없이 번호만 보인다 — index로
  // 이름을 지어내지 않는다 (ADR-030)
  const labels = axis === 'x' ? project.grid.xLabels : project.grid.yLabels
  const spanName = (index: number) =>
    labels === undefined
      ? `${axisLabel}スパン ${index + 1}`
      : `${labels[index]}-${labels[index + 1]}`
  const axisLabel = axis.toUpperCase()
  const editReported = useRef(false)

  const commit = (nextSpans: number[]) => {
    updateProject((current) =>
      updateProjectSpans(current, axis, nextSpans),
    )

    // number input의 onChange는 "6000"을 치면 네 번 들어온다. 축마다 한 번으로 합쳐
    // 이벤트가 타이핑 속도가 아니라 편집 여부를 세게 한다.
    if (editReported.current) return
    editReported.current = true
    capture('grid_edited', { axis })
  }

  return (
    <fieldset className={styles.spanFieldset}>
      <legend className={styles.spanLegend}>{axisLabel} スパン</legend>
      <div className={styles.spanList}>
        {spans.map((span, index) => (
          <div className={styles.spanItem} key={`${axis}-${index}`}>
            <input
              className={styles.spanInput}
              type="number"
              min="1"
              step="1"
              value={span}
              // 이름은 도면에서 오면 바뀐다 — 자동 검증이 값을 집는 자리는
              // 이름이 아니라 축과 순번이어야 한다
              data-testid={`span-${axis}-${index}`}
              aria-label={spanName(index)}
              onChange={(event) => {
                const value = Number(event.currentTarget.value)
                if (!Number.isFinite(value) || value <= 0) return
                commit(
                  spans.map((current, spanIndex) =>
                    spanIndex === index ? value : current,
                  ),
                )
              }}
            />
            <span className={styles.unit}>mm</span>
            <button
              type="button"
              className={styles.removeButton}
              aria-label={`${spanName(index)}${t(
                locale,
                'plan.removeSpan',
              )}`}
              disabled={spans.length === 1}
              onClick={() =>
                commit(spans.filter((_, spanIndex) => spanIndex !== index))
              }
            >
              −
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className={styles.addButton}
        onClick={() => commit([...spans, spans[spans.length - 1]])}
      >
        {axisLabel}
        {t(locale, 'plan.addSpan')}
      </button>
    </fieldset>
  )
}

/**
 * 部材の内法域の大きさ (mm)。開口部はこの中に収まらなければならない
 * （数量積算基準 1通則8) の「内法寸法」は部材の内法の中の話だ）。
 *
 * 求められない部材は null を返す — 受ける大梁や柱が欠けていると内法が決まらず、
 * その部材はそもそも数量に出ていない。開口を足せる場所ではない。
 */
function memberClearSize(
  project: Project,
  member: Member,
): { xMm: number; yMm: number } | null {
  try {
    if (member.kind === '耐震壁') {
      const span = wallSpan(project, member)
      return { xMm: span.clearLengthMm, yMm: span.clearHeightMm }
    }
    if (member.kind === '床板') {
      const bay = slabBay(project, member)
      return { xMm: bay.clearXMm, yMm: bay.clearYMm }
    }
  } catch {
    return null
  }
  return null
}

function replaceOpenings(
  project: Project,
  memberId: string,
  openings: Opening[],
): Project {
  return {
    ...project,
    members: project.members.map((member) => {
      if (member.id !== memberId) return member
      // 空配列は「開口なし」— キーを残すと保存した JSON に意味のない配列が並ぶ。
      if (openings.length === 0) {
        const next = { ...member }
        delete next.openings
        return next
      }
      return { ...member, openings }
    }),
  }
}

function replaceOpeningReinforcements(
  project: Project,
  memberId: string,
  openingId: string,
  reinforcements: OpeningReinforcement[],
): Project {
  return {
    ...project,
    members: project.members.map((member) => {
      if (member.id !== memberId || member.openings === undefined) {
        return member
      }

      return {
        ...member,
        openings: member.openings.map((opening) => {
          if (opening.id !== openingId) return opening

          // 空配列は「開口補強筋の転記なし」— キーを残すと、未転記と空の
          // 配列を別の状態として保存することになる。openings 自体と同じ規約。
          if (reinforcements.length === 0) {
            const next = { ...opening }
            delete next.reinforcements
            return next
          }

          return { ...opening, reinforcements }
        }),
      }
    }),
  }
}

const openingFields = [
  { key: 'xMm', label: 'plan.openings.x' },
  { key: 'yMm', label: 'plan.openings.y' },
  { key: 'widthMm', label: 'plan.openings.width' },
  { key: 'heightMm', label: 'plan.openings.height' },
] as const

/**
 * 開口部の入力 (数量積算基準 1通則8))。断面一覧ではなく平面に置くのは、開口が
 * 断面（符号）ではなく**その1枚の部材**に属するからだ — 同じ符号の壁が何枚も
 * 建つのに窓はその1枚に開いている (ADR-004・ADR-029)。
 */
function OpeningEditor() {
  const project = useAppStore(({ project }) => project)
  const locale = useAppStore(({ locale }) => locale)
  const selectedMemberId = useAppStore(({ sel }) => sel.memberId)
  const updateProject = useAppStore(({ updateProject }) => updateProject)
  const editReported = useRef(false)

  const member = project.members.find(({ id }) => id === selectedMemberId)
  const clear = member === undefined ? null : memberClearSize(project, member)

  if (!member || clear === null) {
    return (
      <p className={styles.openingHint} data-testid="opening-editor-hint">
        {t(locale, 'plan.openings.select')}
      </p>
    )
  }

  const section = findSection(project, member.sectionId)
  const openings = member.openings ?? []
  const minimumAreaMm2 =
    lookupRule(jpMlitRulePack, 'measure.opening.deduction.minimum.area', {})
      .value * 1_000_000

  const reportEdit = () => {
    if (editReported.current) return
    editReported.current = true
    capture('opening_edited', { memberKind: member.kind })
  }

  const commit = (next: Opening[]) => {
    updateProject((current) => replaceOpenings(current, member.id, next))
    reportEdit()
  }

  const commitReinforcements = (
    openingId: string,
    reinforcements: OpeningReinforcement[],
  ) => {
    updateProject((current) =>
      replaceOpeningReinforcements(
        current,
        member.id,
        openingId,
        reinforcements,
      ),
    )
    reportEdit()
  }

  const add = () => {
    // 既定値は内法の中央に1/3の大きさ。どんな部材でも必ず収まる大きさから
    // 始めれば、置いた瞬間に「内法をはみ出す」で部材ごと落ちることがない。
    const widthMm = Math.max(1, Math.round(clear.xMm / 3))
    const heightMm = Math.max(1, Math.round(clear.yMm / 3))
    commit([
      ...openings,
      {
        id: `${member.id}|op${openings.length + 1}`,
        xMm: Math.round((clear.xMm - widthMm) / 2),
        yMm: Math.round((clear.yMm - heightMm) / 2),
        widthMm,
        heightMm,
      },
    ])
  }

  const addReinforcement = (opening: Opening) => {
    commitReinforcements(opening.id, [
      ...(opening.reinforcements ?? []),
      // 径は選択肢の先頭を仮置きする。設計長さは規準から作らず、設計図書の
      // 転記値を利用者が入力するまで 0 のままにして、製品が値を発明しない。
      { size: BAR_SIZES[0], count: 1, lengthMm: 0 },
    ])
  }

  return (
    <fieldset className={styles.openingFieldset} data-testid="opening-editor">
      <legend className={styles.spanLegend}>
        {t(locale, 'plan.openings.title')} — {section.mark}（内法 {clear.xMm}×
        {clear.yMm}）
      </legend>
      <p className={styles.openingHint}>{t(locale, 'plan.openings.hint')}</p>
      {openings.length === 0 ? (
        <p className={styles.openingHint}>{t(locale, 'plan.openings.empty')}</p>
      ) : (
        <ul className={styles.openingList}>
          {openings.map((opening, index) => {
            const outside =
              opening.xMm < 0 ||
              opening.yMm < 0 ||
              opening.xMm + opening.widthMm > clear.xMm ||
              opening.yMm + opening.heightMm > clear.yMm
            const ignored =
              opening.widthMm * opening.heightMm <= minimumAreaMm2

            return (
              <li className={styles.openingItem} key={opening.id}>
                {openingFields.map(({ key, label }) => (
                  <label className={styles.openingField} key={key}>
                    <span className={styles.openingFieldLabel}>
                      {t(locale, label)}
                    </span>
                    <input
                      className={styles.spanInput}
                      type="number"
                      min="0"
                      step="10"
                      value={opening[key]}
                      aria-label={`${section.mark} ${member.id} ${index + 1} ${t(
                        locale,
                        label,
                      )}`}
                      onChange={(event) => {
                        const value = Number(event.currentTarget.value)
                        if (!Number.isFinite(value) || value < 0) return
                        commit(
                          openings.map((current, position) =>
                            position === index
                              ? { ...current, [key]: value }
                              : current,
                          ),
                        )
                      }}
                    />
                  </label>
                ))}
                <button
                  type="button"
                  className={styles.removeButton}
                  aria-label={`${section.mark} ${member.id} ${index + 1} ${t(
                    locale,
                    'plan.openings.remove',
                  )}`}
                  onClick={() =>
                    commit(openings.filter((_, position) => position !== index))
                  }
                >
                  −
                </button>
                {ignored && (
                  <span className={styles.openingNote}>
                    {t(locale, 'plan.openings.ignored')}
                  </span>
                )}
                {outside && (
                  <span
                    className={styles.openingWarning}
                    data-testid="opening-outside"
                  >
                    ▲ 内法をはみ出しています
                  </span>
                )}
                <div
                  className={styles.reinforcementEditor}
                  data-testid={`opening-reinforcements-${opening.id}`}
                >
                  <span className={styles.openingFieldLabel}>
                    {t(locale, 'plan.openings.reinforcements.title')}
                  </span>
                  <p className={styles.openingHint}>
                    {t(locale, 'plan.openings.reinforcements.hint')}
                  </p>
                  {(opening.reinforcements ?? []).length === 0 ? (
                    <p
                      className={styles.openingHint}
                      data-testid={`opening-reinforcements-empty-${opening.id}`}
                    >
                      {t(locale, 'plan.openings.reinforcements.empty')}
                    </p>
                  ) : (
                    <ul className={styles.reinforcementList}>
                      {(opening.reinforcements ?? []).map(
                        (reinforcement, reinforcementIndex) => {
                          const labelPrefix = `${section.mark} ${member.id} ${
                            index + 1
                          } ${t(
                            locale,
                            'plan.openings.reinforcements.title',
                          )} ${reinforcementIndex + 1}`

                          return (
                            <li
                              className={styles.reinforcementItem}
                              data-testid={`opening-reinforcement-${opening.id}-${reinforcementIndex}`}
                              key={`${opening.id}-reinforcement-${reinforcementIndex}`}
                            >
                              <label className={styles.openingField}>
                                <span className={styles.openingFieldLabel}>
                                  {t(
                                    locale,
                                    'plan.openings.reinforcements.size',
                                  )}
                                </span>
                                <select
                                  className={styles.spanInput}
                                  value={reinforcement.size}
                                  aria-label={`${labelPrefix} ${t(
                                    locale,
                                    'plan.openings.reinforcements.size',
                                  )}`}
                                  onChange={(event) => {
                                    const size = event.currentTarget
                                      .value as BarSize
                                    commitReinforcements(
                                      opening.id,
                                      (opening.reinforcements ?? []).map(
                                        (current, position) =>
                                          position === reinforcementIndex
                                            ? { ...current, size }
                                            : current,
                                      ),
                                    )
                                  }}
                                >
                                  {BAR_SIZES.map((size) => (
                                    <option key={size} value={size}>
                                      {size}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className={styles.openingField}>
                                <span className={styles.openingFieldLabel}>
                                  {t(
                                    locale,
                                    'plan.openings.reinforcements.count',
                                  )}
                                </span>
                                <input
                                  className={styles.spanInput}
                                  type="number"
                                  min="1"
                                  step="1"
                                  value={reinforcement.count}
                                  aria-label={`${labelPrefix} ${t(
                                    locale,
                                    'plan.openings.reinforcements.count',
                                  )}`}
                                  onChange={(event) => {
                                    const count = Number(
                                      event.currentTarget.value,
                                    )
                                    if (
                                      !Number.isInteger(count) ||
                                      count < 1
                                    ) {
                                      return
                                    }
                                    commitReinforcements(
                                      opening.id,
                                      (opening.reinforcements ?? []).map(
                                        (current, position) =>
                                          position === reinforcementIndex
                                            ? { ...current, count }
                                            : current,
                                      ),
                                    )
                                  }}
                                />
                              </label>
                              <label className={styles.openingField}>
                                <span className={styles.openingFieldLabel}>
                                  {t(
                                    locale,
                                    'plan.openings.reinforcements.length',
                                  )}
                                </span>
                                <input
                                  className={styles.spanInput}
                                  type="number"
                                  min="0"
                                  step="10"
                                  value={reinforcement.lengthMm}
                                  aria-label={`${labelPrefix} ${t(
                                    locale,
                                    'plan.openings.reinforcements.length',
                                  )}`}
                                  onChange={(event) => {
                                    const lengthMm = Number(
                                      event.currentTarget.value,
                                    )
                                    if (
                                      !Number.isFinite(lengthMm) ||
                                      lengthMm < 0
                                    ) {
                                      return
                                    }
                                    commitReinforcements(
                                      opening.id,
                                      (opening.reinforcements ?? []).map(
                                        (current, position) =>
                                          position === reinforcementIndex
                                            ? { ...current, lengthMm }
                                            : current,
                                      ),
                                    )
                                  }}
                                />
                              </label>
                              <button
                                type="button"
                                className={styles.removeButton}
                                aria-label={`${labelPrefix} ${t(
                                  locale,
                                  'plan.openings.reinforcements.remove',
                                )}`}
                                onClick={() =>
                                  commitReinforcements(
                                    opening.id,
                                    (opening.reinforcements ?? []).filter(
                                      (_, position) =>
                                        position !== reinforcementIndex,
                                    ),
                                  )
                                }
                              >
                                −
                              </button>
                            </li>
                          )
                        },
                      )}
                    </ul>
                  )}
                  <button
                    type="button"
                    className={styles.addButton}
                    onClick={() => addReinforcement(opening)}
                  >
                    {t(locale, 'plan.openings.reinforcements.add')}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <button type="button" className={styles.addButton} onClick={add}>
        {t(locale, 'plan.openings.add')}
      </button>
    </fieldset>
  )
}

export function PlanEditor() {
  const project = useAppStore(({ project }) => project)
  const activeStoryId = useAppStore(({ activeStoryId }) => activeStoryId)
  const story = project.stories.find(({ id }) => id === activeStoryId)
  const transform = drawingTransform(project)
  const xCoordinates = spanCoordinates(project.grid.xSpans)
  const yCoordinates = spanCoordinates(project.grid.ySpans)
  const members = project.members.filter(
    ({ storyId }) => storyId === activeStoryId,
  )

  if (!story) {
    throw storyNotFound(activeStoryId)
  }

  return (
    <div className={styles.editor}>
      <div className={styles.spanEditors}>
        <SpanEditor axis="x" />
        <SpanEditor axis="y" />
      </div>
      <OpeningEditor />
      <div className={styles.drawingFrame}>
        <svg
          className={styles.drawing}
          viewBox={`0 0 ${viewWidth} ${viewHeight}`}
          role="img"
          aria-label={`${story.name} 平面`}
        >
          {members
            .filter(({ kind }) => kind === '床板')
            .map((member) => (
              <PlanMember
                key={member.id}
                member={member}
                project={project}
                transform={transform}
              />
            ))}
          {members
            .filter(({ kind }) => kind === '耐震壁')
            .map((member) => (
              <PlanMember
                key={member.id}
                member={member}
                project={project}
                transform={transform}
              />
            ))}
          {members
            .filter(({ kind }) => kind === '大梁')
            .map((member) => (
              <PlanMember
                key={member.id}
                member={member}
                project={project}
                transform={transform}
              />
            ))}
          {members
            .filter(({ kind }) => kind === '柱')
            .map((member) => (
              <PlanMember
                key={member.id}
                member={member}
                project={project}
                transform={transform}
              />
            ))}

          {xCoordinates.map((x, index) => (
            <text
              className={styles.axisLabel}
              key={`x-axis-${index}`}
              x={transform.x(x)}
              y={plotTop - 18}
              textAnchor="middle"
            >
              X{index + 1}
            </text>
          ))}
          {yCoordinates.map((y, index) => (
            <text
              className={styles.axisLabel}
              key={`y-axis-${index}`}
              x={plotLeft - 30}
              y={transform.y(y) + 4}
              textAnchor="end"
            >
              Y{index + 1}
            </text>
          ))}
          {project.grid.xSpans.map((span, index) => {
            const start = transform.x(xCoordinates[index])
            const end = transform.x(xCoordinates[index + 1])
            return (
              <text
                className={styles.dimension}
                key={`x-span-${index}`}
                x={(start + end) / 2}
                y={plotTop + plotHeight + 48}
                textAnchor="middle"
              >
                {span}
              </text>
            )
          })}
          {project.grid.ySpans.map((span, index) => {
            const start = transform.y(yCoordinates[index])
            const end = transform.y(yCoordinates[index + 1])
            return (
              <text
                className={styles.dimension}
                key={`y-span-${index}`}
                x={plotLeft - 42}
                y={(start + end) / 2 + 4}
                textAnchor="end"
              >
                {span}
              </text>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
