'use client'

import { useEffect, useState } from 'react'

import {
  createAutosave,
  loadStoredProject,
} from '@/lib/persist/indexeddb'
import { useAppStore } from '@/lib/store'

export interface ProjectPersistence {
  /** 復元の判定が済んだか。済むまで自動保存は始めない。 */
  restored: boolean
}

/**
 * 再訪経路 (docs/UX.md §4 段階5)。前回の案件を IndexedDB から戻し、以後の
 * 編集を自動保存する。保存はブラウザの中だけで、サーバへは出ない (ADR-006)。
 */
export function useProjectPersistence(): ProjectPersistence {
  const [restored, setRestored] = useState(false)

  useEffect(() => {
    let cancelled = false
    let unsubscribe: (() => void) | null = null

    void loadStoredProject().then((stored) => {
      if (cancelled) return

      // 読み込みは非同期だ。その間に打たれたセルを復元が上書きすると、
      // 利用者から見れば入力が消える。手つかずのときだけ差し替える。
      const untouched =
        useAppStore.getState().project === useAppStore.getInitialState().project
      if (stored !== null && untouched) {
        useAppStore.getState().loadProject(stored)
      }

      const autosave = createAutosave()
      unsubscribe = useAppStore.subscribe(({ project }, previous) => {
        if (project !== previous.project) autosave(project)
      })
      setRestored(true)
    })

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  return { restored }
}
