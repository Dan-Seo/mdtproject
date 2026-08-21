'use client'

import { useRef, type KeyboardEvent } from 'react'

import {
  BAR_SIZES,
  sectionMarkLabel,
  type BarSize,
  type ColumnSection,
  type Exposure,
  type Finish,
  type GirderSection,
  type Section,
  type SteelGrade,
} from '@/domain/model/member'
import type { Project } from '@/domain/model/project'
import { useAppStore } from '@/lib/store'
import { capture } from '@/lib/telemetry'

import styles from './SectionTable.module.css'

const barSizes: readonly BarSize[] = BAR_SIZES

const steelGrades: SteelGrade[] = ['SD295', 'SD345', 'SD390']

const exposures: Exposure[] = ['屋内', '屋外']

const finishes: Finish[] = ['仕上げあり', '仕上げなし']

function replaceSection(
  project: Project,
  sectionId: string,
  updater: (section: Section) => Section,
): Project {
  return {
    ...project,
    sections: project.sections.map((section) =>
      section.id === sectionId ? updater(section) : section,
    ),
  }
}

function boundedNumber(value: string, minimum: number): number | null {
  // Number('')는 0이다 — 하한이 0인 필드에서 빈 값이 통과하면 지우는 순간
  // 本数(=물량)가 0 오프셋으로 덮인다.
  if (value.trim() === '') return null

  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : null
}

function NumberInput({
  label,
  value,
  onChange,
  // 치수·ピッチ·本数는 0이 성립하지 않지만 初期オフセット은 0이 정상값이다.
  minimum = 1,
}: {
  label: string
  value: number
  onChange(value: number): void
  minimum?: number
}) {
  return (
    <input
      className={styles.numberInput}
      type="number"
      min={minimum}
      step="1"
      value={value}
      aria-label={label}
      onChange={(event) => {
        const next = boundedNumber(event.currentTarget.value, minimum)
        if (next !== null) onChange(next)
      }}
    />
  )
}

function BarSizeSelect({
  label,
  value,
  onChange,
}: {
  label: string
  value: BarSize
  onChange(value: BarSize): void
}) {
  return (
    <select
      className={styles.select}
      value={value}
      aria-label={label}
      onChange={(event) => onChange(event.currentTarget.value as BarSize)}
    >
      {barSizes.map((size) => (
        <option key={size} value={size}>
          {size}
        </option>
      ))}
    </select>
  )
}

/**
 * 幅止め筋·腹筋은 断面一覧에 없으면 그 배근이 없는 것이다 — 「なし」를 고르면
 * 필드 자체를 지운다. 제품이 있는 셈 치고 계상하지 않는다 (ADR-012).
 */
function OptionalBarSizeSelect({
  label,
  value,
  onChange,
}: {
  label: string
  value: BarSize | null
  onChange(value: BarSize | null): void
}) {
  return (
    <select
      className={styles.select}
      value={value ?? ''}
      aria-label={label}
      onChange={(event) => {
        const next = event.currentTarget.value
        onChange(next === '' ? null : (next as BarSize))
      }}
    >
      <option value="">なし</option>
      {barSizes.map((size) => (
        <option key={size} value={size}>
          {size}
        </option>
      ))}
    </select>
  )
}

function GradeSelect({
  label,
  value,
  onChange,
}: {
  label: string
  value: SteelGrade
  onChange(value: SteelGrade): void
}) {
  return (
    <select
      className={styles.select}
      value={value}
      aria-label={label}
      onChange={(event) => onChange(event.currentTarget.value as SteelGrade)}
    >
      {steelGrades.map((grade) => (
        <option key={grade} value={grade}>
          {grade}
        </option>
      ))}
    </select>
  )
}

function CoverConditionField({
  section,
  update,
}: {
  section: Section
  update(updater: (section: Section) => Section): void
}) {
  return (
    <div className={styles.compoundField}>
      <select
        className={styles.select}
        value={section.exposure}
        aria-label={`${sectionMarkLabel(section)} 屋内外`}
        onChange={(event) => {
          const exposure = event.currentTarget.value as Exposure
          update((current) => ({ ...current, exposure }))
        }}
      >
        {exposures.map((exposure) => (
          <option key={exposure} value={exposure}>
            {exposure}
          </option>
        ))}
      </select>
      <select
        className={styles.select}
        value={section.finish}
        aria-label={`${sectionMarkLabel(section)} 仕上げ`}
        onChange={(event) => {
          const finish = event.currentTarget.value as Finish
          update((current) => ({ ...current, finish }))
        }}
      >
        {finishes.map((finish) => (
          <option key={finish} value={finish}>
            {finish}
          </option>
        ))}
      </select>
    </div>
  )
}

