'use client'

import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'

import {
  sectionMarkLabel,
  type ColumnSection,
  type GirderSection,
  type SlabSection,
  type Section,
  type WallSection,
} from '@/domain/model/member'
import type { Project } from '@/domain/model/project'
import { extractTextPages } from '@/lib/import/pdf-text'
import { parseSectionLists } from '@/lib/import/section-list/parse'
import type {
  ListIssue,
  ParsedSectionList,
  SectionCandidate,
  TextPage,
} from '@/lib/import/section-list/types'
import { t } from '@/lib/i18n'
import { useAppStore, type Locale } from '@/lib/store'

import styles from './SectionImport.module.css'

interface SectionImportProps {
  /** pdf.js 없이 TextPage 픽스처를 주입하는 컴포넌트 테스트용 경계. */
  initialPages?: TextPage[]
  extractPages?(file: File): Promise<TextPage[]>
}

interface CandidateRow {
  id: string
  candidate: SectionCandidate
}

function parsedCandidates(lists: ParsedSectionList[]): CandidateRow[] {
  return lists.flatMap((list, listIndex) =>
    list.candidates.map((candidate, candidateIndex) => ({
      id: `${listIndex}-${candidateIndex}`,
      candidate,
    })),
  )
}

/**
 * 階별 후보가 같은 Section을 덮어쓰면 먼저 반영한 층의 배근이 사라진다 — 매칭 키는
 * (符号, 部材, 階)다. 階를 符号에 붙이지는 않는다: 도면에 없는 符号이 内訳書에 그대로
 * 나가고, 内訳書는 이미 階별로 묶여 있어 階가 두 번 표시된다.
 */
type ImportableSection =
  | ColumnSection
  | GirderSection
  | WallSection
  | SlabSection

type SlabDirection = 'x' | 'y'

function isImportableSection(section: Section): section is ImportableSection {
  return (
    section.kind === '柱' ||
    section.kind === '大梁' ||
    section.kind === '耐震壁' ||
    section.kind === '床板'
  )
}

function matchingSection(
  project: Project,
  candidate: SectionCandidate,
): ImportableSection | undefined {
  if (candidate.kind === '対象外') return undefined
  return project.sections
    .filter(isImportableSection)
    .find(
      (section) =>
        section.mark === candidate.mark &&
        section.kind === candidate.kind &&
        section.storyLabel === candidate.storyLabel,
    )
}

function cloneSource(
  project: Project,
  candidate: SectionCandidate,
): ImportableSection | undefined {
  if (candidate.kind === '対象外') return undefined
  const sameKind = project.sections
    .filter(isImportableSection)
    .filter((section) => section.kind === candidate.kind)
  // 같은 符号의 다른 階가 이미 있으면 그쪽이 복제원이다 — 파싱하지 않는
  // fc·강종·노출·仕上げ·初期オフセット은 무관한 부재보다 같은 符号 쪽이 맞다
  return (
    sameKind.find((section) => section.mark === candidate.mark) ?? sameKind[0]
  )
}

/**
 * 신규 符号는 모든 배근·단면 칸이 파싱됐을 때만 반영을 허용한다 — 빈칸을 무관한
 * 부재의 복제값으로 채워 물량에 넣으면 파서가 지킨 「지어내지 않는다」(ADR-012)가
 * UI에서 무너진다. 기존 Section에는 빈칸이 기존값 유지라 해당하지 않는다.
 */
function missingParsedFields(
  candidate: SectionCandidate,
  slabDirection?: SlabDirection,
): boolean {
  if (candidate.kind === '柱') {
    return (
      candidate.b === undefined ||
      candidate.d === undefined ||
      candidate.main === undefined ||
      candidate.hoop === undefined
    )
  }
  if (candidate.kind === '大梁') {
    return (
      candidate.b === undefined ||
      candidate.depth === undefined ||
      candidate.girderMain === undefined ||
      candidate.stirrup === undefined
    )
  }
  if (candidate.kind === '耐震壁') {
    return (
      candidate.thickness === undefined ||
      candidate.layers === undefined ||
      candidate.vertical === undefined ||
      candidate.horizontal === undefined
    )
  }
  if (candidate.kind === '床板') {
    return (
      slabDirection === undefined ||
      candidate.thickness === undefined ||
      candidate.shortSide?.top === undefined ||
      candidate.shortSide?.bottom === undefined ||
      candidate.longSide?.top === undefined ||
      candidate.longSide?.bottom === undefined
    )
  }
  return true
}

