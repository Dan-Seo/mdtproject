'use client'

import { useRef, type KeyboardEvent } from 'react'
import posthog from 'posthog-js'

import type { Member } from '@/domain/model/member'
import {
  findSection,
  gridPoint,
  type Project,
} from '@/domain/model/project'
import { t } from '@/lib/i18n'
import { useAppStore } from '@/lib/store'

import { spanCoordinates, updateProjectSpans, type SpanAxis } from './grid'
import styles from './PlanEditor.module.css'

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
              posthog.capture('story_selected')
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
  const select = () => {
    selectMember(member.id)
    posthog.capture('member_selected', { source: 'plan' })
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

function SpanEditor({ axis }: { axis: SpanAxis }) {
  const project = useAppStore(({ project }) => project)
  const locale = useAppStore(({ locale }) => locale)
  const updateProject = useAppStore(({ updateProject }) => updateProject)
  const spans = axis === 'x' ? project.grid.xSpans : project.grid.ySpans
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
    posthog.capture('grid_edited', { axis })
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
              aria-label={`${axisLabel}スパン ${index + 1}`}
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
              aria-label={`${axisLabel}スパン ${index + 1}${t(
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
    throw new Error(`Story not found: ${activeStoryId}`)
  }

  return (
    <div className={styles.editor}>
      <div className={styles.spanEditors}>
        <SpanEditor axis="x" />
        <SpanEditor axis="y" />
      </div>
      <div className={styles.drawingFrame}>
        <svg
          className={styles.drawing}
          viewBox={`0 0 ${viewWidth} ${viewHeight}`}
          role="img"
          aria-label={`${story.name} 平面`}
        >
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
