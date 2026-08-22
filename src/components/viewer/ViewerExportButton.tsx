'use client'

import { useState } from 'react'

import { exportRebarGlb } from '@/lib/export/gltf'
import { useTakeoff } from '@/lib/hooks/useTakeoff'
import { t } from '@/lib/i18n'
import { useAppStore } from '@/lib/store'
import { capture, captureException } from '@/lib/telemetry'

import styles from './ViewerTabs.module.css'

/**
 * 案件まるごとを glTF (glb) で書き出す (PRD §4)。画面のタブが 部材 でも
 * 建物 でも中身は同じ — 渡すのは模型であって、今の視点ではない。
 */
export function ViewerExportButton() {
  const project = useAppStore(({ project }) => project)
  const locale = useAppStore(({ locale }) => locale)
  const { rebars, unsupportedMembers } = useTakeoff()
  const [failed, setFailed] = useState(false)

  const exportModel = () => {
    // 押した時点ではなく結果に事象を立てる — three のチャンク読み込みが
    // 落ちても、押した数だけ成功が積まれてしまう (TakeoffActions と同じ基準)。
    exportRebarGlb({
      project,
      rebars,
      unsupportedMemberIds: new Set(
        unsupportedMembers.map(({ memberId }) => memberId),
      ),
    }).then(
      () => {
        setFailed(false)
        capture('model_exported', { locale })
      },
      (error: unknown) => {
        setFailed(true)
        captureException(error, { stage: 'model_export' })
        capture('model_export_failed', { locale })
      },
    )
  }

  return (
    <div className={styles.viewerTabs} role="group">
      <button
        type="button"
        className={styles.viewerTab}
        onClick={exportModel}
      >
        {t(locale, 'viewer.export')}
      </button>
      {failed ? (
        <span role="alert" className={styles.viewerExportFailure}>
          {t(locale, 'viewer.exportFailed')}
        </span>
      ) : null}
    </div>
  )
}