function uniqueSectionId(project: Project, mark: string): string {
  const base = `section-${mark}`
  if (!project.sections.some(({ id }) => id === base)) return base

  let suffix = 2
  while (project.sections.some(({ id }) => id === `${base}-${suffix}`)) {
    suffix += 1
  }
  return `${base}-${suffix}`
}

function applyParsedFields(
  section: Section,
  candidate: SectionCandidate,
  slabDirection?: SlabDirection,
): Section {
  if (section.kind === '柱' && candidate.kind === '柱') {
    return {
      ...section,
      mark: candidate.mark,
      // 形状は寸法と一組で入る。「600φ」を b×d の枠に落とすと直径が辺長に
      // なって周長が変わる — 片方だけ反映しない (ADR-027)
      ...(candidate.shape === undefined ? {} : { shape: candidate.shape }),
      ...(candidate.b === undefined ? {} : { b: candidate.b }),
      ...(candidate.d === undefined ? {} : { d: candidate.d }),
      ...(candidate.main === undefined
        ? {}
        : { main: { ...section.main, ...candidate.main } }),
      ...(candidate.hoop === undefined
        ? {}
        : {
            hoop: {
              ...section.hoop,
              size: candidate.hoop.size,
              pitch: candidate.hoop.pitchMm,
            },
          }),
    }
  }

  if (section.kind === '大梁' && candidate.kind === '大梁') {
    return {
      ...section,
      mark: candidate.mark,
      ...(candidate.b === undefined ? {} : { b: candidate.b }),
      ...(candidate.depth === undefined ? {} : { depth: candidate.depth }),
      ...(candidate.girderMain === undefined
        ? {}
        : {
            main: {
              ...section.main,
              size: candidate.girderMain.size,
              // 端部欄を持つ表だけが端部の本数を別に寄こす。持たない表は全長で
              // 同じ本数なので中央の値をそのまま端部にも入れる。左右で端部が
              // 違う表は取り込まない — parse.ts が 主筋端部左右相違 で空欄に
              // 残す (ADR-021)。
              top: {
                endCount:
                  candidate.girderMain.endTopCount ??
                  candidate.girderMain.topCount,
                centerCount: candidate.girderMain.topCount,
              },
              bottom: {
                endCount:
                  candidate.girderMain.endBottomCount ??
                  candidate.girderMain.bottomCount,
                centerCount: candidate.girderMain.bottomCount,
              },
            },
          }),
      ...(candidate.stirrup === undefined
        ? {}
        : {
            stirrup: {
              ...section.stirrup,
              size: candidate.stirrup.size,
              pitch: candidate.stirrup.pitchMm,
            },
          }),
      ...(candidate.sideBar === undefined
        ? {}
        : {
            sideBar: {
              size: candidate.sideBar.size,
              count: candidate.sideBar.count,
              // 腹筋の余長は図面にも標準仕様書5章にもなく、1通則6) が委ねる
              // JASS 5 も有料・未確保である。0 は規準値ではなく未入力状態で、
              // 既存値があれば利用者の入力として保つ (R9②)。SectionTable の
              // extraLengthMm ?? 0 と同じ扱いである。
              extraLengthMm: section.sideBar?.extraLengthMm ?? 0,
            },
          }),
      ...(candidate.widthTie === undefined
        ? {}
        : {
            widthTie: {
              size: candidate.widthTie.size,
              pitch: candidate.widthTie.pitchMm,
            },
          }),
    }
  }

  if (section.kind === '耐震壁' && candidate.kind === '耐震壁') {
    return {
      ...section,
      mark: candidate.mark,
      ...(candidate.thickness === undefined
        ? {}
        : { thickness: candidate.thickness }),
      ...(candidate.layers === undefined ? {} : { layers: candidate.layers }),
      ...(candidate.vertical === undefined
        ? {}
        : {
            vertical: {
              ...section.vertical,
              size: candidate.vertical.size,
              pitch: candidate.vertical.pitchMm,
            },
          }),
      ...(candidate.horizontal === undefined
        ? {}
        : {
            horizontal: {
              ...section.horizontal,
              size: candidate.horizontal.size,
              pitch: candidate.horizontal.pitchMm,
            },
          }),
    }
  }

  if (section.kind === '床板' && candidate.kind === '床板') {
    if (slabDirection === undefined) return section

    const xSource =
      slabDirection === 'x' ? candidate.shortSide : candidate.longSide
    const ySource =
      slabDirection === 'x' ? candidate.longSide : candidate.shortSide

    return {
      ...section,
      mark: candidate.mark,
      ...(candidate.thickness === undefined
        ? {}
        : { thickness: candidate.thickness }),
      x: {
        ...section.x,
        ...(xSource?.top === undefined
          ? {}
          : {
              top: {
                ...section.x.top,
                size: xSource.top.size,
                pitch: xSource.top.pitchMm,
              },
            }),
        ...(xSource?.bottom === undefined
          ? {}
          : {
              bottom: {
                ...section.x.bottom,
                size: xSource.bottom.size,
                pitch: xSource.bottom.pitchMm,
              },
            }),
      },
      y: {
        ...section.y,
        ...(ySource?.top === undefined
          ? {}
          : {
              top: {
                ...section.y.top,
                size: ySource.top.size,
                pitch: ySource.top.pitchMm,
              },
            }),
        ...(ySource?.bottom === undefined
          ? {}
          : {
              bottom: {
                ...section.y.bottom,
                size: ySource.bottom.size,
                pitch: ySource.bottom.pitchMm,
              },
            }),
      },
    }
  }

  return section
}

