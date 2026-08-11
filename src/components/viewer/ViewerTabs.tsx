'use client'

import posthog from 'posthog-js'

import { t } from '@/lib/i18n'
import { useAppStore, type ViewerMode } from '@/lib/store'

import styles from './ViewerTabs.module.css'

const MODES: ViewerMode[] = ['member', 'building']

export function ViewerTabs() {
  const viewerMode = useAppStore(({ viewerMode }) => viewerMode)
  const setViewerMode = useAppStore(({ setViewerMode }) => setViewerMode)
  const locale = useAppStore(({ locale }) => locale)

  return (
    <div
      className={styles.viewerTabs}
      role="tablist"
      aria-label={t(locale, 'viewer.tabs')}
    >
      {MODES.map((mode) => {
        const selected = mode === viewerMode
        return (
          <button
            key={mode}
            type="button"
            role="tab"
            className={`${styles.viewerTab} ${
              selected ? styles.viewerTabActive : ''
            }`}
            aria-selected={selected}
            onClick={() => {
              setViewerMode(mode)
              posthog.capture('viewer_mode_changed', { mode })
            }}
          >
            {t(locale, `viewer.tab.${mode}`)}
          </button>
        )
      })}
    </div>
  )
}
