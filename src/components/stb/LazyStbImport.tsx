'use client'

import { useEffect, useRef, useState, type ChangeEvent } from 'react'

import { t } from '@/lib/i18n'
import { useAppStore } from '@/lib/store'

import styles from './StbImport.module.css'
import type { StbImportProps } from './StbImport'

/**
 * ST-Bridge 取込の殻。初期表示に要るのは「ST-Bridge取込」の釦とファイル入力
 * だけで、候補表も .stb の解析器も ファイルを選ぶまで要らない — だから本体は
 * 動的境界の向こうに置き、初期ロードの転送バイトから外す。
 */
type StbImportComponent = (props: StbImportProps) => React.ReactNode

let panel: StbImportComponent | null = null
let pending: Promise<StbImportComponent> | null = null

export function loadStbImportPanel(): Promise<StbImportComponent> {
  pending ??= import('./StbImport').then(({ StbImport }) => {
    panel = StbImport
    return panel
  })
  return pending
}

export function LazyStbImport() {
  const locale = useAppStore(({ locale }) => locale)
  const inputRef = useRef<HTMLInputElement>(null)
  const [Panel, setPanel] = useState<StbImportComponent | null>(() => panel)
  const [file, setFile] = useState<File | null>(null)

  useEffect(() => {
    if (Panel !== null || file === null) return
    let live = true
    void loadStbImportPanel().then((loaded) => {
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
          void loadStbImportPanel()
          inputRef.current?.click()
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
    </div>
  )
}
