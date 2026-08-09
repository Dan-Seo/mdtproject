'use client'

import type { ReactNode } from 'react'

import { t } from '@/lib/i18n'
import { useAppStore } from '@/lib/store'

import styles from './AppShell.module.css'

export interface AppShellProps {
  plan?: ReactNode
  planActions?: ReactNode
  section?: ReactNode
  viewer?: ReactNode
  takeoff?: ReactNode
}

interface PaneProps {
  id: string
  title: string
  children?: ReactNode
  actions?: ReactNode
}

function Pane({ id, title, children, actions }: PaneProps) {
  const titleId = `${id}-title`

  return (
    <section className={styles.pane} aria-labelledby={titleId}>
      <header className={styles.paneHeader}>
        <h2 id={titleId} className={`${styles.paneTitle} t-caption-uppercase`}>
          {title}
        </h2>
        {actions}
      </header>
      <div className={styles.paneBody}>{children}</div>
    </section>
  )
}

export function AppShell({
  plan,
  planActions,
  section,
  viewer,
  takeoff,
}: AppShellProps) {
  const projectName = useAppStore(({ project }) => project.name)
  const locale = useAppStore(({ locale }) => locale)
  const setLocale = useAppStore(({ setLocale }) => setLocale)

  return (
    <div className={styles.shell} lang={locale}>
      <header className={styles.appHeader}>
        <div className={styles.wordmark}>{t(locale, 'app.wordmark')}</div>
        <div className={`${styles.projectName} t-body-sm`}>{projectName}</div>
        <div className={styles.localeToggle} aria-label="Language">
          {(['ja', 'ko'] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={`${styles.localeButton} ${
                locale === option ? styles.localeButtonActive : ''
              }`}
              aria-pressed={locale === option}
              onClick={() => setLocale(option)}
            >
              {t(locale, `locale.${option}`)}
            </button>
          ))}
        </div>
      </header>

      <main className={styles.shellMain}>
        <aside className={styles.warningBanner} role="alert">
          <span className={styles.warningTitle}>
            {t(locale, 'warning.m1.title')}
          </span>
          <span>{t(locale, 'warning.m1.body')}</span>
        </aside>

        <div className={styles.workspace}>
          <div className={styles.leftColumn}>
            <Pane
              id="plan-pane"
              title={t(locale, 'pane.plan')}
              actions={planActions}
            >
              {plan}
            </Pane>
            <Pane id="section-pane" title={t(locale, 'pane.section')}>
              {section}
            </Pane>
          </div>
          <div className={styles.rightColumn}>
            <Pane id="viewer-pane" title={t(locale, 'pane.viewer')}>
              {viewer}
            </Pane>
            <Pane id="takeoff-pane" title={t(locale, 'pane.takeoff')}>
              {takeoff}
            </Pane>
          </div>
        </div>

        <footer className={styles.sourceNotice}>
          <span>{t(locale, 'notice.source')}</span>
          <span>{t(locale, 'notice.scope')}</span>
        </footer>
      </main>
    </div>
  )
}
