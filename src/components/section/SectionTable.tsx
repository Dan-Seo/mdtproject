'use client'

import { useRef, type KeyboardEvent } from 'react'

import {
  BAR_SIZES,
  SHEAR_BAR_SIZES,
  SPLICE_METHODS,
  sectionMarkLabel,
  type BarSize,
  type ColumnSection,
  type ColumnShape,
  type Exposure,
  type Finish,
  type GirderSection,
  type Section,
  type ShearBarSize,
  type SpliceMethod,
  type SteelGrade,
  type SlabBarRow,
  type SlabSection,
  type WallSection,
} from '@/domain/model/member'
import type { Project } from '@/domain/model/project'
import { useAppStore } from '@/lib/store'
import { capture } from '@/lib/telemetry'

import styles from './SectionTable.module.css'

const barSizes: readonly BarSize[] = BAR_SIZES

const shearBarSizes: readonly ShearBarSize[] = SHEAR_BAR_SIZES

const columnShapes: readonly ColumnShape[] = ['矩形', '円形']

const steelGrades: SteelGrade[] = ['SD295', 'SD345', 'SD390']

const spliceMethods: readonly SpliceMethod[] = SPLICE_METHODS

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
  // 幅止め筋·腹筋처럼 「なし」가 성립하는 항목은 그 배근이 없을 때 입력을 막는다.
  // 열어 두면 updater 가 current 를 그대로 돌려줘 입력이 흔적 없이 사라진다.
  disabled = false,
}: {
  label: string
  value: number
  onChange(value: number): void
  minimum?: number
  disabled?: boolean
}) {
  return (
    <input
      className={styles.numberInput}
      type="number"
      min={minimum}
      step="1"
      value={value}
      disabled={disabled}
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
 * せん断補強筋 (帯筋・あばら筋) の径。主筋の選択肢と分かれているのは、
 * 高強度せん断補強筋 (K13・S13) を主筋に入れられないからだ — 主筋は定着・
 * 重ね継手を表5.3.4・表5.3.2 から径で引くが、その表に高強度せん断補強筋の
 * 行がない (ADR-026)。
 */
function ShearBarSizeSelect({
  label,
  value,
  onChange,
}: {
  label: string
  value: ShearBarSize
  onChange(value: ShearBarSize): void
}) {
  return (
    <select
      className={styles.select}
      value={value}
      aria-label={label}
      onChange={(event) => onChange(event.currentTarget.value as ShearBarSize)}
    >
      {shearBarSizes.map((size) => (
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

function SpliceMethodSelect({
  label,
  value,
  onChange,
}: {
  label: string
  value: SpliceMethod
  onChange(value: SpliceMethod): void
}) {
  return (
    <select
      className={styles.select}
      value={value}
      aria-label={label}
      onChange={(event) =>
        onChange(event.currentTarget.value as SpliceMethod)
      }
    >
      {spliceMethods.map((method) => (
        <option key={method} value={method}>
          {method}
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
      {/* 表5.3.6 の「スラブ、耐力壁以外の壁」行は仕上げの有無だけで分かれ、
          屋内・屋外の区別を持たない — 効かないつまみを置かない (ADR-028)。 */}
      {section.kind === '床板' ? null : (
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
      )}
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

/**
 * 断面形状。円形へ移るとき d に b を入れるのは、円形柱が b・d をともに直径として
 * 持つからだ — 大梁の内法も 3D の柱面も b・d から決まる (ADR-027)。
 */
function ColumnShapeSelect({
  section,
  update,
}: {
  section: ColumnSection
  update(updater: (section: Section) => Section): void
}) {
  return (
    <select
      className={styles.select}
      value={section.shape}
      aria-label={`${sectionMarkLabel(section)} 断面形状`}
      onChange={(event) => {
        const shape = event.currentTarget.value as ColumnShape
        update((current) =>
          current.kind === '柱'
            ? { ...current, shape, ...(shape === '円形' ? { d: current.b } : {}) }
            : current,
        )
      }}
    >
      {columnShapes.map((shape) => (
        <option key={shape} value={shape}>
          {shape}
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
  if (section.kind === '床板') {
    // 床板の断面も板厚1つだ。長さは通り芯と大梁幅から決まる内法なので、
    // 断面一覧では持たない（躯体の区分（４））。
    return (
      <NumberInput
        label={`${sectionMarkLabel(section)} 板厚 t`}
        value={section.thickness}
        onChange={(thickness) =>
          update((current) => ({ ...current, thickness }))
        }
      />
    )
  }

  if (section.kind === '耐震壁') {
    // 壁の断面は厚さ1つだ。b×D の枠に押し込むと図面にない寸法を作ってしまう。
    return (
      <NumberInput
        label={`${sectionMarkLabel(section)} 壁厚 t`}
        value={section.thickness}
        onChange={(thickness) =>
          update((current) => ({ ...current, thickness }))
        }
      />
    )
  }

  if (section.kind === '柱' && section.shape === '円形') {
    // 円形柱の寸法は直径ひとつだ。b・d を別々に出すと図面にない扁平断面を
    // 作れてしまう — 1通則2) の周長が π×直径 でなくなる (ADR-027)。
    return (
      <div className={styles.compoundField}>
        <ColumnShapeSelect section={section} update={update} />
        <NumberInput
          label={`${sectionMarkLabel(section)} 断面 直径`}
          value={section.b}
          onChange={(diameter) =>
            update((current) =>
              current.kind === '柱'
                ? { ...current, b: diameter, d: diameter }
                : current,
            )
          }
        />
        <span aria-hidden="true">φ</span>
      </div>
    )
  }

  const secondValue = section.kind === '柱' ? section.d : section.depth
  const secondLabel = section.kind === '柱' ? 'd' : 'せい'

  return (
    <div className={styles.compoundField}>
      {section.kind === '柱' ? (
        <ColumnShapeSelect section={section} update={update} />
      ) : null}
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

function GirderMainCountInput({
  section,
  row,
  place,
  update,
}: {
  section: GirderSection
  row: 'top' | 'bottom'
  place: '端部' | '中央'
  update(updater: (section: Section) => Section): void
}) {
  const key = place === '端部' ? 'endCount' : 'centerCount'

  return (
    <NumberInput
      label={`${sectionMarkLabel(section)} 主筋 ${
        row === 'top' ? '上' : '下'
      } ${place} 本数`}
      value={section.main[row][key]}
      onChange={(count) =>
        update((current) => {
          if (current.kind !== '大梁') return current
          return {
            ...current,
            main: {
              ...current.main,
              [row]: { ...current.main[row], [key]: count },
            },
          }
        })
      }
    />
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
      {(['top', 'bottom'] as const).map((row) => (
        <div key={row} className={styles.compoundField}>
          <span>{row === 'top' ? '上' : '下'}</span>
          <GirderMainCountInput
            section={section}
            row={row}
            place="端部"
            update={update}
          />
          <span aria-hidden="true">／</span>
          <GirderMainCountInput
            section={section}
            row={row}
            place="中央"
            update={update}
          />
        </div>
      ))}
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
      <div className={styles.compoundField}>
        <span>カットオフ</span>
        <NumberInput
          label={`${sectionMarkLabel(section)} カットオフ位置`}
          minimum={0}
          value={section.main.cutoffFromSupportFaceMm}
          onChange={(cutoffFromSupportFaceMm) =>
            update((current) => {
              if (current.kind !== '大梁') return current
              return {
                ...current,
                main: { ...current.main, cutoffFromSupportFaceMm },
              }
            })
          }
        />
      </div>
    </div>
  )
}

/**
 * 耐震壁の縦筋・横筋。どちらも「径 @ ピッチ ＋ 初期オフセット」で形が同じなので
 * 1つのコンポーネントが両方を受け持つ。どちらの行かは `row` が決める。
 */
function WallBarField({
  section,
  update,
  row,
}: {
  section: WallSection
  update(updater: (section: Section) => Section): void
  row: 'vertical' | 'horizontal'
}) {
  const label = row === 'vertical' ? '縦筋' : '横筋'
  const bar = section[row]
  const replace = (patch: Partial<WallSection['vertical']>) =>
    update((current) =>
      current.kind === '耐震壁'
        ? { ...current, [row]: { ...current[row], ...patch } }
        : current,
    )

  return (
    <div className={styles.compoundField}>
      <BarSizeSelect
        label={`${sectionMarkLabel(section)} ${label} 径`}
        value={bar.size}
        onChange={(size) => replace({ size })}
      />
      <span aria-hidden="true">@</span>
      <NumberInput
        label={`${sectionMarkLabel(section)} ${label} ピッチ`}
        value={bar.pitch}
        onChange={(pitch) => replace({ pitch })}
      />
      <NumberInput
        label={`${sectionMarkLabel(section)} ${label} 初期オフセット`}
        minimum={0}
        value={bar.startOffsetMm}
        onChange={(startOffsetMm) => replace({ startOffsetMm })}
      />
    </div>
  )
}

/**
 * 床板の主筋 — 1方向ぶんの上端筋・下端筋。X方向とY方向で別々に受け取る。
 * 径もピッチも断面リストの入力であって規準に本数の条文はない (ADR-012)。
 */
function SlabBarField({
  section,
  update,
  axis,
}: {
  section: SlabSection
  update(updater: (section: Section) => Section): void
  axis: 'x' | 'y'
}) {
  const replace = (
    face: 'top' | 'bottom',
    patch: Partial<SlabBarRow>,
  ): void =>
    update((current) =>
      current.kind === '床板'
        ? {
            ...current,
            [axis]: {
              ...current[axis],
              [face]: { ...current[axis][face], ...patch },
            },
          }
        : current,
    )

  return (
    <div className={styles.slabBarField}>
      {(['top', 'bottom'] as const).map((face) => {
        const bar = section[axis][face]
        const label = `${axis.toUpperCase()}方向${face === 'top' ? '上端筋' : '下端筋'}`

        return (
          <div key={face} className={styles.compoundField}>
            <BarSizeSelect
              label={`${sectionMarkLabel(section)} ${label} 径`}
              value={bar.size}
              onChange={(size) => replace(face, { size })}
            />
            <span aria-hidden="true">@</span>
            <NumberInput
              label={`${sectionMarkLabel(section)} ${label} ピッチ`}
              value={bar.pitch}
              onChange={(pitch) => replace(face, { pitch })}
            />
            <NumberInput
              label={`${sectionMarkLabel(section)} ${label} 初期オフセット`}
              minimum={0}
              value={bar.startOffsetMm}
              onChange={(startOffsetMm) => replace(face, { startOffsetMm })}
            />
          </div>
        )
      })}
    </div>
  )
}

/**
 * 配筋層数（シングル／ダブル）。本数がそのまま倍違うのに規準に条文がなく、
 * 壁リストの記載そのものである (ADR-012) — だから既定値を置かず選ばせる。
 */
function WallLayersField({
  section,
  update,
}: {
  section: WallSection
  update(updater: (section: Section) => Section): void
}) {
  return (
    <select
      className={styles.select}
      value={String(section.layers)}
      aria-label={`${sectionMarkLabel(section)} 配筋層数`}
      onChange={(event) => {
        const layers = Number(event.currentTarget.value) === 2 ? 2 : 1
        update((current) =>
          current.kind === '耐震壁' ? { ...current, layers } : current,
        )
      }}
    >
      <option value="1">シングル</option>
      <option value="2">ダブル</option>
    </select>
  )
}

function ShearField({
  section,
  update,
}: {
  section: Section
  update(updater: (section: Section) => Section): void
}) {
  // 壁のせん断補強にあたるのは横筋だ。ここから先は柱・大梁だけが通る —
  // 下の update コールバックが耐震壁を素通しするのはそのためである。
  if (section.kind === '耐震壁') {
    return <WallBarField section={section} update={update} row="horizontal" />
  }

  // 床板にせん断補強筋はない。この列にはもう一方の向きの主筋を置く —
  // 空欄にすると2方向のうち片方しか入力できない表になる。
  if (section.kind === '床板') {
    return <SlabBarField section={section} update={update} axis="y" />
  }

  const reinforcement = section.kind === '柱' ? section.hoop : section.stirrup
  const label = section.kind === '柱' ? '帯筋' : 'あばら筋'

  return (
    <div className={styles.compoundField}>
      <ShearBarSizeSelect
        label={`${sectionMarkLabel(section)} ${label} 径`}
        value={reinforcement.size}
        onChange={(size) =>
          update((current) =>
            current.kind === '柱'
              ? { ...current, hoop: { ...current.hoop, size } }
              : current.kind === '大梁'
                ? { ...current, stirrup: { ...current.stirrup, size } }
                : current,
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
              : current.kind === '大梁'
                ? { ...current, stirrup: { ...current.stirrup, pitch } }
                : current,
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
              : current.kind === '大梁'
                ? {
                    ...current,
                    stirrup: { ...current.stirrup, startOffsetMm },
                  }
                : current,
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
              // ピッチは断面一覧の入力だ (ADR-012)。規準に幅止め筋のピッチはなく、
              // あばら筋の値を借りれば利用者が入れていない数字が 1通則7) の
              // 割付本数に入ってしまう。0 ＝ 未入力としてカットオフ位置と同じく
              // 道具側に判定させる (ADR-021 ④)。
              widthTie: { size, pitch: current.widthTie?.pitch ?? 0 },
            }
          })
        }
      />
      <span aria-hidden="true">@</span>
      <NumberInput
        label={`${sectionMarkLabel(section)} 幅止め筋 ピッチ`}
        disabled={widthTie === undefined}
        minimum={0}
        value={widthTie?.pitch ?? 0}
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
              sideBar: {
                size,
                // 本数の種は両側面に1本ずつの2本。余長は 0 —
                // JASS 5 が未確保で規準値がないので、入れないかぎり計上しない (R9②)。
                count: current.sideBar?.count ?? 2,
                extraLengthMm: current.sideBar?.extraLengthMm ?? 0,
              },
            }
          })
        }
      />
      <span aria-hidden="true">×</span>
      <NumberInput
        label={`${sectionMarkLabel(section)} 腹筋 本数`}
        disabled={sideBar === undefined}
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
        disabled={sideBar === undefined}
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
            <th scope="col">継手方式</th>
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
                  ) : section.kind === '耐震壁' ? (
                    <WallBarField
                      section={section}
                      update={updateCurrent}
                      row="vertical"
                    />
                  ) : section.kind === '床板' ? (
                    <SlabBarField
                      section={section}
                      update={updateCurrent}
                      axis="x"
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
                  ) : section.kind === '耐震壁' ? (
                    <WallLayersField
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
                  <SpliceMethodSelect
                    label={`${sectionMarkLabel(section)} 継手方式`}
                    value={section.spliceMethod}
                    onChange={(spliceMethod) =>
                      updateCurrent((current) => ({
                        ...current,
                        spliceMethod,
                      }))
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
