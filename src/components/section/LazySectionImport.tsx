'use client'

import { useEffect, useRef, useState, type ChangeEvent } from 'react'

import { t } from '@/lib/i18n'
import { useAppStore } from '@/lib/store'

import styles from './SectionImport.module.css'
import type { SectionImportProps } from './SectionImport'

/**
 * 断面リスト取込の殻。初期表示に要るのは「PDF取込」の釦とファイル入力だけで、
 * 候補表と解析器はどちらも PDF を選ぶまで要らない — だから本体は動的境界の
 * 向こうに置き、初期ロードの転送バイトから外す。
 *
 * 選んだ PDF はそのまま本体に渡す。読み取り中・失敗・候補の表示は本体が
 * 受け持つので、画面に出るものは殻を挟む前と同じだ。
 */
type SectionImportComponent = (props: SectionImportProps) => React.ReactNode

let panel: SectionImportComponent | null = null
let pending: Promise<SectionImportComponent> | null = null

export function loadSectionImportPanel(): Promise<SectionImportComponent> {
  pending ??= import('./SectionImport').then(({ SectionImport }) => {
    panel = SectionImport
    return panel
  })
  return pending
}

export function LazySectionImport() {
  const locale = useAppStore(({ locale }) => locale)
  const inputRef = useRef<HTMLInputElement>(null)
  const [Panel, setPanel] = useState<SectionImportComponent | null>(() => panel)
  const [file, setFile] = useState<File | null>(null)

  useEffect(() => {
    if (Panel !== null || file === null) return
    let live = true
    void loadSectionImportPanel().then((loaded) => {
      if (live) setPanel(() => loaded)
    })
    return () => {
      live = false
    }
  }, [Panel, file])

  if (Panel !== null && file !== null) {
    return <Panel initialFile={file} />
  }

  const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.currentTarget.files?.[0]
    if (next) setFile(next)
  }

  return (
    <div className={styles.control}>
      <button
        type="button"
        className={styles.openButton}
        // 釦を押した時点で本体を取りに行く — 利用者がファイルを選ぶ間に届く。
        onClick={() => {
          void loadSectionImportPanel()
          inputRef.current?.click()
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
        onChange={selectFile}
      />
    </div>
  )
}
