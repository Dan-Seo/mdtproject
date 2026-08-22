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
    let flushOnLeave: (() => void) | null = null
    let flushOnHide: (() => void) | null = null

    void loadStoredProject().then((stored) => {
      if (cancelled) return

      // 読み込みは非同期だ。その間に打たれたセルを復元が上書きすると、
      // 利用者から見れば入力が消える。手つかずのときだけ差し替える。
      const untouched =
        useAppStore.getState().project === useAppStore.getInitialState().project
      try {
        if (stored !== null && untouched) {
          useAppStore.getState().loadProject(stored)
        }
      } catch {
        // 参照切れは deserializeProject が切る (ここには来ない)。残るのは
        // loadProject 自体が投げる場合だけだ — 拾うのは、復元の失敗が
        // 自動保存を道連れにすると以後の編集が黙って保存されなくなるからで、
        // 「形は通ったが中身が壊れた記録」を止めるのはここではない。
      }

      const autosave = createAutosave()
      unsubscribe = useAppStore.subscribe(({ project }, previous) => {
        if (project !== previous.project) autosave(project)
      })
      // 読み込みを待つ間に打たれた編集は購読より前なので、一度だけなら
      // 書かれないまま消える—購読は「変化」でしか発火しない。ここで拾う。
      if (!untouched) autosave(useAppStore.getState().project)
      // 打ち終わって 500ms 以内に閉じられると待機中の書き込みが消える。
      // ただし flush は IndexedDB を開き直すので、pagehide まで待つと
      // 頁が壊される経路では open も transaction も終わらない — まだ
      // 非同期が許される visibilitychange(hidden) で先に出す。pagehide は
      // bfcache に入る時も来るので、隠れた後の一打を拾う保険だ。
      flushOnLeave = () => autosave.flush()
      flushOnHide = () => {
        if (document.visibilityState === 'hidden') autosave.flush()
      }
      window.addEventListener('pagehide', flushOnLeave)
      document.addEventListener('visibilitychange', flushOnHide)
      setRestored(true)
    })

    return () => {
      cancelled = true
      unsubscribe?.()
      if (flushOnLeave) window.removeEventListener('pagehide', flushOnLeave)
      if (flushOnHide) {
        document.removeEventListener('visibilitychange', flushOnHide)
      }
    }
  }, [])

  return { restored }
}