function SectionDimension({
  section,
  update,
}: {
  section: Section
  update(updater: (section: Section) => Section): void
}) {
  const secondValue = section.kind === '柱' ? section.d : section.depth
  const secondLabel = section.kind === '柱' ? 'd' : 'せい'

  return (
    <div className={styles.compoundField}>
      <NumberInput
        label={`${sectionMarkLabel(section)} 断面 b`}
        value={section.b}
        onChange={(b) => update((current) => ({ ...current, b }))}
      />
      <span aria-hidden="true">×</span>
      <NumberInput
        label={`${sectionMarkLabel(section)} 断面 ${secondLabel}`}
        value={secondValue}
        onChange={(value) =>
          update((current) =>
            current.kind === '柱'
              ? { ...current, d: value }
              : { ...current, depth: value },
          )
        }
      />
    </div>
  )
}

function ColumnMainField({
  section,
  update,
}: {
  section: ColumnSection
  update(updater: (section: Section) => Section): void
}) {
  return (
    <div className={styles.compoundField}>
      <NumberInput
        label={`${sectionMarkLabel(section)} 主筋 本数`}
        value={section.main.count}
        onChange={(count) =>
          update((current) => {
            if (current.kind !== '柱') return current
            return { ...current, main: { ...current.main, count } }
          })
        }
      />
      <span aria-hidden="true">−</span>
      <BarSizeSelect
        label={`${sectionMarkLabel(section)} 主筋 径`}
        value={section.main.size}
        onChange={(size) =>
          update((current) => {
            if (current.kind !== '柱') return current
            return { ...current, main: { ...current.main, size } }
          })
        }
      />
    </div>
  )
}

function GirderMainField({
  section,
  update,
}: {
  section: GirderSection
  update(updater: (section: Section) => Section): void
}) {
  return (
    <div className={styles.girderMainField}>
      <span>上</span>
      <NumberInput
        label={`${sectionMarkLabel(section)} 主筋 上 本数`}
        value={section.main.topCount}
        onChange={(topCount) =>
          update((current) => {
            if (current.kind !== '大梁') return current
            return { ...current, main: { ...current.main, topCount } }
          })
        }
      />
      <span>−</span>
      <BarSizeSelect
        label={`${sectionMarkLabel(section)} 主筋 径`}
        value={section.main.size}
        onChange={(size) =>
          update((current) => {
            if (current.kind !== '大梁') return current
            return { ...current, main: { ...current.main, size } }
          })
        }
      />
      <span>下</span>
      <NumberInput
        label={`${sectionMarkLabel(section)} 主筋 下 本数`}
        value={section.main.bottomCount}
        onChange={(bottomCount) =>
          update((current) => {
            if (current.kind !== '大梁') return current
            return {
              ...current,
              main: { ...current.main, bottomCount },
            }
          })
        }
      />
    </div>
  )
}

function ShearField({
  section,
  update,
}: {
  section: Section
  update(updater: (section: Section) => Section): void
}) {
  const reinforcement = section.kind === '柱' ? section.hoop : section.stirrup
  const label = section.kind === '柱' ? '帯筋' : 'あばら筋'

  return (
    <div className={styles.compoundField}>
      <BarSizeSelect
        label={`${sectionMarkLabel(section)} ${label} 径`}
        value={reinforcement.size}
        onChange={(size) =>
          update((current) =>
            current.kind === '柱'
              ? { ...current, hoop: { ...current.hoop, size } }
              : { ...current, stirrup: { ...current.stirrup, size } },
          )
        }
      />
      <span aria-hidden="true">@</span>
      <NumberInput
        label={`${sectionMarkLabel(section)} ${label} ピッチ`}
        value={reinforcement.pitch}
        onChange={(pitch) =>
          update((current) =>
            current.kind === '柱'
              ? { ...current, hoop: { ...current.hoop, pitch } }
              : {
                  ...current,
                  stirrup: { ...current.stirrup, pitch },
                },
          )
        }
      />
      <NumberInput
        label={`${sectionMarkLabel(section)} ${label} 初期オフセット`}
        minimum={0}
        value={reinforcement.startOffsetMm}
        onChange={(startOffsetMm) =>
          update((current) =>
            current.kind === '柱'
              ? { ...current, hoop: { ...current.hoop, startOffsetMm } }
              : {
                  ...current,
                  stirrup: { ...current.stirrup, startOffsetMm },
                },
          )
        }
      />
    </div>
  )
}