/** 複製元의 階 표기가 후보에 딸려오지 않게 한다 — 階의 근거는 후보 쪽뿐이다. */
function withCandidateStory(
  section: Section,
  candidate: SectionCandidate,
): Section {
  const next = { ...section }
  if (candidate.storyLabel === undefined) delete next.storyLabel
  else next.storyLabel = candidate.storyLabel
  return next
}

function applyCandidate(
  project: Project,
  candidate: SectionCandidate,
  slabDirection?: SlabDirection,
): Project {
  if (candidate.kind === '対象外') return project
  if (candidate.kind === '床板' && slabDirection === undefined) return project

  const existing = matchingSection(project, candidate)
  if (existing) {
    return {
      ...project,
      sections: project.sections.map((section) =>
        section.id === existing.id
          ? applyParsedFields(section, candidate, slabDirection)
          : section,
      ),
    }
  }

  const source = cloneSource(project, candidate)
  if (!source || missingParsedFields(candidate, slabDirection)) return project
  // id는 사람이 읽는 값이 아니라 충돌만 피하면 된다 — 階를 섞어 먼저 좁힌다
  const id = uniqueSectionId(
    project,
    candidate.storyLabel
      ? `${candidate.mark}-${candidate.storyLabel}`
      : candidate.mark,
  )
  const clonedSource: ImportableSection =
    source.kind === '柱'
      ? { ...source, id, main: { ...source.main }, hoop: { ...source.hoop } }
      : source.kind === '大梁'
        ? {
            ...source,
            id,
            main: { ...source.main },
            stirrup: { ...source.stirrup },
          }
        : source.kind === '耐震壁'
          ? {
              ...source,
              id,
              vertical: { ...source.vertical },
              horizontal: { ...source.horizontal },
            }
          : {
              ...source,
              id,
              x: {
                top: { ...source.x.top },
                bottom: { ...source.x.bottom },
              },
              y: {
                top: { ...source.y.top },
                bottom: { ...source.y.bottom },
              },
            }
  const cloned = withCandidateStory(
    applyParsedFields(clonedSource, candidate, slabDirection),
    candidate,
  )

  return { ...project, sections: [...project.sections, cloned] }
}

function sectionSummary(section: ImportableSection): string {
  if (section.kind === '柱') {
    const dimension =
      section.shape === '円形' ? `${section.b}φ` : `${section.b}×${section.d}`
    return `${sectionMarkLabel(section)} / ${dimension} / ${section.main.count}-${section.main.size} / ${section.hoop.size}@${section.hoop.pitch}`
  }
  if (section.kind === '大梁') {
    const { top, bottom } = section.main
    return `${sectionMarkLabel(section)} / ${section.b}×${section.depth} / 上${top.endCount}／${top.centerCount}・下${bottom.endCount}／${bottom.centerCount}-${section.main.size} / ${section.stirrup.size}@${section.stirrup.pitch}`
  }
  if (section.kind === '耐震壁') {
    return `${sectionMarkLabel(section)} / 壁厚${section.thickness} / ${section.layers}層 / 縦筋 ${section.vertical.size}@${section.vertical.pitch} / 横筋 ${section.horizontal.size}@${section.horizontal.pitch}`
  }
  return `${sectionMarkLabel(section)} / 板厚${section.thickness} / X 上${section.x.top.size}@${section.x.top.pitch}・下${section.x.bottom.size}@${section.x.bottom.pitch} / Y 上${section.y.top.size}@${section.y.top.pitch}・下${section.y.bottom.size}@${section.y.bottom.pitch}`
}

