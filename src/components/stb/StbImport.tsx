'use client'

import { useEffect, useRef, useState, type ChangeEvent } from 'react'

import { applyStbGrid, applyStbStories } from '@/lib/import/stb/apply'
import type { StbGridCandidate, StbSkeletonCandidate } from '@/lib/import/stb/types'
import { t } from '@/lib/i18n'
import { useAppStore } from '@/lib/store'

import styles from './StbImport.module.css'

export interface StbImportProps {
  /** 테스트에서 파일 해석을 건너뛰고 후보를 직접 넣는 컴포넌트 테스트용 경계. */
  initialCandidate?: StbSkeletonCandidate
  /**
   * 遅延の殻 (`LazyStbImport`) が受け取った .stb をそのまま渡す。殻には釦と
   * ファイル入力しか無く、解析と候補の表示はここが引き受ける。
   */
  initialFile?: File
}

type GridApplyResult = ReturnType<typeof applyStbGrid>
type StoriesApplyResult = ReturnType<typeof applyStbStories>

function GridCandidate({
  candidate,
  locale,
}: {
  candidate: StbGridCandidate
  locale: 'ja' | 'ko'
}) {
  return (
    <div className={styles.group} data-testid={`stb-import-grid-${candidate.direction}`}>
      <h4 className={styles.groupTitle}>
        {t(
          locale,
          candidate.direction === 'X' ? 'stbImport.gridX' : 'stbImport.gridY',
        )}
      </h4>
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

function ApplyResult({
  result,
  locale,
  successKey,
  count,
  testId,
}: {
  result: GridApplyResult | StoriesApplyResult | null
  locale: 'ja' | 'ko'
  successKey: 'stbImport.appliedGrid' | 'stbImport.appliedStories'
  count: number
  testId: string
}) {
  if (!result) return null

  return (
    <p className={styles.result} data-testid={testId}>
      {result.refusal
        ? t(locale, `stbImport.refusal.${result.refusal}`)
        : `${t(locale, successKey)}: ${count}`}
    </p>
  )
}

export function StbImport({ initialCandidate, initialFile }: StbImportProps) {
  const locale = useAppStore(({ locale }) => locale)
  const updateProject = useAppStore(({ updateProject }) => updateProject)
  const inputRef = useRef<HTMLInputElement>(null)
  const [candidate, setCandidate] = useState<StbSkeletonCandidate | null>(
    initialCandidate ?? null,
  )
  const [open, setOpen] = useState(
    initialCandidate !== undefined || initialFile !== undefined,
  )
  const [loading, setLoading] = useState(initialFile !== undefined)
  const [failed, setFailed] = useState(false)
  const [gridResult, setGridResult] = useState<GridApplyResult | null>(null)
  const [storiesResult, setStoriesResult] = useState<StoriesApplyResult | null>(
    null,
  )
  const [discardGridMembers, setDiscardGridMembers] = useState(false)
  const [discardStoryMembers, setDiscardStoryMembers] = useState(false)
  const requestRef = useRef(0)

  const readFile = async (file: File, input?: HTMLInputElement) => {
    const requestId = ++requestRef.current
    setOpen(true)
    setLoading(true)
    setFailed(false)
    setCandidate(null)
    setGridResult(null)
    setStoriesResult(null)
    setDiscardGridMembers(false)
    setDiscardStoryMembers(false)

    try {
      // .stb 해석기는 파일을 고른 뒤에야 받는다 — 여는 단추만으로는 오지 않으므로
      // 초기 로드의 전송 바이트에 들어가지 않는다.
      const [{ decodeStbBytes }, { parseStbDocument }, { toSkeletonCandidate }] =
        await Promise.all([
          import('@/lib/import/stb/decode'),
          import('@/lib/import/stb/document'),
          import('@/lib/import/stb/candidates'),
        ])
      const decoded = decodeStbBytes(await file.arrayBuffer())
      if (requestRef.current !== requestId) return

      if (!decoded.ok) {
        setCandidate({
          version: '—',
          grids: [],
          stories: [],
          unsupported: [],
          issues: [decoded.issue],
        })
      } else {
        const document = parseStbDocument(decoded.text, decoded.encoding)
        setCandidate(toSkeletonCandidate(document))
      }
    } catch {
      if (requestRef.current !== requestId) return
      setCandidate(null)
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

  // 殻が受け取った .stb を、殻の入力欄で選んだのと同じ経路で読む。
  useEffect(() => {
    if (initialFile !== undefined) void readFile(initialFile)
    // 受け渡しは一度きり — 読み直しは殻ではなくこの画面の入力欄が受ける。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const applyGrid = () => {
    if (!candidate) return

    let next: GridApplyResult | undefined
    updateProject((project) => {
      next = applyStbGrid(project, candidate, {
        discardMembers: discardGridMembers,
      })
      return next.project
    })
    if (next) setGridResult(next)
  }

  const applyStories = () => {
    if (!candidate) return

    let next: StoriesApplyResult | undefined
    updateProject((project) => {
      next = applyStbStories(project, candidate, {
        discardMembers: discardStoryMembers,
      })
      return next.project
    })
    if (next) setStoriesResult(next)
  }

  const hasGridCandidate =
    candidate?.grids.filter(({ direction }) => direction === 'X').length === 1 &&
    candidate.grids.filter(({ direction }) => direction === 'Y').length === 1
  const hasStoryCandidate = candidate !== null && candidate.stories.length > 0

  return (
    <div className={styles.control}>
      <button
        type="button"
        className={styles.openButton}
        onClick={() => {
          if (candidate) setOpen(true)
          else inputRef.current?.click()
        }}
      >
        {t(locale, 'stbImport.open')}
      </button>
      <input
        ref={inputRef}
        className={styles.fileInput}
        data-testid="stb-import-file"
        type="file"
        accept=".stb"
        aria-label={t(locale, 'stbImport.file')}
        onChange={selectFile}
      />

      {open ? (
        <section
          className={styles.panel}
          role="dialog"
          aria-modal="false"
          aria-labelledby="stb-import-title"
        >
          <header className={styles.panelHeader}>
            <h3 id="stb-import-title" data-testid="stb-import-title">
              {t(locale, 'stbImport.title')}
            </h3>
            <div className={styles.panelActions}>
              <button
                type="button"
                className={styles.chooseButton}
                onClick={() => inputRef.current?.click()}
              >
                {t(locale, 'stbImport.chooseAnother')}
              </button>
              <button
                type="button"
                className={styles.closeButton}
                onClick={() => setOpen(false)}
              >
                {t(locale, 'stbImport.close')}
              </button>
            </div>
          </header>

          <div className={styles.panelBody}>
            {loading ? (
              <p role="status">{t(locale, 'stbImport.loading')}</p>
            ) : failed ? (
              <p role="alert">{t(locale, 'stbImport.error')}</p>
            ) : candidate ? (
              <>
                <div className={styles.metadata}>
                  <span data-testid="stb-import-version">
                    {`${t(locale, 'stbImport.version')}: ${candidate.version}`}
                  </span>
                  {candidate.projectName !== undefined ? (
                    <span data-testid="stb-import-project-name">
                      {`${t(locale, 'stbImport.projectName')}: ${candidate.projectName}`}
                    </span>
                  ) : null}
                </div>

                {candidate.issues.length > 0 ? (
                  <section className={styles.group} data-testid="stb-import-issues">
                    <h4 className={styles.groupTitle}>
                      {t(locale, 'stbImport.issues')}
                    </h4>
                    <ul className={styles.issues}>
                      {[...new Set(candidate.issues)].map((issue) => (
                        <li key={issue}>{t(locale, `stbImport.issue.${issue}`)}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                <section className={styles.group}>
                  <h4 className={styles.groupTitle}>
                    {t(locale, 'stbImport.grids')}
                  </h4>
                  {candidate.grids.map((grid, index) => (
                    <GridCandidate
                      key={`${grid.direction}-${index}`}
                      candidate={grid}
                      locale={locale}
                    />
                  ))}
                  {hasGridCandidate ? (
                    <button
                      type="button"
                      className={styles.applyButton}
                      data-testid="stb-import-apply-grid"
                      onClick={applyGrid}
                    >
                      {t(locale, 'stbImport.applyGrid')}
                    </button>
                  ) : null}
                  {gridResult?.refusal === '部材あり通り芯置換不可' ? (
                    <label className={styles.discardOption}>
                      <input
                        type="checkbox"
                        data-testid="stb-import-discard-grid"
                        checked={discardGridMembers}
                        onChange={(event) =>
                          setDiscardGridMembers(event.target.checked)
                        }
                      />
                      {t(locale, 'stbImport.discardMembersGrid')}
                    </label>
                  ) : null}
                  <ApplyResult
                    result={gridResult}
                    locale={locale}
                    successKey="stbImport.appliedGrid"
                    count={candidate.grids.length}
                    testId="stb-import-grid-result"
                  />
                </section>

                <section className={styles.group} data-testid="stb-import-stories">
                  <h4 className={styles.groupTitle}>
                    {t(locale, 'stbImport.stories')}
                  </h4>
                  {candidate.stories.length > 0 ? (
                    <ul className={styles.storyList}>
                      {candidate.stories.map((story, index) => (
                        <li key={`${story.name}-${index}`}>
                          <span className={styles.axis}>{story.name}</span>
                          <span className={styles.span}>
                            {` — ${story.heightMm} ${t(locale, 'stbImport.height')} — `}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className={styles.muted}>{t(locale, 'stbImport.none')}</p>
                  )}
                  {hasStoryCandidate ? (
                    <button
                      type="button"
                      className={styles.applyButton}
                      data-testid="stb-import-apply-stories"
                      onClick={applyStories}
                    >
                      {t(locale, 'stbImport.applyStories')}
                    </button>
                  ) : null}
                  {storiesResult?.refusal === '部材あり階置換不可' ? (
                    <label className={styles.discardOption}>
                      <input
                        type="checkbox"
                        data-testid="stb-import-discard-stories"
                        checked={discardStoryMembers}
                        onChange={(event) =>
                          setDiscardStoryMembers(event.target.checked)
                        }
                      />
                      {t(locale, 'stbImport.discardMembersStories')}
                    </label>
                  ) : null}
                  <ApplyResult
                    result={storiesResult}
                    locale={locale}
                    successKey="stbImport.appliedStories"
                    count={candidate.stories.length}
                    testId="stb-import-stories-result"
                  />
                </section>

                <section className={styles.group} data-testid="stb-import-unsupported">
                  <h4 className={styles.groupTitle}>
                    {`${t(locale, 'stbImport.unsupported')} (${candidate.unsupported.length})`}
                  </h4>
                  {candidate.unsupported.length > 0 ? (
                    <ul className={styles.issues}>
                      {candidate.unsupported.map(({ name, count }, index) => (
                        <li key={`${name}-${index}`}>{`${name}: ${count}`}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className={styles.muted}>{t(locale, 'stbImport.none')}</p>
                  )}
                </section>
              </>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  )
}
