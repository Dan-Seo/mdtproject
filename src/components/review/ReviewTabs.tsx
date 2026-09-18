'use client'

import { t } from '@/lib/i18n'
import { useAppStore } from '@/lib/store'

import bar from '../viewer/viewerBar.module.css'
import styles from '../viewer/ViewerTabs.module.css'

const TABS = ['内訳書', '検討', '作業'] as const

export function ReviewTabs() {
  const takeoffTab = useAppStore(({ takeoffTab }) => takeoffTab)
  const setTakeoffTab = useAppStore(({ setTakeoffTab }) => setTakeoffTab)
  const locale = useAppStore(({ locale }) => locale)

  return (
    <div className={bar.bar} role="tablist" aria-label="内訳書切替">
      {TABS.map((tab) => {
        const selected = tab === takeoffTab
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            className={`${bar.button} ${selected ? styles.viewerTabActive : ''}`}
            aria-selected={selected}
            onClick={() => setTakeoffTab(tab)}
          >
            {t(locale, `review.tab.${tab}`)}
          </button>
        )
      })}
    </div>
  )
}
