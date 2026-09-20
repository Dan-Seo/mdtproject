'use client'

import { useEffect, useRef, useState, type ChangeEvent } from 'react'

import { t } from '@/lib/i18n'
import { useAppStore } from '@/lib/store'

import styles from './PlanImport.module.css'
import type { PlanImportProps } from './PlanImport'

/**
 * 伏図·軸組図·図面セット取込の殻。初期表示に要るのは二つの釦とファイル入力
 * だけで、候補表も解析器も図面を選ぶまで要らない — だから本体は動的境界の
 * 向こうに置き、初期ロードの転送バイトから外す (ADR-030 の承認規約は本体側の
 * ままだ。殻は案件に触れない)。
 *
 * 選んだ図面はそのまま本体に渡す。読み取り中・失敗・候補の表示は本体が受け
 * 持つので、画面に出るものは殻を挟む前と同じだ。
 */
type PlanImportComponent = (props: PlanImportProps) => React.ReactNode

let panel: PlanImportComponent | null = null
let pending: Promise<PlanImportComponent> | null = null

export function loadPlanImportPanel(): Promise<PlanImportComponent> {
  pending ??= import('./PlanImport').then(({ PlanImport }) => {
    panel = PlanImport
    return panel
  })
  return pending
}

export function LazyPlanImport() {
  const locale = useAppStore(({ locale }) => locale)
  const planInput = useRef<HTMLInputElement>(null)
  const setInput = useRef<HTMLInputElement>(null)
  const [Panel, setPanel] = useState<PlanImportComponent | null>(() => panel)
  const [file, setFile] = useState<File | null>(null)
  const [setFiles, setSetFiles] = useState<File[] | null>(null)
  const chosen = file !== null || setFiles !== null

  useEffect(() => {
    if (Panel !== null || !chosen) return
    let live = true
    void loadPlanImportPanel().then((loaded) => {
      if (live) setPanel(() => loaded)
    })
    return () => {
      live = false
    }
  }, [Panel, chosen])

  if (Panel !== null && chosen) {
    return (
      <Panel
        initialFile={file ?? undefined}
        initialSetFiles={setFiles ?? undefined}
      />
    )
  }

  const selectPlan = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.currentTarget.files?.[0]
    if (next) setFile(next)
  }

  const selectSet = (event: ChangeEvent<HTMLInputElement>) => {
    const next = Array.from(event.currentTarget.files ?? [])
    if (next.length) setSetFiles(next)
  }

  // 釦を押した時点で本体を取りに行く — 利用者が図面を選ぶ間に届く。
  const openPicker = (input: HTMLInputElement | null) => {
    void loadPlanImportPanel()
    input?.click()
  }

  return (
    <div className={styles.control}>
      <button
        type="button"
        className={styles.openButton}
        onClick={() => openPicker(setInput.current)}
      >
        {t(locale, 'drawingSet.title')}
      </button>
      <input
        ref={setInput}
        className={styles.fileInput}
        type="file"
        multiple
        accept="application/pdf"
        data-testid="drawing-set-files"
        aria-label={t(locale, 'drawingSet.files')}
        onChange={selectSet}
      />
      <button
        type="button"
        className={styles.openButton}
        onClick={() => openPicker(planInput.current)}
      >
        {t(locale, 'planImport.open')}
      </button>
      <input
        ref={planInput}
        className={styles.fileInput}
        data-testid="plan-import-file"
        type="file"
        accept="application/pdf"
        aria-label={t(locale, 'planImport.file')}
        onChange={selectPlan}
      />
    </div>
  )
}