function candidateFields(candidate: SectionCandidate, locale: Locale): string[] {
  const fields: string[] = []
  if (candidate.shape === '円形' && candidate.b !== undefined) {
    fields.push(`断面 ${candidate.b}φ`)
  } else if (candidate.b !== undefined && candidate.d !== undefined) {
    fields.push(`断面 ${candidate.b}×${candidate.d}`)
  } else if (candidate.b !== undefined && candidate.depth !== undefined) {
    fields.push(`断面 ${candidate.b}×${candidate.depth}`)
  }
  if (candidate.main) {
    fields.push(`主筋 ${candidate.main.count}-${candidate.main.size}`)
  }
  if (candidate.hoop) {
    fields.push(`帯筋 ${candidate.hoop.size}@${candidate.hoop.pitchMm}`)
  }
  if (candidate.girderMain) {
    const { topCount, bottomCount, size, endTopCount, endBottomCount } =
      candidate.girderMain
    fields.push(`主筋 上${topCount}・下${bottomCount}-${size}`)
    if (endTopCount !== undefined || endBottomCount !== undefined) {
      fields.push(
        `端部 上${endTopCount ?? topCount}・下${endBottomCount ?? bottomCount}`,
      )
    }
  }
  if (candidate.stirrup) {
    fields.push(
      `あばら筋 ${candidate.stirrup.size}@${candidate.stirrup.pitchMm}`,
    )
  }
  if (candidate.sideBar) {
    fields.push(
      `${t(locale, 'sectionImport.field.sideBar')} ${candidate.sideBar.count}-${candidate.sideBar.size}`,
    )
  }
  if (candidate.widthTie) {
    fields.push(
      `${t(locale, 'sectionImport.field.widthTie')} ${candidate.widthTie.size}@${candidate.widthTie.pitchMm}`,
    )
  }
  if (candidate.kind === '耐震壁') {
    if (candidate.thickness !== undefined) {
      fields.push(`壁厚 ${candidate.thickness}`)
    }
    if (candidate.layers !== undefined) fields.push(`配筋 ${candidate.layers}層`)
    if (candidate.vertical) {
      fields.push(`縦筋 ${candidate.vertical.size}@${candidate.vertical.pitchMm}`)
    }
    if (candidate.horizontal) {
      fields.push(
        `横筋 ${candidate.horizontal.size}@${candidate.horizontal.pitchMm}`,
      )
    }
  }
  if (candidate.kind === '床板') {
    if (candidate.thickness !== undefined) {
      fields.push(`板厚 ${candidate.thickness}`)
    }
    for (const [label, side] of [
      ['短辺', candidate.shortSide],
      ['長辺', candidate.longSide],
    ] as const) {
      if (side?.top) fields.push(`${label}上 ${side.top.size}@${side.top.pitchMm}`)
      if (side?.bottom) {
        fields.push(`${label}下 ${side.bottom.size}@${side.bottom.pitchMm}`)
      }
    }
  }
  return fields
}

function cloneSourceSummary(source: ImportableSection): string {
  const offset =
    source.kind === '柱'
      ? source.hoop.startOffsetMm
      : source.kind === '大梁'
        ? source.stirrup.startOffsetMm
        : source.kind === '耐震壁'
          ? source.vertical.startOffsetMm
          : source.x.top.startOffsetMm
  const exposure = source.kind === '床板' ? '' : `${source.exposure}/`
  return `fc${source.fc}・${source.grade}・${exposure}${source.finish}・初期オフセット${offset}mm`
}

