'use client'

import { useState } from 'react'

import { useTakeoff } from '@/lib/hooks/useTakeoff'
import { t } from '@/lib/i18n'
import { useAppStore } from '@/lib/store'
import { capture, captureException } from '@/lib/telemetry'

import bar from './viewerBar.module.css'
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
  // 書き出しは案件まるごとだ — 5万インスタンス規模では数秒かかる。その間に
  // もう一度押せると場面構築と glb 生成が二重に走り、model_exported も二回立つ。
  const [busy, setBusy] = useState(false)

  const exportModel = () => {
    if (busy) return
    setBusy(true)
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
      .finally(() => setBusy(false))
  }

  return (
    <div className={bar.bar} role="group">
      <button
        type="button"
        className={bar.button}
        onClick={exportModel}
        disabled={busy}
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
