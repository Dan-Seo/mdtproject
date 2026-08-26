'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'

import {
  applyElevation,
  applyFramingPlan,
  type ElevationApplyResult,
  type PlanApplyResult,
} from '@/lib/import/framing-plan/apply'
import { parseFrameElevations } from '@/lib/import/framing-plan/elevation'
import { parseFramingPlan } from '@/lib/import/framing-plan/parse'
import type {
  ElevationCandidate,
  PlanBlock,
  PlanGridCandidate,
} from '@/lib/import/framing-plan/types'
import { extractTextPages } from '@/lib/import/pdf-text'
import type { TextPage } from '@/lib/import/section-list/types'
import { useAppStore } from '@/lib/store'
import { t } from '@/lib/i18n'
import { storyKey, storyLabelFromTitle } from '@/lib/import/story-label'

import styles from './PlanImport.module.css'

/**
 * 伏図·軸組図에서 읽은 형상을 **후보로** 보여주고, 사용자가 승인하면 案件에
 * 넣는다 (ADR-030). 断面リスト 취입(ADR-018)과 같은 규약이다 — 승인 전에는
 * 형상이 되지 않고, 못 읽은 것은 지어내지 않고 사유를 말한다.
 *
 * 간이 평면 에디터를 대체하지 않는다. 래스터 도면·미지 형식에서는 이 화면이
 * 빈 후보로 정직하게 실패하고, 그때 형상을 넣는 길은 손입력뿐이다 (ADR-004).
 */

interface PlanImportProps {
  /** 테스트에서 PDF 추출을 건너뛰고 페이지를 직접 넣는다 */
  initialPages?: TextPage[]
  extractPages?: (file: File) => Promise<TextPage[]>
}

interface SelectionEvidence {
  title: string
  target: string
}

interface AutomaticSelections {
  storyId?: string
  story?: SelectionEvidence
  sectionStoryLabel?: string
  section?: SelectionEvidence
}

function automaticSelections(
  block: PlanBlock,
  stories: Array<{ id: string; name: string }>,
  sectionStoryLabels: string[],
): AutomaticSelections {
  if (!block.title) return {}

  const titleLabel = storyLabelFromTitle(block.title)
  const titleKey = titleLabel ? storyKey(titleLabel) : undefined
  if (titleKey === undefined) return {}

  const matchingStories = stories.filter(
    (story) =>
      storyKey(story.id) === titleKey || storyKey(story.name) === titleKey,
  )
  const story = matchingStories.length === 1 ? matchingStories[0] : undefined

  const matchingSectionLabels = sectionStoryLabels.filter(
    (label) => storyKey(label) === titleKey,
  )
  const sectionStoryLabel =
    matchingSectionLabels.length === 1 ? matchingSectionLabels[0] : undefined

  return {
    ...(story
      ? {
          storyId: story.id,
          story: { title: block.title, target: story.name },
        }
      : {}),
    ...(sectionStoryLabel
      ? {
          sectionStoryLabel,
          section: { title: block.title, target: sectionStoryLabel },
        }
      : {}),
  }
}

function Axes({
  candidate,
  label,
  testId,
}: {
  candidate: PlanGridCandidate
  label: string
  testId: string
}) {
  return (
    <div className={styles.group} data-testid={testId}>
      <h4 className={styles.groupTitle}>{label}</h4>
      <p className={styles.axes}>
        {candidate.axes.map((axis, index) => (
          <span key={`${axis.label}-${index}`}>
            <span className={styles.axis}>{axis.label}</span>
            {index < candidate.spansMm.length ? (
              <span className={styles.span}>
                {` — ${candidate.spansMm[index]} — `}
              </span>
            ) : null}
          </span>
        ))}
      </p>
    </div>
  )
}

