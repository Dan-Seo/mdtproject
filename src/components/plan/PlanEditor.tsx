'use client'

import { useRef, useState, type KeyboardEvent } from 'react'

import {
  BAR_SIZES,
  type BarSize,
  type GirderPosition,
  type Member,
  type Opening,
  type OpeningReinforcement,
  type Section,
  type SlabPosition,
  type WallExtent,
} from '@/domain/model/member'
import {
  findSection,
  gridPoint,
  placeableSlabPositions,
  placeableWallPositions,
  slabBay,
  slabRun,
  storyNotFound,
  wallSpan,
  type Project,
} from '@/domain/model/project'
import { MemberUnsupportedError } from '@/domain/model/unsupported'
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

type CantileverSlab = NonNullable<Member['cantilever']>

function isCantileverSlab(
  member: Member,
): member is Member & {
  kind: '床板'
  position: GirderPosition
  cantilever: CantileverSlab
} {
  return (
    member.kind === '床板' &&
    'axis' in member.position &&
    member.cantilever !== undefined
  )
}

interface CantileverSlabGeometry {
  minX: number
  maxX: number
  minY: number
  maxY: number
  originX: number
  originY: number
  width: number
  height: number
}

function cantileverSlabGeometry(
  project: Project,
  member: Member,
): CantileverSlabGeometry {
  if (!isCantileverSlab(member)) {
    throw new Error(`Member is not a cantilever 床板: ${member.id}`)
  }

  const section = findSection(project, member.sectionId)
  if (section.kind !== '床板') {
    throw new Error(`片持床板 references a non-床板 section: ${member.id}`)
  }

  const parallelRun = slabRun(project, member, member.position.axis)
  const detail = parallelRun.cantilever
  if (detail === undefined) {
    throw new Error(`片持床板 support was not resolved: ${member.id}`)
  }

  const start = gridPoint(
    project.grid,
    member.position.ix,
    member.position.iy,
  )
  const startColumn = project.members.find(
    (candidate) =>
      candidate.kind === '柱' &&
      candidate.storyId === member.storyId &&
      !('axis' in candidate.position) &&
      candidate.position.ix === member.position.ix &&
      candidate.position.iy === member.position.iy,
  )
  if (startColumn === undefined) {
    throw new Error(`片持床板 start column was not found: ${member.id}`)
  }
  const columnSection = findSection(project, startColumn.sectionId)
  if (columnSection.kind !== '柱') {
    throw new Error(`片持床板 start column section is invalid: ${member.id}`)
  }

  const alongStart =
    (member.position.axis === 'X' ? start.x : start.y) +
    (member.position.axis === 'X'
      ? columnSection.b / 2
      : columnSection.d / 2)
  const alongEnd = alongStart + detail.supportClearMm
  const supportCoordinate =
    member.position.axis === 'X' ? start.y : start.x
  const direction = member.cantilever.side === '正' ? 1 : -1
  const supportFace =
    supportCoordinate + direction * (detail.support.widthMm / 2)
  const freeEdge = supportFace + direction * member.cantilever.projectionMm
  const minProjection = Math.min(supportFace, freeEdge)
  const maxProjection = Math.max(supportFace, freeEdge)
  const minX = member.position.axis === 'X' ? alongStart : minProjection
  const maxX = member.position.axis === 'X' ? alongEnd : maxProjection
  const minY = member.position.axis === 'X' ? minProjection : alongStart
  const maxY = member.position.axis === 'X' ? maxProjection : alongEnd

  return {
    minX,
    maxX,
    minY,
    maxY,
    originX: minX,
    originY: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

function drawingTransform(project: Project): DrawingTransform {
  const xCoordinates = spanCoordinates(project.grid.xSpans)
  const yCoordinates = spanCoordinates(project.grid.ySpans)
  const totalX = xCoordinates[xCoordinates.length - 1]
  const totalY = yCoordinates[yCoordinates.length - 1]
  let minX = 0
  let maxX = totalX
  let minY = 0
  let maxY = totalY
  for (const member of project.members) {
    if (!isCantileverSlab(member)) continue
    try {
      const geometry = cantileverSlabGeometry(project, member)
      minX = Math.min(minX, geometry.minX)
      maxX = Math.max(maxX, geometry.maxX)
      minY = Math.min(minY, geometry.minY)
      maxY = Math.max(maxY, geometry.maxY)
    } catch {
      // An invalid member is rendered nowhere; its invalidity belongs to the
      // calculation pane rather than changing the drawing scale.
    }
  }

  const scale = Math.min(
    plotWidth / (maxX - minX),
    plotHeight / (maxY - minY),
  )
  const drawingWidth = (maxX - minX) * scale
  const drawingHeight = (maxY - minY) * scale
  const offsetX = plotLeft + (plotWidth - drawingWidth) / 2
  const offsetY = plotTop + (plotHeight - drawingHeight) / 2

  return {
    x: (value) => offsetX + (value - minX) * scale,
    y: (value) => offsetY + drawingHeight - (value - minY) * scale,
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

function wallExtentLabel(member: Member): string | null {
  const extent = member.wallExtent
  if (extent === undefined) return null

  const labels: string[] = []
  if (extent.vertical !== undefined) {
    labels.push(
      `${extent.vertical.anchor === '下端' ? '腰壁' : '下り壁'} H=${extent.vertical.heightMm}`,
    )
  }
  if (extent.horizontal !== undefined) {
    labels.push(`袖壁 L=${extent.horizontal.lengthMm}`)
  }

  return labels.length === 0 ? null : labels.join(' / ')
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

  if (isCantileverSlab(member)) {
    let geometry: CantileverSlabGeometry
    try {
      geometry = cantileverSlabGeometry(project, member)
    } catch {
      return null
    }
    const left = transform.x(geometry.minX)
    const right = transform.x(geometry.maxX)
    const top = transform.y(geometry.maxY)
    const bottom = transform.y(geometry.minY)
    const width = Math.abs(right - left)
    const height = Math.abs(bottom - top)
    if (width <= 0 || height <= 0) return null

    return (
      <g
        className={`${styles.member} ${selected ? styles.memberSelected : ''}`}
        data-testid={`plan-cantilever-${member.id}`}
        role="button"
        tabIndex={0}
        aria-label={`${section.mark} ${member.id}`}
        aria-pressed={selected}
        onClick={select}
        onKeyDown={(event) => activateMember(event, select)}
      >
        <rect
          className={styles.slab}
          x={Math.min(left, right)}
          y={Math.min(top, bottom)}
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
    const extent = member.wallExtent
    const range =
      extent?.horizontal === undefined
        ? null
        : (() => {
            try {
              const span = wallSpan(project, member)
              const startAlong =
                (axis === 'X' ? start.x : start.y) +
                span.startFaceOffsetMm +
                (span.originOffsetMm?.along ?? 0)
              return {
                start: startAlong,
                end: startAlong + span.clearLengthMm,
              }
            } catch {
              // 断面や受け材が未入力でも、平面の既存の全スパン表示は残す。
              return null
            }
          })()
    const startAlong = range?.start ?? (axis === 'X' ? start.x : start.y)
    const endAlong = range?.end ?? (axis === 'X' ? end.x : end.y)
    const x1 = transform.x(axis === 'X' ? startAlong : start.x)
    const y1 = transform.y(axis === 'X' ? start.y : startAlong)
    const x2 = transform.x(axis === 'X' ? endAlong : end.x)
    const y2 = transform.y(axis === 'X' ? end.y : endAlong)
    const extentLabel = wallExtentLabel(member)

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
        {extentLabel !== null && (
          <text
            className={styles.memberLabel}
            data-testid="wall-extent-label"
            x={(x1 + x2) / 2 + (axis === 'Y' ? faceOffset + 12 : 0)}
            y={(y1 + y2) / 2 + (axis === 'X' ? faceOffset + 28 : 0)}
            textAnchor="middle"
          >
            {extentLabel}
          </text>
        )}
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
  if (openings.length === 0) return []

  let originXMm: number
  let originYMm: number
  if (isCantileverSlab(member)) {
    try {
      const geometry = cantileverSlabGeometry(project, member)
      originXMm = geometry.originX
      originYMm = geometry.originY
    } catch {
      return []
    }
  } else {
    if ('axis' in member.position) return []
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
    originXMm = origin.x + bay.startFaceOffsetXMm
    originYMm = origin.y + bay.startFaceOffsetYMm
  }

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

type PlacementPosition = GirderPosition | SlabPosition
type PlacementFailure = 'section' | 'unavailable' | 'duplicate'

export interface PlanPlacementResult {
  project: Project
  member?: Member
  reason?: PlacementFailure
}

function placementMemberId(
  storyId: string,
  mark: string,
  position: PlacementPosition,
): string {
  const axis = 'axis' in position ? `-${position.axis}` : ''
  return `${storyId}-${mark}-${position.ix}-${position.iy}${axis}`
}

function samePlacementPosition(
  member: Member,
  storyId: string,
  kind: '耐震壁' | '床板',
  position: PlacementPosition,
): boolean {
  if (member.storyId !== storyId || member.kind !== kind) return false

  if (kind === '耐震壁') {
    if (!('axis' in member.position) || !('axis' in position)) return false
    return (
      member.position.axis === position.axis &&
      member.position.ix === position.ix &&
      member.position.iy === position.iy
    )
  }

  if ('axis' in member.position || 'axis' in position) {
    if (!('axis' in member.position) || !('axis' in position)) return false
    return (
      member.position.axis === position.axis &&
      member.position.ix === position.ix &&
      member.position.iy === position.iy
    )
  }
  return (
    member.position.ix === position.ix && member.position.iy === position.iy
  )
}

function cantileverPosition(
  storyId: string,
  sectionId: string,
  position: GirderPosition,
  cantilever: CantileverSlab,
): Member {
  return {
    id: `${storyId}-cantilever-candidate-${position.axis}-${position.ix}-${position.iy}`,
    kind: '床板',
    memberClass: '躯体',
    sectionId,
    storyId,
    position,
    cantilever,
  }
}

export function placeableCantileverPositions(
  project: Project,
  storyId: string,
  sectionId: string,
  cantilever: CantileverSlab,
): GirderPosition[] {
  if (
    !Number.isFinite(cantilever.projectionMm) ||
    cantilever.projectionMm <= 0
  ) {
    return []
  }

  const candidates: GirderPosition[] = []
  const nx = project.grid.xSpans.length + 1
  const ny = project.grid.ySpans.length + 1
  const positions: GirderPosition[] = []
  for (let iy = 0; iy < ny; iy += 1) {
    for (let ix = 0; ix < nx - 1; ix += 1) {
      positions.push({ axis: 'X', ix, iy })
    }
  }
  for (let iy = 0; iy < ny - 1; iy += 1) {
    for (let ix = 0; ix < nx; ix += 1) {
      positions.push({ axis: 'Y', ix, iy })
    }
  }

  for (const position of positions) {
    if (
      project.members.some(
        (member) =>
          isCantileverSlab(member) &&
          samePlacementPosition(member, storyId, '床板', position),
      )
    ) {
      continue
    }

    const candidate = cantileverPosition(
      storyId,
      sectionId,
      position,
      cantilever,
    )
    try {
      // Both directions must resolve so that the same gate is used by
      // placement and by the slab quantity/rebar path.
      slabRun(project, candidate, 'X')
      slabRun(project, candidate, 'Y')
    } catch {
      continue
    }
    candidates.push(position)
  }

  return candidates
}

function hasMemberAtPlacement(
  project: Project,
  storyId: string,
  kind: '耐震壁' | '床板',
  position: PlacementPosition,
): boolean {
  return project.members.some((member) =>
    samePlacementPosition(member, storyId, kind, position),
  )
}

/**
 * UI가 누를 수 있는 배치 한 건을 Project로 변환한다.
 *
 * 기하의 성립 여부는 step 1의 도메인 판정만 사용하고, 여기서는 UI가
 * 선택한 断面과 부재 id를 조합한다. duplicate 검사는 이벤트가 연속으로
 * 들어오거나 이미 취입된 案件을 편집하는 경우에도 같은 id가 늘지 않게
 * 하는 마지막 방어다.
 */
export function placePlanMember(
  project: Project,
  storyId: string,
  sectionId: string,
  position: PlacementPosition,
  cantilever?: CantileverSlab,
): PlanPlacementResult {
  const section = project.sections.find(({ id }) => id === sectionId)
  if (section === undefined) return { project, reason: 'section' }

  const kind = section.kind
  if (kind !== '耐震壁' && kind !== '床板') {
    return { project, reason: 'section' }
  }
  if (cantilever !== undefined && kind !== '床板') {
    return { project, reason: 'section' }
  }
  if (cantilever === undefined && kind === '床板' && 'axis' in position) {
    return { project, reason: 'unavailable' }
  }

  const id = placementMemberId(storyId, section.mark, position)
  if (project.members.some((member) => member.id === id)) {
    return { project, reason: 'duplicate' }
  }

  const axisPosition = 'axis' in position ? position : undefined
  const placeable =
    cantilever !== undefined
      ? placeableCantileverPositions(
          project,
          storyId,
          section.id,
          cantilever,
        ).some(
          (candidate) =>
            candidate.axis === axisPosition?.axis &&
            candidate.ix === axisPosition?.ix &&
            candidate.iy === axisPosition?.iy,
        )
      : kind === '耐震壁'
      ? 'axis' in position &&
        placeableWallPositions(project, storyId).some(
          (candidate) =>
            candidate.axis === position.axis &&
            candidate.ix === position.ix &&
            candidate.iy === position.iy,
        )
      : !('axis' in position) &&
        placeableSlabPositions(project, storyId).some(
          (candidate) =>
            candidate.ix === position.ix && candidate.iy === position.iy,
        )

  if (!placeable) return { project, reason: 'unavailable' }

  const member: Member = {
    id,
    kind,
    memberClass: '躯体',
    sectionId: section.id,
    storyId,
    position,
    ...(cantilever === undefined ? {} : { cantilever }),
  }

  return {
    project: { ...project, members: [...project.members, member] },
    member,
  }
}

function placementAxisLabel(
  project: Project,
  axis: 'X' | 'Y',
  index: number,
): string {
  const labels = axis === 'X' ? project.grid.xLabels : project.grid.yLabels
  return labels?.[index] ?? `${axis}${index + 1}`
}

function placementLabel(
  project: Project,
  position: PlacementPosition,
): string {
  if ('axis' in position) {
    if (position.axis === 'Y') {
      return `${placementAxisLabel(project, 'X', position.ix)} / ${placementAxisLabel(project, 'Y', position.iy)}-${placementAxisLabel(project, 'Y', position.iy + 1)}`
    }
    return `${placementAxisLabel(project, 'X', position.ix)}-${placementAxisLabel(project, 'X', position.ix + 1)} / ${placementAxisLabel(project, 'Y', position.iy)}`
  }

  return `${placementAxisLabel(project, 'X', position.ix)}-${placementAxisLabel(project, 'X', position.ix + 1)} / ${placementAxisLabel(project, 'Y', position.iy)}-${placementAxisLabel(project, 'Y', position.iy + 1)}`
}

function removePlanMember(project: Project, memberId: string): Project {
  return {
    ...project,
    members: project.members.filter(({ id }) => id !== memberId),
  }
}

function PlacementEditor() {
  const project = useAppStore(({ project }) => project)
  const activeStoryId = useAppStore(({ activeStoryId }) => activeStoryId)
  const selectedMemberId = useAppStore(({ sel }) => sel.memberId)
  const locale = useAppStore(({ locale }) => locale)
  const [wallSectionSelection, setWallSectionSelection] = useState<string>()
  const [slabSectionSelection, setSlabSectionSelection] = useState<string>()
  const [cantileverSide, setCantileverSide] = useState<CantileverSlab['side']>('正')
  const [cantileverProjection, setCantileverProjection] = useState('')
  const [placementError, setPlacementError] = useState<PlacementFailure>()

  const wallSections = project.sections.filter(
    (section): section is Extract<Section, { kind: '耐震壁' }> =>
      section.kind === '耐震壁',
  )
  const slabSections = project.sections.filter(
    (section): section is Extract<Section, { kind: '床板' }> =>
      section.kind === '床板',
  )
  const wallSectionId = wallSections.some(
    ({ id }) => id === wallSectionSelection,
  )
    ? wallSectionSelection
    : wallSections[0]?.id
  const slabSectionId = slabSections.some(
    ({ id }) => id === slabSectionSelection,
  )
    ? slabSectionSelection
    : slabSections[0]?.id
  const wallPositions =
    wallSectionId === undefined
      ? []
      : placeableWallPositions(project, activeStoryId).filter(
          (position) =>
            !hasMemberAtPlacement(project, activeStoryId, '耐震壁', position),
        )
  const slabPositions =
    slabSectionId === undefined
      ? []
      : placeableSlabPositions(project, activeStoryId).filter(
          (position) =>
            !hasMemberAtPlacement(project, activeStoryId, '床板', position),
        )
  const cantileverProjectionMm = Number(cantileverProjection)
  const cantileverPositions =
    slabSectionId === undefined
      ? []
      : placeableCantileverPositions(project, activeStoryId, slabSectionId, {
          side: cantileverSide,
          projectionMm: cantileverProjectionMm,
        }).filter(
          (position) =>
            !project.members.some(
              (member) =>
                isCantileverSlab(member) &&
                samePlacementPosition(member, activeStoryId, '床板', position),
            ),
        )

  const place = (
    sectionId: string | undefined,
    position: PlacementPosition,
    cantilever?: CantileverSlab,
  ) => {
    if (sectionId === undefined) return

    let result: PlanPlacementResult | undefined
    useAppStore.setState((state) => {
      result = placePlanMember(
        state.project,
        activeStoryId,
        sectionId,
        position,
        cantilever,
      )
      return result.member === undefined ? {} : { project: result.project }
    })

    if (result?.member === undefined) {
      setPlacementError(result?.reason)
      return
    }

    setPlacementError(undefined)
    useAppStore.getState().selectMember(result.member.id)
  }

  const selectedMember = project.members.find(
    ({ id }) => id === selectedMemberId,
  )
  const canDelete =
    selectedMember?.kind === '耐震壁' || selectedMember?.kind === '床板'
  const selectedSection =
    selectedMember === undefined
      ? undefined
      : project.sections.find(({ id }) => id === selectedMember.sectionId)

  const deleteSelected = () => {
    if (!selectedMember || !canDelete) return
    useAppStore.setState((state) => ({
      project: removePlanMember(state.project, selectedMember.id),
      sel: { group: null, memberId: null },
    }))
    setPlacementError(undefined)
  }

  const failureMessage =
    placementError === 'duplicate'
      ? t(locale, 'plan.placement.duplicate')
      : placementError === 'unavailable'
        ? t(locale, 'plan.placement.unavailable')
        : placementError === 'section'
          ? t(locale, 'plan.placement.sectionMissing')
          : null

  return (
    <section className={styles.placementEditor} data-testid="placement-editor">
      <div className={styles.placementGroups}>
        <fieldset className={styles.placementGroup}>
          <legend className={styles.spanLegend}>
            {t(locale, 'plan.placement.wall.title')}
          </legend>
          {wallSections.length === 0 ? (
            <p
              className={styles.openingHint}
              data-testid="placement-wall-no-section"
            >
              {t(locale, 'plan.placement.wall.sectionMissing')}
            </p>
          ) : (
            <>
              <label className={styles.placementLabel}>
                <span>{t(locale, 'plan.placement.section')}</span>
                <select
                  className={styles.placementSelect}
                  data-testid="placement-wall-section"
                  value={wallSectionId ?? ''}
                  onChange={(event) =>
                    setWallSectionSelection(event.currentTarget.value)
                  }
                >
                  {wallSections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.mark}
                    </option>
                  ))}
                </select>
              </label>
              <div className={styles.placementCandidates}>
                {wallPositions.length === 0 ? (
                  <p className={styles.openingHint}>
                    {t(locale, 'plan.placement.empty')}
                  </p>
                ) : (
                  wallPositions.map((position) => (
                    <button
                      key={`wall-${position.axis}-${position.ix}-${position.iy}`}
                      type="button"
                      className={styles.placementCandidate}
                      data-testid={`placement-wall-${position.axis}-${position.ix}-${position.iy}`}
                      onClick={() => place(wallSectionId, position)}
                    >
                      {placementLabel(project, position)}
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </fieldset>

        <fieldset className={styles.placementGroup}>
          <legend className={styles.spanLegend}>
            {t(locale, 'plan.placement.slab.title')}
          </legend>
          {slabSections.length === 0 ? (
            <p
              className={styles.openingHint}
              data-testid="placement-slab-no-section"
            >
              {t(locale, 'plan.placement.slab.sectionMissing')}
            </p>
          ) : (
            <>
              <label className={styles.placementLabel}>
                <span>{t(locale, 'plan.placement.section')}</span>
                <select
                  className={styles.placementSelect}
                  data-testid="placement-slab-section"
                  value={slabSectionId ?? ''}
                  onChange={(event) =>
                    setSlabSectionSelection(event.currentTarget.value)
                  }
                >
                  {slabSections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.mark}
                    </option>
                  ))}
                </select>
              </label>
              <div className={styles.placementCandidates}>
                {slabPositions.length === 0 ? (
                  <p className={styles.openingHint}>
                    {t(locale, 'plan.placement.empty')}
                  </p>
                ) : (
                  slabPositions.map((position) => (
                    <button
                      key={`slab-${position.ix}-${position.iy}`}
                      type="button"
                      className={styles.placementCandidate}
                      data-testid={`placement-slab-${position.ix}-${position.iy}`}
                      onClick={() => place(slabSectionId, position)}
                    >
                      {placementLabel(project, position)}
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </fieldset>

        <fieldset className={styles.placementGroup} data-testid="placement-cantilever">
          <legend className={styles.spanLegend}>
            {t(locale, 'plan.placement.cantilever.title')}
          </legend>
          {slabSections.length === 0 ? (
            <p className={styles.openingHint} data-testid="placement-cantilever-no-section">
              {t(locale, 'plan.placement.slab.sectionMissing')}
            </p>
          ) : (
            <>
              <label className={styles.placementLabel}>
                <span>{t(locale, 'plan.placement.cantilever.side')}</span>
                <select
                  className={styles.placementSelect}
                  data-testid="placement-cantilever-side"
                  value={cantileverSide}
                  onChange={(event) =>
                    setCantileverSide(event.currentTarget.value as CantileverSlab['side'])
                  }
                >
                  <option value="正">
                    {t(locale, 'plan.placement.cantilever.positive')}
                  </option>
                  <option value="負">
                    {t(locale, 'plan.placement.cantilever.negative')}
                  </option>
                </select>
              </label>
              <label className={styles.placementLabel}>
                <span>{t(locale, 'plan.placement.cantilever.projection')}</span>
                <input
                  className={styles.spanInput}
                  type="number"
                  min="1"
                  step="1"
                  data-testid="placement-cantilever-projection"
                  value={cantileverProjection}
                  onChange={(event) =>
                    setCantileverProjection(event.currentTarget.value)
                  }
                />
                <span className={styles.unit}>mm</span>
              </label>
              <div className={styles.placementCandidates}>
                {cantileverPositions.length === 0 ? (
                  <p className={styles.openingHint}>
                    {t(locale, 'plan.placement.empty')}
                  </p>
                ) : (
                  cantileverPositions.map((position) => (
                    <button
                      key={`cantilever-${position.axis}-${position.ix}-${position.iy}`}
                      type="button"
                      className={styles.placementCandidate}
                      data-testid={`placement-cantilever-${position.axis}-${position.ix}-${position.iy}`}
                      onClick={() =>
                        place(slabSectionId, position, {
                          side: cantileverSide,
                          projectionMm: cantileverProjectionMm,
                        })
                      }
                    >
                      {placementLabel(project, position)}
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </fieldset>
      </div>

      {canDelete && selectedMember && selectedSection && (
        <div className={styles.placementActions}>
          <button
            type="button"
            className={styles.placementDelete}
            data-testid="delete-member"
            aria-label={`${selectedSection.mark} ${selectedMember.id} ${t(
              locale,
              'plan.placement.delete',
            )}`}
            onClick={deleteSelected}
          >
            {t(locale, 'plan.placement.delete')}
          </button>
        </div>
      )}

      {failureMessage !== null && (
        <p
          className={styles.placementMessage}
          data-testid="placement-error"
          role="alert"
        >
          ▲ {failureMessage}
        </p>
      )}
    </section>
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

type WallExtentAxis = 'vertical' | 'horizontal'
type WallExtentAnchor = '下端' | '上端' | '始端' | '終端' | 'none'

function replaceWallExtent(
  project: Project,
  memberId: string,
  extent: WallExtent | undefined,
): Project {
  return {
    ...project,
    members: project.members.map((member) => {
      if (member.id !== memberId) return member
      if (extent === undefined) {
        const next = { ...member }
        delete next.wallExtent
        return next
      }
      return { ...member, wallExtent: extent }
    }),
  }
}

function updateWallExtentAxis(
  extent: WallExtent | undefined,
  axis: WallExtentAxis,
  anchor: WallExtentAnchor,
): WallExtent | undefined {
  const next = { ...extent }

  if (anchor === 'none') {
    delete next[axis]
  } else if (axis === 'vertical' && (anchor === '下端' || anchor === '上端')) {
    if (extent?.vertical === undefined) return extent
    next.vertical = {
      anchor,
      heightMm: extent.vertical.heightMm,
    }
  } else if (
    axis === 'horizontal' &&
    (anchor === '始端' || anchor === '終端')
  ) {
    if (extent?.horizontal === undefined) return extent
    next.horizontal = {
      anchor,
      lengthMm: extent.horizontal.lengthMm,
    }
  }

  return next.vertical === undefined && next.horizontal === undefined
    ? undefined
    : next
}

function updateWallExtentDimension(
  extent: WallExtent | undefined,
  axis: WallExtentAxis,
  anchor: WallExtentAnchor,
  value: number,
): WallExtent {
  const next = { ...extent }
  if (axis === 'vertical' && (anchor === '下端' || anchor === '上端')) {
    return {
      ...next,
      vertical: { anchor, heightMm: value },
    }
  }
  if (axis === 'horizontal' && (anchor === '始端' || anchor === '終端')) {
    return {
      ...next,
      horizontal: { anchor, lengthMm: value },
    }
  }
  return next
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
                              {reinforcement.lengthMm === 0 && (
                                <span
                                  className={styles.openingWarning}
                                  data-testid="opening-reinforcement-untranscribed"
                                >
                                  {t(
                                    locale,
                                    'plan.openings.reinforcements.untranscribed',
                                  )}
                                </span>
                              )}
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

function WallExtentEditor() {
  const project = useAppStore(({ project }) => project)
  const locale = useAppStore(({ locale }) => locale)
  const selectedMemberId = useAppStore(({ sel }) => sel.memberId)
  const updateProject = useAppStore(({ updateProject }) => updateProject)
  const [draft, setDraft] = useState<{
    memberId: string | null
    verticalAnchor: WallExtentAnchor
    horizontalAnchor: WallExtentAnchor
    verticalValue: string
    horizontalValue: string
  }>({
    memberId: null,
    verticalAnchor: 'none',
    horizontalAnchor: 'none',
    verticalValue: '',
    horizontalValue: '',
  })

  const member = project.members.find(({ id }) => id === selectedMemberId)
  if (!member || member.kind !== '耐震壁') return null

  const section = findSection(project, member.sectionId)
  const extent = member.wallExtent
  const activeDraft: typeof draft =
    draft.memberId === member.id
      ? draft
      : {
          memberId: member.id,
          verticalAnchor: extent?.vertical?.anchor ?? 'none',
          horizontalAnchor: extent?.horizontal?.anchor ?? 'none',
          verticalValue:
            extent?.vertical === undefined
              ? ''
              : String(extent.vertical.heightMm),
          horizontalValue:
            extent?.horizontal === undefined
              ? ''
              : String(extent.horizontal.lengthMm),
        }
  let invalid = false
  if (extent !== undefined) {
    try {
      wallSpan(project, member)
    } catch (error) {
      invalid =
        error instanceof MemberUnsupportedError && error.reason === '寸法不成立'
    }
  }
  const draftDimensionInvalid =
    (activeDraft.verticalAnchor !== 'none' &&
      activeDraft.verticalValue !== '' &&
      (!Number.isFinite(Number(activeDraft.verticalValue)) ||
        Number(activeDraft.verticalValue) <= 0)) ||
    (activeDraft.horizontalAnchor !== 'none' &&
      activeDraft.horizontalValue !== '' &&
      (!Number.isFinite(Number(activeDraft.horizontalValue)) ||
        Number(activeDraft.horizontalValue) <= 0))

  const commit = (next: WallExtent | undefined) => {
    updateProject((current) => replaceWallExtent(current, member.id, next))
  }

  const changeAxis = (axis: WallExtentAxis, anchor: WallExtentAnchor) => {
    const nextDraft: typeof draft = {
      ...activeDraft,
      ...(axis === 'vertical'
        ? {
            verticalAnchor: anchor,
            verticalValue:
              anchor === 'none'
                ? ''
                : extent?.vertical === undefined
                  ? ''
                  : String(extent.vertical.heightMm),
          }
        : {
            horizontalAnchor: anchor,
            horizontalValue:
              anchor === 'none'
                ? ''
                : extent?.horizontal === undefined
                  ? ''
                  : String(extent.horizontal.lengthMm),
          }),
      memberId: member.id,
    }
    setDraft(nextDraft)

    if (
      anchor === 'none' ||
      (axis === 'vertical' && extent?.vertical) ||
      (axis === 'horizontal' && extent?.horizontal)
    ) {
      commit(updateWallExtentAxis(extent, axis, anchor))
    }
  }

  const changeDimension = (axis: WallExtentAxis, rawValue: string) => {
    const value = Number(rawValue)
    setDraft({
      ...activeDraft,
      memberId: member.id,
      ...(axis === 'vertical'
        ? { verticalValue: rawValue }
        : { horizontalValue: rawValue }),
    })
    if (!Number.isFinite(value) || value <= 0) return

    const anchor =
      axis === 'vertical'
        ? activeDraft.verticalAnchor
        : activeDraft.horizontalAnchor
    commit(updateWallExtentDimension(extent, axis, anchor, value))
  }

  const verticalAnchor = activeDraft.verticalAnchor
  const horizontalAnchor = activeDraft.horizontalAnchor

  return (
    <fieldset
      className={styles.wallExtentFieldset}
      data-testid="wall-extent-editor"
    >
      <legend className={styles.spanLegend}>
        {t(locale, 'plan.wallExtent.title')} — {section.mark}
      </legend>
      <p className={styles.openingHint}>
        {t(locale, 'plan.wallExtent.hint')}
      </p>
      <div className={styles.wallExtentList}>
        <fieldset className={styles.wallExtentAxis}>
          <legend className={styles.openingFieldLabel}>
            {t(locale, 'plan.wallExtent.vertical')}
          </legend>
          <select
            className={styles.spanInput}
            data-testid="wall-extent-vertical-anchor"
            aria-label={`${section.mark} ${t(
              locale,
              'plan.wallExtent.vertical',
            )}`}
            value={verticalAnchor}
            onChange={(event) =>
              changeAxis(
                'vertical',
                event.currentTarget.value as WallExtentAnchor,
              )
            }
          >
            <option value="none">
              {t(locale, 'plan.wallExtent.none')}
            </option>
            <option value="下端">
              {t(locale, 'plan.wallExtent.anchor.vertical.lower')}
            </option>
            <option value="上端">
              {t(locale, 'plan.wallExtent.anchor.vertical.upper')}
            </option>
          </select>
          {verticalAnchor !== 'none' && (
            <label className={styles.openingField}>
              <span className={styles.openingFieldLabel}>
                {t(locale, 'plan.wallExtent.dimension')}
              </span>
              <input
                className={styles.spanInput}
                type="number"
                step="1"
                data-testid="wall-extent-vertical-dimension"
                aria-label={`${section.mark} ${t(
                  locale,
                  'plan.wallExtent.vertical',
                )} ${t(locale, 'plan.wallExtent.dimension')}`}
                value={activeDraft.verticalValue}
                onChange={(event) =>
                  changeDimension('vertical', event.currentTarget.value)
                }
              />
              <span className={styles.unit}>
                {t(locale, 'plan.wallExtent.unit')}
              </span>
            </label>
          )}
        </fieldset>
        <fieldset className={styles.wallExtentAxis}>
          <legend className={styles.openingFieldLabel}>
            {t(locale, 'plan.wallExtent.horizontal')}
          </legend>
          <select
            className={styles.spanInput}
            data-testid="wall-extent-horizontal-anchor"
            aria-label={`${section.mark} ${t(
              locale,
              'plan.wallExtent.horizontal',
            )}`}
            value={horizontalAnchor}
            onChange={(event) =>
              changeAxis(
                'horizontal',
                event.currentTarget.value as WallExtentAnchor,
              )
            }
          >
            <option value="none">
              {t(locale, 'plan.wallExtent.none')}
            </option>
            <option value="始端">
              {t(locale, 'plan.wallExtent.anchor.horizontal.start')}
            </option>
            <option value="終端">
              {t(locale, 'plan.wallExtent.anchor.horizontal.end')}
            </option>
          </select>
          {horizontalAnchor !== 'none' && (
            <label className={styles.openingField}>
              <span className={styles.openingFieldLabel}>
                {t(locale, 'plan.wallExtent.dimension')}
              </span>
              <input
                className={styles.spanInput}
                type="number"
                step="1"
                data-testid="wall-extent-horizontal-dimension"
                aria-label={`${section.mark} ${t(
                  locale,
                  'plan.wallExtent.horizontal',
                )} ${t(locale, 'plan.wallExtent.dimension')}`}
                value={activeDraft.horizontalValue}
                onChange={(event) =>
                  changeDimension('horizontal', event.currentTarget.value)
                }
              />
              <span className={styles.unit}>
                {t(locale, 'plan.wallExtent.unit')}
              </span>
            </label>
          )}
        </fieldset>
      </div>
      {(invalid || draftDimensionInvalid) && (
        <p
          className={styles.wallExtentInvalid}
          data-testid="wall-extent-invalid"
          role="alert"
        >
          ▲ {t(locale, 'plan.wallExtent.invalid')}
        </p>
      )}
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
      <PlacementEditor />
      <WallExtentEditor />
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
