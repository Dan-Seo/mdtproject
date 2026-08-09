'use client'

import type { KeyboardEvent } from 'react'

import type {
  BarSize,
  ColumnSection,
  GirderSection,
  Section,
  SteelGrade,
} from '@/domain/model/member'
import type { Project } from '@/domain/model/project'
import { useAppStore } from '@/lib/store'

import styles from './SectionTable.module.css'

const barSizes: BarSize[] = [
  'D10',
  'D13',
  'D16',
  'D19',
  'D22',
  'D25',
  'D29',
  'D32',
]

const steelGrades: SteelGrade[] = ['SD295', 'SD345', 'SD390']

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

function positiveNumber(value: string): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange(value: number): void
}) {
  return (
    <input
      className={styles.numberInput}
      type="number"
      min="1"
      step="1"
      value={value}
      aria-label={label}
      onChange={(event) => {
        const next = positiveNumber(event.currentTarget.value)
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
        label={`${section.mark} 断面 b`}
        value={section.b}
        onChange={(b) => update((current) => ({ ...current, b }))}
      />
      <span aria-hidden="true">×</span>
      <NumberInput
        label={`${section.mark} 断面 ${secondLabel}`}
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
        label={`${section.mark} 主筋 本数`}
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
        label={`${section.mark} 主筋 径`}
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
        label={`${section.mark} 主筋 上 本数`}
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
        label={`${section.mark} 主筋 径`}
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
        label={`${section.mark} 主筋 下 本数`}
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
        label={`${section.mark} ${label} 径`}
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
        label={`${section.mark} ${label} ピッチ`}
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
    </div>
  )
}

export function SectionTable() {
  const project = useAppStore(({ project }) => project)
  const activeStoryId = useAppStore(({ activeStoryId }) => activeStoryId)
  const selectedMemberId = useAppStore(({ sel }) => sel.memberId)
  const selectMember = useAppStore(({ selectMember }) => selectMember)
  const updateProject = useAppStore(({ updateProject }) => updateProject)
  const selectedSectionId = project.members.find(
    ({ id }) => id === selectedMemberId,
  )?.sectionId

  const update = (
    sectionId: string,
    updater: (section: Section) => Section,
  ) => {
    updateProject((current) => replaceSection(current, sectionId, updater))
  }

  const selectSection = (sectionId: string) => {
    const representative =
      project.members.find(
        (member) =>
          member.storyId === activeStoryId && member.sectionId === sectionId,
      ) ?? project.members.find((member) => member.sectionId === sectionId)

    if (representative) selectMember(representative.id)
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
            <th scope="col">Fc</th>
            <th scope="col">grade</th>
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
                    aria-label={`${section.mark} 符号`}
                    onChange={(event) => {
                      const mark = event.currentTarget.value
                      updateCurrent((current) => ({ ...current, mark }))
                    }}
                  />
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
                  <NumberInput
                    label={`${section.mark} Fc`}
                    value={section.fc}
                    onChange={(fc) =>
                      updateCurrent((current) => ({ ...current, fc }))
                    }
                  />
                </td>
                <td>
                  <GradeSelect
                    label={`${section.mark} grade`}
                    value={section.grade}
                    onChange={(grade) =>
                      updateCurrent((current) => ({ ...current, grade }))
                    }
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