function Elevation({
  candidate,
  index,
  locale,
  onApply,
  result,
  discardMembers,
  onDiscardMembersChange,
}: {
  candidate: ElevationCandidate
  index: number
  locale: 'ja' | 'ko'
  onApply: (topLevelIndex: number, bottomLevelIndex: number) => void
  result: ElevationApplyResult | null
  discardMembers: boolean
  onDiscardMembersChange: (next: boolean) => void
}) {
  // 「어느 레벨이 階의 경계인가」는 조문이 아니라 설계 의도라 사람이 고른다
  // (ADR-030). 기본값은 양 끝 — 제품은 パラペット이나 基礎를 알아볼 수 없으므로
  // 가장 넓게 잡아 두고 사용자가 좁힌다
  const [top, setTop] = useState(0)
  const [bottom, setBottom] = useState(candidate.levels.length - 1)

  const levelLabel = (levelIndex: number) => {
    const level = candidate.levels[levelIndex]
    return level.labels.length > 0
      ? level.labels.join('／')
      : t(locale, 'planImport.levelUnlabelled')
  }

  return (
    <div
      className={styles.elevation}
      data-testid={`plan-import-elevation-${index}`}
    >
      <div className={styles.blockHeading}>
        <strong>
          {candidate.titles.join('・') ||
            t(locale, 'planImport.elevationUntitled')}
        </strong>
        <button
          type="button"
          className={styles.applyButton}
          data-testid={`plan-import-apply-elevation-${index}`}
          onClick={() => onApply(top, bottom)}
        >
          {t(locale, 'planImport.applyStories')}
        </button>
      </div>
      <p className={styles.axes}>
        {candidate.levels.map((level, levelIndex) => (
          <span key={levelIndex}>
            <span className={styles.axis}>
              {level.labels.join('／') || '—'}
            </span>
            {levelIndex < candidate.heightsMm.length ? (
              <span className={styles.span}>
                {` — ${candidate.heightsMm[levelIndex]} — `}
              </span>
            ) : null}
          </span>
        ))}
      </p>
      <div className={styles.storyPicker}>
        <label className={styles.storyPicker}>
          {t(locale, 'planImport.topLevel')}
          <select
            data-testid={`plan-import-level-top-${index}`}
            value={top}
            onChange={(event) => setTop(Number(event.target.value))}
          >
            {candidate.levels.map((level, levelIndex) => (
              <option key={levelIndex} value={levelIndex}>
                {levelLabel(levelIndex)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.storyPicker}>
          {t(locale, 'planImport.bottomLevel')}
          <select
            data-testid={`plan-import-level-bottom-${index}`}
            value={bottom}
            onChange={(event) => setBottom(Number(event.target.value))}
          >
            {candidate.levels.map((level, levelIndex) => (
              <option key={levelIndex} value={levelIndex}>
                {levelLabel(levelIndex)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {/* 동의는 거부를 한 번 본 뒤에만 물어본다 */}
      {result?.refusal === '部材あり階置換不可' ? (
        <label className={styles.storyPicker}>
          <input
            type="checkbox"
            data-testid={`plan-import-discard-members-${index}`}
            checked={discardMembers}
            onChange={(event) => onDiscardMembersChange(event.target.checked)}
          />
          {t(locale, 'planImport.discardMembers')}
        </label>
      ) : null}
      {result ? (
        <p
          className={styles.muted}
          data-testid={`plan-import-elevation-result-${index}`}
        >
          {result.refusal
            ? t(locale, `planImport.elevationRefusal.${result.refusal}`)
            : `${t(locale, 'planImport.appliedStories')}: ${result.applied}`}
        </p>
      ) : null}
    </div>
  )
}

export function PlanImport({
  initialPages,
  extractPages = extractTextPages,
}: PlanImportProps) {
  const locale = useAppStore(({ locale }) => locale)
  const stories = useAppStore(({ project }) => project.stories)
  const sections = useAppStore(({ project }) => project.sections)
  const updateProject = useAppStore(({ updateProject }) => updateProject)
  const inputRef = useRef<HTMLInputElement>(null)
  const [pages, setPages] = useState<TextPage[] | null>(initialPages ?? null)
  const [open, setOpen] = useState(initialPages !== undefined)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [storyId, setStoryId] = useState('')
  const [storySelectionWasManual, setStorySelectionWasManual] = useState(false)
  const [sectionStoryLabel, setSectionStoryLabel] = useState<
    string | undefined
  >(undefined)
  const [sectionSelectionWasManual, setSectionSelectionWasManual] =
    useState(false)
  const [storyEvidence, setStoryEvidence] = useState<
    SelectionEvidence | undefined
  >(undefined)
  const [sectionEvidence, setSectionEvidence] = useState<
    SelectionEvidence | undefined
  >(undefined)
  const [result, setResult] = useState<PlanApplyResult | null>(null)
  const [discardOtherStories, setDiscardOtherStories] = useState(false)
  const [discardMembers, setDiscardMembers] = useState(false)
  const [elevationResults, setElevationResults] = useState<
    Record<number, ElevationApplyResult>
  >({})
  // 연속 선택 시 늦게 끝난 이전 파일의 결과가 최신 결과를 덮지 않게 한다
  const requestRef = useRef(0)

  const plans = useMemo(
    () => (pages ?? []).map((page) => parseFramingPlan(page)),
    [pages],
  )
  const elevations = useMemo(
    () => (pages ?? []).flatMap((page) => parseFrameElevations(page).elevations),
    [pages],
  )
  const grids = plans.flatMap((plan) => plan.grids)
  const gridIndexes = { X: 0, Y: 0 }
  const displayedGrids = grids.map((candidate) => ({
    candidate,
    index: gridIndexes[candidate.direction]++,
  }))
  const blocks: PlanBlock[] = plans.flatMap((plan) => plan.blocks)
  const sectionStoryLabels = useMemo(() => {
    const labels: string[] = []
    const seen = new Set<string>()
    for (const section of sections) {
      if (!section.storyLabel || seen.has(section.storyLabel)) continue
      seen.add(section.storyLabel)
      labels.push(section.storyLabel)
    }
    return labels
  }, [sections])

  useEffect(() => {
    if (storyId === '' || stories.some((story) => story.id === storyId)) return

    setStoryId('')
    setStorySelectionWasManual(false)
    setStoryEvidence(undefined)
  }, [stories, storyId])

  // 사유는 페이지마다 나오므로 접는다 — 같은 말이 페이지 수만큼 늘어서면 읽히지 않는다
  const issues = [...new Set(plans.flatMap((plan) => plan.issues))]

  const selectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return

    const requestId = ++requestRef.current
    setOpen(true)
    setLoading(true)
    setFailed(false)
    setResult(null)
    setElevationResults({})
    try {
      const next = await extractPages(file)
      if (requestRef.current !== requestId) return
      setPages(next)
    } catch {
      if (requestRef.current !== requestId) return
      setPages(null)
      setFailed(true)
    } finally {
      if (requestRef.current === requestId) setLoading(false)
      input.value = ''
    }
  }

  const apply = (block: PlanBlock) => {
    const automatic = automaticSelections(block, stories, sectionStoryLabels)
    const nextStoryId = storySelectionWasManual
      ? storyId
      : automatic.storyId ?? ''
    const nextSectionStoryLabel = sectionSelectionWasManual
      ? sectionStoryLabel
      : automatic.sectionStoryLabel

    if (!storySelectionWasManual && automatic.story) {
      setStoryId(nextStoryId)
      setStoryEvidence(automatic.story)
    } else {
      setStoryEvidence(undefined)
    }
    if (!sectionSelectionWasManual && automatic.section) {
      setSectionStoryLabel(nextSectionStoryLabel)
      setSectionEvidence(automatic.section)
    } else {
      setSectionEvidence(undefined)
    }

    let applied: PlanApplyResult | undefined
    updateProject((project) => {
      applied = applyFramingPlan(project, {
        block,
        storyId: nextStoryId,
        sectionStoryLabel: nextSectionStoryLabel,
        discardOtherStories,
      })
      return applied.project
    })
    if (applied) setResult(applied)
  }

  const applyStories = (
    candidate: ElevationCandidate,
    index: number,
    topLevelIndex: number,
    bottomLevelIndex: number,
  ) => {
    let applied: ElevationApplyResult | undefined
    updateProject((project) => {
      applied = applyElevation(project, {
        candidate,
        topLevelIndex,
        bottomLevelIndex,
        discardMembers,
      })
      return applied.project
    })
    if (applied) {
      const next = applied
      setElevationResults((current) => ({ ...current, [index]: next }))
    }
  }

  return (
    <div className={styles.control}>
      <button
        type="button"
        className={styles.openButton}
        onClick={() => {
          if (pages) setOpen(true)
          else inputRef.current?.click()
        }}
      >
        {t(locale, 'planImport.open')}
      </button>
      <input
        ref={inputRef}
        className={styles.fileInput}
        data-testid="plan-import-file"
        type="file"
        accept="application/pdf"
        aria-label={t(locale, 'planImport.file')}
        onChange={(event) => void selectFile(event)}
      />
      {open ? (
        <section
          className={styles.panel}
          role="dialog"
          aria-modal="false"
          aria-labelledby="plan-import-title"
        >
          <header className={styles.panelHeader}>
            <h3 id="plan-import-title">{t(locale, 'planImport.title')}</h3>
            <div className={styles.panelActions}>
              <button
                type="button"
                className={styles.chooseButton}
                onClick={() => inputRef.current?.click()}
              >
                {t(locale, 'planImport.chooseAnother')}
              </button>
              <button
                type="button"
                className={styles.closeButton}
                onClick={() => setOpen(false)}
              >
                {t(locale, 'planImport.close')}
              </button>
            </div>
          </header>
          <div className={styles.panelBody}>
            {loading ? (
              <p role="status">{t(locale, 'planImport.loading')}</p>
            ) : failed ? (
              <p role="alert">{t(locale, 'planImport.error')}</p>
            ) : (
              <>
                {issues.length > 0 ? (
                  <ul className={styles.issues} data-testid="plan-import-issues">
                    {issues.map((issue) => (
                      <li key={issue}>
                        {t(locale, `planImport.issue.${issue}`)}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {displayedGrids.map(({ candidate, index }) => (
                  <Axes
                    key={`${candidate.direction}-${index}`}
                    candidate={candidate}
                    label={t(
                      locale,
                      candidate.direction === 'X'
                        ? 'planImport.gridX'
                        : 'planImport.gridY',
                    )}
                    testId={`plan-import-grid-${candidate.direction}-${index}`}
                  />
                ))}

                {sectionStoryLabels.length > 0 ? (
                  <div className={styles.storyPicker}>
                    <label className={styles.storyPicker}>
                      {t(locale, 'planImport.sectionStory')}
                      <select
                        data-testid="plan-import-section-story"
                        value={sectionStoryLabel ?? ''}
                        onChange={(event) => {
                          setSectionStoryLabel(
                            event.target.value === ''
                              ? undefined
                              : event.target.value,
                          )
                          setSectionSelectionWasManual(true)
                          setSectionEvidence(undefined)
                        }}
                      >
                        <option value="">
                          {t(locale, 'planImport.sectionStoryAny')}
                        </option>
                        {sectionStoryLabels.map((label) => (
                          <option key={label} value={label}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {sectionEvidence ? (
                      <span
                        className={styles.muted}
                        data-testid="plan-import-section-story-evidence"
                      >
                        {`${t(locale, 'planImport.autoSelection')}: ${sectionEvidence.title} → ${sectionEvidence.target}`}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {blocks.length > 0 ? (
                  <div className={styles.storyPicker}>
                    <label className={styles.storyPicker}>
                      {t(locale, 'planImport.story')}
                      <select
                        data-testid="plan-import-story"
                        value={storyId}
                        onChange={(event) => {
                          setStoryId(event.target.value)
                          setStorySelectionWasManual(true)
                          setStoryEvidence(undefined)
                        }}
                      >
                        <option value="">
                          {t(locale, 'planImport.storyAny')}
                        </option>
                        {stories.map((story) => (
                          <option key={story.id} value={story.id}>
                            {story.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {storyEvidence ? (
                      <span
                        className={styles.muted}
                        data-testid="plan-import-story-evidence"
                      >
                        {`${t(locale, 'planImport.autoSelection')}: ${storyEvidence.title} → ${storyEvidence.target}`}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {blocks.map((block, index) => (
                  <div
                    key={`${block.title ?? 'block'}-${index}`}
                    className={styles.block}
                  >
                    <div className={styles.blockHeading}>
                      <strong>
                        {block.title ?? t(locale, 'planImport.blockUntitled')}
                      </strong>
                      <button
                        type="button"
                        className={styles.applyButton}
                        data-testid={`plan-import-apply-${index}`}
                        onClick={() => apply(block)}
                      >
                        {t(locale, 'planImport.apply')}
                      </button>
                    </div>
                    <p className={styles.muted}>
                      {`${t(locale, 'planImport.placements')}: ${block.placements.length}`}
                      {block.unplacedMarks.length > 0
                        ? ` / ${t(locale, 'planImport.unplaced')}: ${block.unplacedMarks.join('・')}`
                        : ''}
                    </p>
                    <Axes
                      candidate={block.xGrid}
                      label={t(locale, 'planImport.gridX')}
                      testId={`plan-import-block-grid-${index}-X`}
                    />
                    <Axes
                      candidate={block.yGrid}
                      label={t(locale, 'planImport.gridY')}
                      testId={`plan-import-block-grid-${index}-Y`}
                    />
                  </div>
                ))}

                {elevations.map((candidate, index) => (
                  <Elevation
                    key={index}
                    candidate={candidate}
                    index={index}
                    locale={locale}
                    result={elevationResults[index] ?? null}
                    discardMembers={discardMembers}
                    onDiscardMembersChange={setDiscardMembers}
                    onApply={(topLevel, bottomLevel) =>
                      applyStories(candidate, index, topLevel, bottomLevel)
                    }
                  />
                ))}

                {/* 동의는 거부를 한 번 본 뒤에만 물어본다 — 처음부터 내놓으면
                    「무슨 뜻인지 모른 채 켜 두는 칸」이 된다 */}
                {result?.refusal === '他階部材あり通り芯変更不可' ? (
                  <label className={styles.storyPicker}>
                    <input
                      type="checkbox"
                      data-testid="plan-import-discard"
                      checked={discardOtherStories}
                      onChange={(event) =>
                        setDiscardOtherStories(event.target.checked)
                      }
                    />
                    {t(locale, 'planImport.discardOtherStories')}
                  </label>
                ) : null}

                {result ? (
                  <p className={styles.muted} data-testid="plan-import-result">
                    {result.refusal
                      ? t(locale, `planImport.refusal.${result.refusal}`)
                      : `${t(locale, 'planImport.applied')}: ${result.applied}`}
                    {result.skipped.length > 0
                      ? ` / ${result.skipped
                          .map(
                            ({ mark, reason }) =>
                              `${mark}(${t(locale, `planImport.skip.${reason}`)})`,
                          )
                          .join('、')}`
                      : ''}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </section>
      ) : null}
    </div>
  )
}
