'use client'

import { useState } from 'react'

import { useTakeoff } from '@/lib/hooks/useTakeoff'
import { t } from '@/lib/i18n'
import { useAppStore } from '@/lib/store'
import { capture, captureException } from '@/lib/telemetry'

// 釦はタブと同じ帯に並ぶので見た目を借りる。自分しか使わない類だけ自分で持つ。
import tabStyles from './ViewerTabs.module.css'
import styles from './ViewerExportButton.module.css'

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
    // three は画面のビューアと同じ塊だ。ヘッダに常駐するこの釦が静的に引くと、
    // page.tsx が dynamic() でハイドレーション経路から外した意味が消える —
    // 押した時に取る。
    //
    // 押した時点ではなく結果に事象を立てる — three のチャンク読み込みが
    // 落ちても、押した数だけ成功が積まれてしまう (TakeoffActions と同じ基準)。
    import('@/lib/export/gltf')
      .then(({ exportRebarGlb }) =>
        exportRebarGlb({
          project,
          rebars,
          locale,
          unsupportedMemberIds: new Set(
            unsupportedMembers.map(({ memberId }) => memberId),
          ),
        }),
      )
      .then(
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
    <div className={tabStyles.viewerTabs} role="group">
      <button
        type="button"
        className={tabStyles.viewerTab}
        onClick={exportModel}
      >
        {t(locale, 'viewer.export')}
      </button>
      {failed ? (
        <span role="alert" className={styles.exportFailure}>
          {t(locale, 'viewer.exportFailed')}
        </span>
      ) : null}
    </div>
  )
}