/**
 * M3c の日本固有詳細 — 幅止め筋と腹筋。どちらも大梁だけに置く。
 * 幅止め筋を挙げる数量積算基準 1通則3) の部材は基礎梁・梁・壁梁・壁で柱を含まず、
 * 腹筋を扱う 2（３）梁3) も梁の条項だからである。
 */
function GirderDetailField({
  section,
  update,
}: {
  section: GirderSection
  update(updater: (section: Section) => Section): void
}) {
  const { widthTie, sideBar } = section

  return (
    <div className={styles.girderDetailField}>
      <span>幅止</span>
      <OptionalBarSizeSelect
        label={`${sectionMarkLabel(section)} 幅止め筋 径`}
        value={widthTie?.size ?? null}
        onChange={(size) =>
          update((current) => {
            if (current.kind !== '大梁') return current
            if (size === null) {
              const next = { ...current }
              delete next.widthTie
              return next
            }
            return {
              ...current,
              // ピッチの種は利用者自身が入れたあばら筋ピッチを借りる — 規準に
              // 幅止め筋のピッチはなく、製品が数字を作らない。
              widthTie: {
                size,
                pitch: current.widthTie?.pitch ?? current.stirrup.pitch,
              },
            }
          })
        }
      />
      <span aria-hidden="true">@</span>
      <NumberInput
        label={`${sectionMarkLabel(section)} 幅止め筋 ピッチ`}
        value={widthTie?.pitch ?? section.stirrup.pitch}
        onChange={(pitch) =>
          update((current) =>
            current.kind !== '大梁' || current.widthTie === undefined
              ? current
              : { ...current, widthTie: { ...current.widthTie, pitch } },
          )
        }
      />
      <span>腹筋</span>
      <OptionalBarSizeSelect
        label={`${sectionMarkLabel(section)} 腹筋 径`}
        value={sideBar?.size ?? null}
        onChange={(size) =>
          update((current) => {
            if (current.kind !== '大梁') return current
            if (size === null) {
              const next = { ...current }
              delete next.sideBar
              return next
            }
            return {
              ...current,
              // 本数の種は両側面に1本ずつの2本。余長は 0 —
              // JASS 5 が未確保で規準値がないので、入れないかぎり計上しない (R9②)。
              sideBar: current.sideBar ?? {
                size,
                count: 2,
                extraLengthMm: 0,
              },
            }
          })
        }
      />
      <span aria-hidden="true">×</span>
      <NumberInput
        label={`${sectionMarkLabel(section)} 腹筋 本数`}
        value={sideBar?.count ?? 2}
        onChange={(count) =>
          update((current) =>
            current.kind !== '大梁' || current.sideBar === undefined
              ? current
              : { ...current, sideBar: { ...current.sideBar, count } },
          )
        }
      />
      <span>余長</span>
      <NumberInput
        label={`${sectionMarkLabel(section)} 腹筋 余長`}
        minimum={0}
        value={sideBar?.extraLengthMm ?? 0}
        onChange={(extraLengthMm) =>
          update((current) =>
            current.kind !== '大梁' || current.sideBar === undefined
              ? current
              : {
                  ...current,
                  sideBar: { ...current.sideBar, extraLengthMm },
                },
          )
        }
      />
    </div>
  )
}

