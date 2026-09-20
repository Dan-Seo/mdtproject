'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'

import type {
  ElevationApplyResult,
  PlanApplyResult,
} from '@/lib/import/framing-plan/apply'
import type {
  ElevationCandidate,
  PlanBlock,
  PlanGridCandidate,
} from '@/lib/import/framing-plan/types'
import {
  loadDrawingSetModules,
  loadFramingModules,
  peekDrawingSetModules,
  peekFramingModules,
  type DrawingSetModules,
  type FramingModules,
} from '@/lib/import/lazy'
import { extractTextPages } from '@/lib/import/pdf-text'
import type { TextPage } from '@/lib/import/section-list/types'
import { useAppStore } from '@/lib/store'
import { t } from '@/lib/i18n'
import { storyKey, storyLabelFromTitle } from '@/lib/import/story-label'
import type { DrawingSetChoices } from '@/lib/import/drawing-set/plan'
import type { DrawingSetApplyResult } from '@/lib/import/drawing-set/apply'
import type { Conflict, DrawingSetCandidate, DrawingSetMembership, DrawingSetPage, Evidence, SeriesRef } from '@/lib/import/drawing-set/types'

import styles from './PlanImport.module.css'


/**
 * 伏図·軸組図에서 읽은 형상을 **후보로** 보여주고, 사용자가 승인하면 案件에
 * 넣는다 (ADR-030). 断面リスト 취입(ADR-018)과 같은 규약이다 — 승인 전에는
 * 형상이 되지 않고, 못 읽은 것은 지어내지 않고 사유를 말한다.
 *
 * 간이 평면 에디터를 대체하지 않는다. 래스터 도면·미지 형식에서는 이 화면이
 * 빈 후보로 정직하게 실패하고, 그때 형상을 넣는 길은 손입력뿐이다 (ADR-004).
 */

