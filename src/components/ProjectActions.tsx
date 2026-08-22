'use client'

import { useId, useState, type ChangeEvent } from 'react'

import { t } from '@/lib/i18n'
import { downloadProjectJson, readProjectFile } from '@/lib/persist/file'
import { useAppStore } from '@/lib/store'
import { capture, captureException } from '@/lib/telemetry'

import styles from './ProjectActions.module.css'

/**
 * 案件の保存・読み込み (docs/UX.md §4 段階5)。自動保存 (useProjectPersistence)
 * はブラウザを跨げないので、他の端末へ渡す道がここになる。ファイルは利用者の
 * 手元だけで読み書きし、サーバへは出ない (ADR-006)。
 */
export function ProjectActions() {
  const project = useAppStore(({ project }) => project)
  const loadProject = useAppStore(({ loadProject }) => loadProject)
  const locale = useAppStore(({ locale }) => locale)
  const [failed, setFailed] = useState(false)
  const inputId = useId()

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // 同じファイルを選び直しても change が出るように値を空に戻す。
    event.target.value = ''
    if (!file) return

    try {
      loadProject(await readProjectFile(file))
      setFailed(false)
      capture('project_imported', { locale })
    } catch (error) {
      // 黙って失敗すると「読み込んだのに何も変わらない」としか見えない。
      // 今開いている案件はそのまま残す。
      setFailed(true)
      captureException(error, { stage: 'project_import' })
      capture('project_import_failed', { locale })
    }
  }

  return (
    <div className={styles.projectActions}>
      <button
        type="button"
        className={styles.actionButton}
        onClick={() => {
          downloadProjectJson(project)
          capture('project_exported', { locale })
        }}
      >
        {t(locale, 'project.save')}
      </button>
      <label className={styles.actionButton} htmlFor={inputId}>
        {t(locale, 'project.load')}
      </label>
      <input
        id={inputId}
        type="file"
        accept="application/json,.json"
        className={styles.fileInput}
        onChange={chooseFile}
      />
      {failed ? (
        <span role="alert" className={styles.failure}>
          {t(locale, 'project.loadFailed')}
        </span>
      ) : null}
    </div>
  )
}