export function SectionTable() {
  const project = useAppStore(({ project }) => project)
  const activeStoryId = useAppStore(({ activeStoryId }) => activeStoryId)
  const selectedMemberId = useAppStore(({ sel }) => sel.memberId)
  const selectMember = useAppStore(({ selectMember }) => selectMember)
  const updateProject = useAppStore(({ updateProject }) => updateProject)
  const sectionEditReported = useRef(false)
  const selectedSectionId = project.members.find(
    ({ id }) => id === selectedMemberId,
  )?.sectionId

  const update = (
    sectionId: string,
    updater: (section: Section) => Section,
  ) => {
    updateProject((current) => replaceSection(current, sectionId, updater))

    // onChange는 키 입력마다 들어온다. 알고 싶은 것은 편집 횟수가 아니라 "이 세션에서
    // 断面表를 손댔는가"(열람 → 편집 → 내보내기 퍼널의 가운데 칸)이므로 한 번으로 합친다.
    if (sectionEditReported.current) return
    sectionEditReported.current = true
    capture('section_edited')
  }

  const selectSection = (sectionId: string) => {
    const representative =
      project.members.find(
        (member) =>
          member.storyId === activeStoryId && member.sectionId === sectionId,
      ) ?? project.members.find((member) => member.sectionId === sectionId)

    if (!representative) return

    // 행 안의 입력칸을 클릭해 편집만 해도 onClick이 버블링돼 여기로 다시
    // 들어온다. 이미 그 부재가 선택돼 있으면 다시 세지 않는다.
    const changed = representative.id !== selectedMemberId
    selectMember(representative.id)
    if (changed) capture('member_selected', { source: 'section' })
  }

  const activateRow = (
    event: KeyboardEvent<HTMLTableRowElement>,
    sectionId: string,
  ) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    selectSection(sectionId)
  }

  return (
    <div className={styles.tableFrame}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">符号</th>
            <th scope="col">断面</th>
            <th scope="col">主筋</th>
            <th scope="col">帯筋 / あばら筋</th>
            <th scope="col">幅止め筋 / 腹筋</th>
            <th scope="col">Fc</th>
            <th scope="col">grade</th>
            <th scope="col">かぶり条件</th>
          </tr>
        </thead>
        <tbody>
          {project.sections.map((section) => {
            const selected = selectedSectionId === section.id
            const updateCurrent = (updater: (current: Section) => Section) =>
              update(section.id, updater)

            return (
              <tr
                key={section.id}
                className={selected ? styles.selectedRow : undefined}
                data-testid={`section-row-${section.id}`}
                tabIndex={0}
                aria-selected={selected}
                onClick={() => selectSection(section.id)}
                onKeyDown={(event) => activateRow(event, section.id)}
              >
                <td>
                  <input
                    className={styles.markInput}
                    value={section.mark}
                    aria-label={`${sectionMarkLabel(section)} 符号`}
                    onChange={(event) => {
                      const mark = event.currentTarget.value
                      updateCurrent((current) => ({ ...current, mark }))
                    }}
                  />
                  {section.storyLabel ? (
                    <span className={styles.storyLabel}>
                      {section.storyLabel}
                    </span>
                  ) : null}
                </td>
                <td>
                  <SectionDimension section={section} update={updateCurrent} />
                </td>
                <td>
                  {section.kind === '柱' ? (
                    <ColumnMainField
                      section={section}
                      update={updateCurrent}
                    />
                  ) : (
                    <GirderMainField
                      section={section}
                      update={updateCurrent}
                    />
                  )}
                </td>
                <td>
                  <ShearField section={section} update={updateCurrent} />
                </td>
                <td>
                  {section.kind === '大梁' ? (
                    <GirderDetailField
                      section={section}
                      update={updateCurrent}
                    />
                  ) : (
                    // 柱には置かない配筋なので、空欄ではなく「対象外」と示す。
                    <span className={styles.notApplicable}>—</span>
                  )}
                </td>
                <td>
                  <NumberInput
                    label={`${sectionMarkLabel(section)} Fc`}
                    value={section.fc}
                    onChange={(fc) =>
                      updateCurrent((current) => ({ ...current, fc }))
                    }
                  />
                </td>
                <td>
                  <GradeSelect
                    label={`${sectionMarkLabel(section)} grade`}
                    value={section.grade}
                    onChange={(grade) =>
                      updateCurrent((current) => ({ ...current, grade }))
                    }
                  />
                </td>
                <td>
                  <CoverConditionField
                    section={section}
                    update={updateCurrent}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