function Candidate({
  row,
  ignored,
  slabDirection,
  onIgnore,
  onSlabDirectionChange,
  onApply,
}: {
  row: CandidateRow
  ignored: boolean
  slabDirection?: SlabDirection
  onIgnore(): void
  onSlabDirectionChange(direction: SlabDirection | undefined): void
  onApply(): void
}) {
  const { candidate } = row
  const project = useAppStore(({ project }) => project)
  const locale = useAppStore(({ locale }) => locale)
  const existing = matchingSection(project, candidate)
  const source = existing ? undefined : cloneSource(project, candidate)
  const incomplete = !existing && missingParsedFields(candidate, slabDirection)
  const directionMissing =
    candidate.kind === '床板' && slabDirection === undefined
  const story = candidate.storyLabel ?? t(locale, 'sectionImport.noStory')
  // 파서는 이슈 코드만 싣는다 — 문장은 여기서 locale로 푼다
  const issueMessages = candidate.issues.map((issue) =>
    t(locale, `sectionImport.issue.${issue}`),
  )
  const issueText = issueMessages.join('\n')

  return (
    <li
      className={styles.candidate}
      data-testid={`section-import-candidate-${candidate.mark}-${candidate.storyLabel ?? 'none'}`}
      hidden={ignored}
    >
      <div className={styles.candidateHeading}>
        <strong>{candidate.mark}</strong>
        <span>{story}</span>
      </div>
      <dl className={styles.diff}>
        <div>
          <dt>{t(locale, 'sectionImport.current')}</dt>
          <dd>
            {existing
              ? sectionSummary(existing)
              : t(locale, 'sectionImport.new')}
          </dd>
        </div>
        <div>
          <dt>{t(locale, 'sectionImport.parsed')}</dt>
          <dd>{candidateFields(candidate, locale).join(' / ') || '—'}</dd>
        </div>
      </dl>
      {Object.keys(candidate.raw).length > 0 ? (
        <div className={styles.raw} title={issueText || undefined}>
          {Object.entries(candidate.raw).map(([label, value]) => (
            <span key={label}>
              {label}: {value}
            </span>
          ))}
        </div>
      ) : null}
      {issueMessages.length > 0 ? (
        <ul className={styles.issues}>
          {issueMessages.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : null}
      {!existing && source && incomplete ? (
        <p className={styles.cloneNotice}>
          {t(locale, 'sectionImport.incomplete')}
        </p>
      ) : null}
      {!existing && source && !incomplete ? (
        <>
          <p className={styles.cloneNotice}>
            {t(locale, 'sectionImport.clonePrefix')}
            {sectionMarkLabel(source)}
            {`（${cloneSourceSummary(source)}）`}
            {t(locale, 'sectionImport.cloneSuffix')}
          </p>
          <p className={styles.cloneNotice}>
            {t(locale, 'sectionImport.newSectionUnassigned')}
          </p>
        </>
      ) : null}
      {candidate.kind === '床板' ? (
        <div className={styles.directionChoice}>
          <label htmlFor={`section-import-slab-direction-${row.id}`}>
            {t(locale, 'sectionImport.slabDirection')}
          </label>
          <select
            id={`section-import-slab-direction-${row.id}`}
            data-testid={`section-import-slab-direction-${candidate.mark}`}
            value={slabDirection ?? ''}
            onChange={(event) => {
              const value = event.currentTarget.value
              onSlabDirectionChange(value === 'x' || value === 'y' ? value : undefined)
            }}
          >
            <option value="">
              {t(locale, 'sectionImport.slabDirectionPlaceholder')}
            </option>
            <option value="x">
              {t(locale, 'sectionImport.slabDirection.shortToX')}
            </option>
            <option value="y">
              {t(locale, 'sectionImport.slabDirection.shortToY')}
            </option>
          </select>
        </div>
      ) : null}
      <div className={styles.rowActions}>
        <button
          type="button"
          className={styles.applyButton}
          disabled={
            directionMissing || (!existing && (!source || incomplete))
          }
          onClick={onApply}
        >
          {t(locale, 'sectionImport.apply')}
        </button>
        <button type="button" className={styles.ignoreButton} onClick={onIgnore}>
          {t(locale, 'sectionImport.ignore')}
        </button>
      </div>
    </li>
  )
}

export function SectionImport({
  initialPages,
  extractPages = extractTextPages,
}: SectionImportProps) {
  const locale = useAppStore(({ locale }) => locale)
  const updateProject = useAppStore(({ updateProject }) => updateProject)
  const inputRef = useRef<HTMLInputElement>(null)
  const [pages, setPages] = useState<TextPage[] | null>(initialPages ?? null)
  const [open, setOpen] = useState(initialPages !== undefined)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [ignored, setIgnored] = useState<Set<string>>(() => new Set())
  const [slabDirections, setSlabDirections] = useState<
    Record<string, SlabDirection>
  >({})
  // 연속 선택 시 늦게 끝난 이전 파일의 결과가 최신 결과를 덮지 않게 한다
  const requestRef = useRef(0)
  const lists = useMemo(
    () => (pages ?? []).flatMap((page) => parseSectionLists(page)),
    [pages],
  )
  const rows = useMemo(() => parsedCandidates(lists), [lists])
  // 사유별로 어느 리스트가 걸렸는지 묶는다 — 후보가 하나라도 있으면 실패한 표가
  // 화면에서 사라지던 문제를 막으려면 이 안내가 후보 목록과 함께 늘 보여야 한다
  const listIssues = useMemo(() => {
    const grouped = new Map<ListIssue, string[]>()
    for (const { issue, listKind } of lists) {
      if (issue === undefined) continue
      const kinds = grouped.get(issue) ?? []
      if (!kinds.includes(listKind)) kinds.push(listKind)
      grouped.set(issue, kinds)
    }
    return [...grouped]
  }, [lists])
  const supported = rows.filter(({ candidate }) => candidate.kind !== '対象外')
  const outOfScope = rows.filter(({ candidate }) => candidate.kind === '対象外')

  const selectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return

    const requestId = ++requestRef.current
    setOpen(true)
    setLoading(true)
    setFailed(false)
    setIgnored(new Set())
    setSlabDirections({})
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
        {t(locale, 'sectionImport.open')}
      </button>
      <input
        ref={inputRef}
        className={styles.fileInput}
        data-testid="section-import-file"
        type="file"
        accept="application/pdf"
        aria-label={t(locale, 'sectionImport.file')}
        onChange={(event) => void selectFile(event)}
      />
      {open ? (
        <section
          className={styles.panel}
          role="dialog"
          aria-modal="false"
          aria-labelledby="section-import-title"
        >
          <header className={styles.panelHeader}>
            <h3 id="section-import-title">
              {t(locale, 'sectionImport.title')}
            </h3>
            <div className={styles.panelActions}>
              <button
                type="button"
                className={styles.chooseButton}
                onClick={() => inputRef.current?.click()}
              >
                {t(locale, 'sectionImport.chooseAnother')}
              </button>
              <button
                type="button"
                className={styles.closeButton}
                onClick={() => setOpen(false)}
              >
                {t(locale, 'sectionImport.close')}
              </button>
            </div>
          </header>
          <div className={styles.panelBody}>
            {loading ? (
              <p role="status">{t(locale, 'sectionImport.loading')}</p>
            ) : failed ? (
              <p role="alert">{t(locale, 'sectionImport.error')}</p>
            ) : pages && rows.length === 0 && listIssues.length === 0 ? (
              <p>{t(locale, 'sectionImport.empty')}</p>
            ) : (
              <>
                {listIssues.map(([issue, kinds]) => (
                  <p key={issue} className={styles.listIssue}>
                    {`${t(locale, `sectionImport.listIssue.${issue}`)}（${kinds.join('・')}）`}
                  </p>
                ))}
                <ul className={styles.candidateList}>
                  {supported.map((row) => (
                    <Candidate
                      key={row.id}
                      row={row}
                      ignored={ignored.has(row.id)}
                      slabDirection={slabDirections[row.id]}
                      onIgnore={() =>
                        setIgnored((current) => new Set(current).add(row.id))
                      }
                      onSlabDirectionChange={(direction) =>
                        setSlabDirections((current) => {
                          const next = { ...current }
                          if (direction === undefined) delete next[row.id]
                          else next[row.id] = direction
                          return next
                        })
                      }
                      onApply={() =>
                        updateProject((project) =>
                          applyCandidate(
                            project,
                            row.candidate,
                            slabDirections[row.id],
                          ),
                        )
                      }
                    />
                  ))}
                </ul>
                {outOfScope.length > 0 ? (
                  <details
                    className={styles.outOfScope}
                    data-testid="section-import-out-of-scope"
                  >
                    <summary>
                      {t(locale, 'sectionImport.outOfScope')} ({outOfScope.length})
                    </summary>
                    <ul className={styles.candidateList}>
                      {outOfScope.map((row) => (
                        <li
                          key={row.id}
                          className={styles.candidate}
                          data-testid={`section-import-candidate-${row.candidate.mark}-${row.candidate.storyLabel ?? 'none'}`}
                        >
                          <div className={styles.candidateHeading}>
                            <strong>{row.candidate.mark}</strong>
                            <span>
                              {row.candidate.storyLabel ??
                                t(locale, 'sectionImport.noStory')}
                            </span>
                          </div>
                          <p>
                            {candidateFields(row.candidate, locale).join(' / ') ||
                              '—'}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </>
            )}
          </div>
        </section>
      ) : null}
    </div>
  )
}