export interface PlanImportProps {
  /** 테스트에서 PDF 추출을 건너뛰고 페이지를 직접 넣는다 */
  initialPages?: TextPage[]
  extractPages?: (file: File) => Promise<TextPage[]>
  /**
   * 遅延の殻 (`LazyPlanImport`) が受け取った図面をそのまま渡す。殻には釦と
   * ファイル入力しか無く、読み取りと候補の表示はここが引き受ける。
   */
  initialFile?: File
  /** 同じく、図面セット側で選ばれた複数の PDF。 */
  initialSetFiles?: File[]
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
  initialFile,
  initialSetFiles,
}: PlanImportProps) {
  const locale = useAppStore(({ locale }) => locale)
  const stories = useAppStore(({ project }) => project.stories)
  const sections = useAppStore(({ project }) => project.sections)
  const updateProject = useAppStore(({ updateProject }) => updateProject)
  const inputRef = useRef<HTMLInputElement>(null)
  const [pages, setPages] = useState<TextPage[] | null>(initialPages ?? null)
  const [open, setOpen] = useState(
    initialPages !== undefined || initialFile !== undefined,
  )
  const [loading, setLoading] = useState(initialFile !== undefined)
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

  const [framing, setFraming] = useState<FramingModules | null>(peekFramingModules)
  useEffect(() => {
    if (pages === null || framing !== null) return
    let live = true
    void loadFramingModules().then((modules) => {
      if (live) setFraming(modules)
    })
    return () => {
      live = false
    }
  }, [pages, framing])

  const plans = useMemo(
    () =>
      framing === null
        ? []
        : (pages ?? []).map((page) => framing.parse.parseFramingPlan(page)),
    [pages, framing],
  )
  const elevations = useMemo(
    () =>
      framing === null
        ? []
        : (pages ?? []).flatMap(
            (page) => framing.elevation.parseFrameElevations(page).elevations,
          ),
    [pages, framing],
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

  const readFile = async (file: File, input?: HTMLInputElement) => {
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
      if (input) input.value = ''
    }
  }

  const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    void readFile(file, input)
  }

  // 殻が受け取った図面を、殻の入力欄で選んだのと同じ経路で読む。
  useEffect(() => {
    if (initialFile !== undefined) void readFile(initialFile)
    // 受け渡しは一度きり — 読み直しは殻ではなくこの画面の入力欄が受ける。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const apply = (block: PlanBlock) => {
    if (framing === null) return
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
      applied = framing.apply.applyFramingPlan(project, {
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
    if (framing === null) return
    let applied: ElevationApplyResult | undefined
    updateProject((project) => {
      applied = framing.apply.applyElevation(project, {
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
      <DrawingSetImport initialFiles={initialSetFiles} />
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
        onChange={selectFile}
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

/** 図面セット 해석기가 오기 전의 자리표시 — 아무 면도 읽지 않은 상태와 같다. */
const emptyDrawingSet = (membership: DrawingSetMembership): DrawingSetCandidate => ({
  pages: [],
  membership,
  referenceChoices: [],
  grid: null,
  stories: null,
  blocks: [],
  conflicts: [],
})
const PENDING_SET = { refusal: '階未確定' as const, detail: null }

const refKey = (r: SeriesRef) => `${r.source}#${r.pageNumber}#${r.index}`
const samePage = (a: Evidence, b: Evidence) => a.source === b.source && a.pageNumber === b.pageNumber

/** Selection state only. Reconciliation and future Story assignments live in lib. */
function DrawingSetImport({ initialFiles }: { initialFiles?: File[] }) {
  const locale = useAppStore(s => s.locale)
  const project = useAppStore(s => s.project)
  const loadProject = useAppStore(s => s.loadProject)
  const input = useRef<HTMLInputElement>(null)
  const request = useRef(0)
  const [open, setOpen] = useState(initialFiles !== undefined)
  const [loading, setLoading] = useState(initialFiles !== undefined)
  const [failed, setFailed] = useState(false)
  const [pages, setPages] = useState<DrawingSetPage[]>([])
  const [membership, setMembership] = useState<DrawingSetMembership>({ excludedPages: [], excludedBlocks: [] })
  const [reference, setReference] = useState<SeriesRef>()
  const [top, setTop] = useState('')
  const [bottom, setBottom] = useState('')
  const [blockStories, setBlockStories] = useState<Record<string, number>>({})
  const [sectionStoryLabels, setSectionStoryLabels] = useState<Record<number, string>>({})
  const [discardMembers, setDiscardMembers] = useState(false)
  const [result, setResult] = useState<DrawingSetApplyResult>()
  const [modules, setModules] = useState<DrawingSetModules | null>(peekDrawingSetModules)
  const candidate = useMemo(
    () =>
      modules === null
        ? emptyDrawingSet(membership)
        : modules.reconcile.assembleDrawingSet(pages, membership, reference),
    [modules, pages, membership, reference],
  )
  const choices: DrawingSetChoices = {
    reference: candidate.stories?.reference ?? { source: '', pageNumber: 0, index: 0 },
    topLevelIndex: top === '' ? NaN : Number(top), bottomLevelIndex: bottom === '' ? NaN : Number(bottom),
    blockStories, sectionStoryLabels, discardMembers,
  }
  // 해석기가 아직 오지 않은 동안은 階가 확정되지 않은 것과 같다 — 실제
  // previewDrawingSetPlan 도 stories 가 없으면 이 거부를 낸다.
  const preview = modules === null ? PENDING_SET : modules.plan.previewDrawingSetPlan(candidate, choices)
  const resolved = modules === null ? PENDING_SET : modules.plan.resolveDrawingSetPlan(candidate, choices)
  const future = 'stories' in preview ? preview.stories : []
  // Initial duplicate suggestions are replaced by the selected range's final mapping.
  const conflicts = [
    ...candidate.conflicts.filter(c => c.code !== '階重複ブロック'),
    ...('duplicates' in preview ? preview.duplicates : candidate.conflicts.filter(c => c.code === '階重複ブロック')),
  ]
  const sectionLabels = [...new Set(project.sections.flatMap(s => s.storyLabel ? [s.storyLabel] : []))]
  const clearResult = () => { setResult(undefined); setDiscardMembers(false) }
  const clearChoices = () => {
    setTop(''); setBottom(''); setBlockStories({}); setSectionStoryLabels({})
    setResult(undefined); setDiscardMembers(false)
  }
  const updateMembership = (next: DrawingSetMembership) => {
    if (modules === null) return
    // Re-select automatically only if the old reference is no longer included.
    const nextCandidate = modules.reconcile.assembleDrawingSet(pages, next, candidate.stories?.reference)
    if (!nextCandidate.stories) { setReference(undefined); clearChoices() }
    else setReference(nextCandidate.stories.reference)
    setMembership(next); setResult(undefined); setDiscardMembers(false)
  }
  const readFiles = async (files: File[], element?: HTMLInputElement) => {
    if (!files.length) return
    const id = ++request.current
    setOpen(true); setLoading(true); setFailed(false); setPages([])
    setReference(undefined); setMembership({ excludedPages: [], excludedBlocks: [] }); clearChoices()
    try {
      // 도면을 고른 이 시점에 해석기를 받는다 — 頁 추출과 같이 기다리게 한다.
      const loaded = loadDrawingSetModules()
      const next: DrawingSetPage[] = []
      for (const file of files) {
        const extracted = await extractTextPages(file)
        if (request.current !== id) return
        next.push(...extracted.map((page, i) => ({ source: file.name, pageNumber: i + 1, page })))
      }
      const ready = await loaded
      if (request.current !== id) return
      setModules(ready)
      setPages(next)
    } catch {
      if (request.current === id) setFailed(true)
    } finally {
      if (request.current === id) { setLoading(false); if (element) element.value = '' }
    }
  }
  const load = (event: ChangeEvent<HTMLInputElement>) => {
    const element = event.currentTarget
    void readFiles(Array.from(element.files ?? []), element)
  }
  // 殻が受け取った図面セットを、殻の入力欄で選んだのと同じ経路で読む。
  useEffect(() => {
    if (initialFiles !== undefined) void readFiles(initialFiles)
    // 受け渡しは一度きり — 選び直しは殻ではなくこの画面の入力欄が受ける。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const applySet = () => {
    if (modules === null || !('plan' in resolved) || loading) return
    const applied = modules.apply.applyDrawingSet(useAppStore.getState().project, resolved.plan)
    // Replacing the entire floor stack invalidates selection just like JSON import.
    if (!applied.refusal) loadProject(applied.project)
    setResult(applied)
  }
  const refLabel = (r: SeriesRef) => {
    const page = candidate.pages.find(p => samePage(p, r))
    return `${r.source} p.${r.pageNumber} · ${r.index + 1} · ${page?.elevations[r.index]?.titles.join('／') || t(locale, 'planImport.elevationUntitled')}`
  }
  const conflictSummary = (c: Conflict) => {
    const location = c.evidence.map(e => `${e.source} p.${e.pageNumber}`).join(' / ')
    if (c.code === '階高不一致') return `${location} · ${c.payload.levelA} → ${c.payload.levelB}: ${c.payload.referenceMm} / ${c.payload.seriesMm} mm · ${refLabel(c.payload.series)}`
    if (c.code === '階未収録レベル') return `${location} · ${c.payload.level} · ${refLabel(c.payload.series)}`
    return `${location} · ${'storyName' in c.payload ? c.payload.storyName : ''} · ${c.payload.blocks.map(r => `${r.source} p.${r.pageNumber} [${r.index + 1}]`).join(' / ')}`
  }
  return <>
    <button type="button" className={styles.openButton} onClick={() => pages.length ? setOpen(true) : input.current?.click()}>{t(locale, 'drawingSet.title')}</button>
    <input ref={input} className={styles.fileInput} type="file" multiple accept="application/pdf" data-testid="drawing-set-files" aria-label={t(locale, 'drawingSet.files')} onChange={load} />
    {open && <section className={`${styles.panel} ${styles.drawingSet}`} aria-label={t(locale, 'drawingSet.title')}>
      <header className={styles.panelHeader}><h3>{t(locale, 'drawingSet.title')}</h3><div className={styles.panelActions}>
        <button type="button" className={styles.chooseButton} onClick={() => input.current?.click()}>{t(locale, 'drawingSet.files')}</button>
        <button type="button" className={styles.closeButton} onClick={() => setOpen(false)}>{t(locale, 'planImport.close')}</button>
      </div></header>
      <div className={styles.panelBody}>
        {loading && <p role="status">{t(locale, 'planImport.loading')}</p>}
        {failed && <p role="alert">{t(locale, 'planImport.error')}</p>}
        <div data-testid="drawing-set-pages" className={styles.group}>
          {candidate.pages.map((p, i) => {
            const included = !membership.excludedPages.some(e => samePage(e, p))
            return <div key={`${p.source}-${p.pageNumber}-${i}`} data-testid={`drawing-set-page-${i}`} className={styles.block}>
              <label className={styles.storyPicker}><input type="checkbox" data-testid={`drawing-set-page-include-${i}`} checked={included} onChange={e => updateMembership({ ...membership, excludedPages: e.target.checked ? membership.excludedPages.filter(x => !samePage(x, p)) : [...membership.excludedPages, { source: p.source, pageNumber: p.pageNumber }] })} />
                {p.source} p.{p.pageNumber} · {p.roles.map(r => t(locale, `drawingSet.role.${r}`)).join(' / ') || t(locale, 'drawingSet.noRole')}
              </label>
              {p.blocks.map((b, j) => {
                const r = { source: p.source, pageNumber: p.pageNumber, index: j }
                return <label key={j} className={styles.storyPicker}><input type="checkbox" data-testid={`drawing-set-block-include-${i}-${j}`} disabled={!included} checked={!membership.excludedBlocks.some(x => refKey(x) === refKey(r))} onChange={e => updateMembership({ ...membership, excludedBlocks: e.target.checked ? membership.excludedBlocks.filter(x => refKey(x) !== refKey(r)) : [...membership.excludedBlocks, r] })} />
                  [{j + 1}] {b.title || (b.xGrid.axes.map(a => a.label).join('·') + ' / ' + b.yGrid.axes.map(a => a.label).join('·'))}
                </label>
              })}
            </div>
          })}
        </div>
        <label className={styles.storyPicker}>{t(locale, 'drawingSet.reference')}
          <select data-testid="drawing-set-reference" value={candidate.stories ? refKey(candidate.stories.reference) : ''} onChange={e => { setReference(candidate.referenceChoices.find(r => refKey(r) === e.target.value)); clearChoices() }}>
            <option value="">{t(locale, 'planImport.storyAny')}</option>
            {candidate.referenceChoices.map(r => <option key={refKey(r)} value={refKey(r)}>{refLabel(r)}</option>)}
          </select>
        </label>
        {(['top', 'bottom'] as const).map(side => <label key={side} className={styles.storyPicker}>{t(locale, side === 'top' ? 'planImport.topLevel' : 'planImport.bottomLevel')}
          <select data-testid={`drawing-set-level-${side}`} value={side === 'top' ? top : bottom} onChange={e => { (side === 'top' ? setTop : setBottom)(e.target.value); clearResult() }}>
            <option value="">{t(locale, 'planImport.storyAny')}</option>
            {candidate.stories?.levels.map((name, i) => <option key={i} value={i}>{name || t(locale, 'planImport.levelUnlabelled')} [{i}]</option>)}
          </select>
        </label>)}
        {candidate.blocks.map(b => {
          const key = refKey(b.ref)
          const assignment = 'perStory' in preview ? preview.perStory.find(x => refKey(x.ref) === key) : undefined
          const value = blockStories[key] ?? assignment?.levelIndex
          return <label key={key} className={styles.storyPicker}>
            {b.ref.source} p.{b.ref.pageNumber} · {b.block.title || t(locale, 'planImport.blockUntitled')}
            <select data-testid={`drawing-set-block-story-${key}`} value={future.some(s => s.levelIndex === value) ? value : ''} onChange={e => { setBlockStories(current => ({ ...current, [key]: e.target.value === '' ? NaN : Number(e.target.value) })); clearResult() }}>
              <option value="">{t(locale, 'planImport.storyAny')}</option>
              {future.map(s => <option key={s.levelIndex} value={s.levelIndex}>{s.storyName} [{s.levelIndex}]</option>)}
            </select>
            {blockStories[key] === undefined && assignment && <span>{t(locale, 'drawingSet.automatic')}</span>}
          </label>
        })}
        {future.map(s => <label key={s.levelIndex} className={styles.storyPicker}>{s.storyName} · {t(locale, 'planImport.sectionStory')}
          <select data-testid={`drawing-set-section-story-${s.levelIndex}`} value={sectionStoryLabels[s.levelIndex] ?? ''} onChange={e => {
            const value = e.target.value
            setSectionStoryLabels(current => {
              const next = { ...current }
              if (value === '') delete next[s.levelIndex]
              else next[s.levelIndex] = value
              return next
            })
            clearResult()
          }}>
            <option value="">{t(locale, 'planImport.sectionStoryAny')}</option>
            {sectionLabels.map(label => <option key={label} value={label}>{label}</option>)}
          </select>
        </label>)}
        <ul data-testid="drawing-set-conflicts" className={styles.issues}>{conflicts.map((c, i) => <li key={i} data-testid={`drawing-set-conflict-${i}`}>
          <strong>{t(locale, c.blocking ? 'drawingSet.blocking' : 'drawingSet.information')} · {t(locale, `drawingSet.conflict.${c.code}`)}</strong> — {conflictSummary(c)}
        </li>)}</ul>
        {'refusal' in resolved && <p data-testid="drawing-set-plan-refusal">{t(locale, `drawingSet.refusal.${resolved.refusal}`)}</p>}
        {result?.refusal === '部材あり階置換不可' && <label className={styles.storyPicker}><input type="checkbox" data-testid="drawing-set-discard-members" checked={discardMembers} onChange={e => setDiscardMembers(e.target.checked)} />{t(locale, 'planImport.discardMembers')}</label>}
        <button type="button" className={styles.applyButton} data-testid="drawing-set-apply" disabled={loading || !('plan' in resolved)} onClick={applySet}>{t(locale, 'planImport.apply')}</button>
        {result && <div data-testid="drawing-set-result" role="status">
          {result.refusal ? t(locale, `planImport.elevationRefusal.${result.refusal}`) : `${t(locale, 'planImport.appliedStories')}: ${result.storiesApplied}`}
          {result.perStory.map((s, i) => <p key={i}>{s.storyName}: {'unmapped' in s ? t(locale, 'drawingSet.unmapped') : `${t(locale, 'planImport.applied')}: ${s.applied}${s.refusal ? ` / ${t(locale, `planImport.refusal.${s.refusal}`)}` : ''}${s.skipped.map(x => ` / ${x.mark}: ${t(locale, `planImport.skip.${x.reason}`)}`).join('')}`}</p>)}
        </div>}
      </div>
    </section>}
  </>
}
