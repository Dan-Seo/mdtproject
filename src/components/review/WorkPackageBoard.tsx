'use client'

import { useState } from 'react'

import { addPackage, newReviewId, setChecklistStatus } from '@/domain/review/state'
import { packageReadiness } from '@/domain/review/readiness'
import type {
  ChecklistStatus,
  ElementRef,
  ReviewItem,
  WorkPackage,
} from '@/domain/review/types'
import { useReviewModel } from '@/lib/hooks/useReviewModel'
import { t } from '@/lib/i18n'
import { useAppStore } from '@/lib/store'

import styles from './WorkPackageBoard.module.css'

const CHECKLIST_STATUSES: ChecklistStatus[] = ['未入力', '未確認', '確認済', '保留', '除外']

interface ChecklistDraft {
  id: string
  label: string
  required: boolean
  reviewItemIds: string[]
}

interface PackageDraft {
  name: string
  assignee: string
  dueDate: string
  targets: ElementRef[]
  checklist: ChecklistDraft[]
}

type PendingChecklist =
  | {
      kind: 'confirmation'
      packageId: string
      entryId: string
      by: string
      note: string
      error: boolean
    }
  | {
      kind: 'reason'
      packageId: string
      entryId: string
      status: '保留' | '除外'
      reason: string
      error: boolean
    }

function emptyDraft(): PackageDraft {
  return {
    name: '',
    assignee: '',
    dueDate: '',
    targets: [],
    checklist: [],
  }
}

function statusLabel(locale: 'ja' | 'ko', status: ChecklistStatus): string {
  const key = {
    未入力: 'review.work.status.unentered',
    未確認: 'review.work.status.unconfirmed',
    確認済: 'review.work.status.confirmed',
    保留: 'review.work.status.hold',
    除外: 'review.work.status.excluded',
  }[status]
  return t(locale, key)
}

function reviewItemLabel(item: ReviewItem): string {
  return `${item.id} — ${item.title}`
}

function targetMemberId(target: ElementRef): string | null {
  if (target.kind === 'member') return target.memberId
  if (target.kind === 'joint') return target.columnMemberId
  return null
}

function targetLabel(locale: 'ja' | 'ko', target: ElementRef): string {
  const kind = {
    member: 'review.work.target.member',
    joint: 'review.work.target.joint',
    rebar: 'review.work.target.rebar',
    quantityLine: 'review.work.target.quantityLine',
  }[target.kind]
  const id = target.kind === 'member'
    ? target.memberId
    : target.kind === 'joint'
      ? target.columnMemberId
      : target.kind === 'rebar'
        ? target.rebarId
        : target.lineId
  return `${t(locale, kind)}: ${id}`
}

function sameTarget(left: ElementRef, right: ElementRef): boolean {
  if (left.kind !== right.kind) return false
  if (left.kind === 'member' && right.kind === 'member') return left.memberId === right.memberId
  if (left.kind === 'joint' && right.kind === 'joint') return left.columnMemberId === right.columnMemberId
  if (left.kind === 'rebar' && right.kind === 'rebar') return left.rebarId === right.rebarId
  if (left.kind === 'quantityLine' && right.kind === 'quantityLine') return left.lineId === right.lineId
  return false
}

export function WorkPackageBoard() {
  const review = useAppStore(({ review }) => review)
  const selection = useAppStore(({ sel }) => sel)
  const viewerMode = useAppStore(({ viewerMode }) => viewerMode)
  const locale = useAppStore(({ locale }) => locale)
  const selectMember = useAppStore(({ selectMember }) => selectMember)
  const setReview = useAppStore(({ setReview }) => setReview)
  const { current } = useReviewModel()

  const [draft, setDraft] = useState<PackageDraft | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingChecklist | null>(null)

  function addCurrentTarget(): void {
    if (!draft || !selection.memberId) return
    const target: ElementRef = viewerMode === 'joint'
      ? { kind: 'joint', columnMemberId: selection.memberId }
      : { kind: 'member', memberId: selection.memberId }
    if (draft.targets.some((candidate) => sameTarget(candidate, target))) return
    setDraft({ ...draft, targets: [...draft.targets, target] })
  }

  function savePackage(): void {
    if (!draft) return
    if (draft.name.trim() === '') {
      setFormError(t(locale, 'review.work.nameRequired'))
      return
    }
    if (draft.checklist.some((entry) => entry.label.trim() === '')) {
      setFormError(t(locale, 'review.work.invalidChecklist'))
      return
    }

    const now = new Date().toISOString()
    const packageId = newReviewId('work-package', review.packages.map(({ id }) => id))
    const workPackage: WorkPackage = {
      id: packageId,
      name: draft.name.trim(),
      targets: draft.targets,
      assignee: draft.assignee.trim(),
      dueDate: draft.dueDate === '' ? null : draft.dueDate,
      checklist: draft.checklist.map((entry) => ({
        ...entry,
        status: '未入力' as const,
        label: entry.label.trim(),
      })),
      createdAt: now,
      updatedAt: now,
    }
    setReview((state) => addPackage(state, workPackage))
    setDraft(null)
    setFormError(null)
  }

  function addChecklistItem(): void {
    if (!draft) return
    const id = `checklist-${draft.checklist.length + 1}`
    setDraft({
      ...draft,
      checklist: [
        ...draft.checklist,
        { id, label: '', required: true, reviewItemIds: [] },
      ],
    })
  }

  function changeChecklistStatus(pkg: WorkPackage, entryId: string, status: ChecklistStatus): void {
    const entry = pkg.checklist.find(({ id }) => id === entryId)
    if (!entry) return
    if (status === '確認済' && entry.reviewItemIds.length === 0) {
      setPending({ kind: 'confirmation', packageId: pkg.id, entryId, by: '', note: '', error: false })
      return
    }
    if (status === '保留' || status === '除外') {
      setPending({ kind: 'reason', packageId: pkg.id, entryId, status, reason: '', error: false })
      return
    }
    setReview((state) => setChecklistStatus(state, pkg.id, entryId, status))
    setPending(null)
  }

  function savePendingChecklist(): void {
    if (!pending) return
    if (pending.kind === 'confirmation') {
      if (pending.by.trim() === '') {
        setPending({ ...pending, error: true })
        return
      }
      setReview((state) => setChecklistStatus(
        state,
        pending.packageId,
        pending.entryId,
        '確認済',
        {
          confirmation: {
            by: pending.by.trim(),
            at: new Date().toISOString(),
            note: pending.note.trim(),
            fingerprints: current.fingerprints,
          },
        },
      ))
      setPending(null)
      return
    }
    if (pending.reason.trim() === '') {
      setPending({ ...pending, error: true })
      return
    }
    setReview((state) => setChecklistStatus(
      state,
      pending.packageId,
      pending.entryId,
      pending.status,
      { reason: pending.reason.trim() },
    ))
    setPending(null)
  }

  function pendingFor(pkgId: string, entryId: string): PendingChecklist | null {
    return pending?.packageId === pkgId && pending.entryId === entryId ? pending : null
  }

  return (
    <section className={styles.board} data-testid="work-packages">
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>{t(locale, 'review.work.title')}</p>
          <h2>{t(locale, 'review.work.heading')}</h2>
        </div>
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            setDraft(emptyDraft())
            setFormError(null)
          }}
        >
          {t(locale, 'review.work.add')}
        </button>
      </div>

      <p className={styles.notice} data-testid="data-review-notice" data-review-notice>
        {t(locale, 'review.work.notice')}
      </p>

      {draft && (
        <form
          className={styles.form}
          data-testid="work-package-form"
          onSubmit={(event) => {
            event.preventDefault()
            savePackage()
          }}
        >
          <h3>{t(locale, 'review.work.add')}</h3>
          <label>
            {t(locale, 'review.work.name')}
            <input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </label>
          <label>
            {t(locale, 'review.work.assignee')}
            <input
              value={draft.assignee}
              onChange={(event) => setDraft({ ...draft, assignee: event.target.value })}
            />
          </label>
          <label>
            {t(locale, 'review.work.dueDate')}
            <input
              type="date"
              value={draft.dueDate}
              onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })}
            />
          </label>

          <div className={styles.formGroup}>
            <h4>{t(locale, 'review.work.targets')}</h4>
            <button type="button" onClick={addCurrentTarget}>
              {t(locale, 'review.work.addCurrentTarget')}
            </button>
            {draft.targets.length > 0 && (
              <ul className={styles.targetList}>
                {draft.targets.map((target) => (
                  <li key={`${target.kind}-${targetMemberId(target) ?? targetLabel(locale, target)}`}>
                    {targetLabel(locale, target)}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={styles.formGroup}>
            <h4>{t(locale, 'review.work.checklist')}</h4>
            {draft.checklist.map((entry, index) => (
              <div className={styles.draftChecklist} key={entry.id}>
                <label>
                  {t(locale, 'review.work.checklistItemLabel')} {index + 1}
                  <input
                    aria-label={`${t(locale, 'review.work.checklistItemLabel')} ${index + 1}`}
                    value={entry.label}
                    onChange={(event) => setDraft({
                      ...draft,
                      checklist: draft.checklist.map((candidate) => candidate.id === entry.id
                        ? { ...candidate, label: event.target.value }
                        : candidate),
                    })}
                  />
                </label>
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={entry.required}
                    onChange={(event) => setDraft({
                      ...draft,
                      checklist: draft.checklist.map((candidate) => candidate.id === entry.id
                        ? { ...candidate, required: event.target.checked }
                        : candidate),
                    })}
                  />
                  {t(locale, 'review.work.required')}
                </label>
                <label>
                  {t(locale, 'review.work.linkReviewItem')}
                  <select
                    aria-label={`${t(locale, 'review.work.linkReviewItem')} ${index + 1}`}
                    value={entry.reviewItemIds[0] ?? ''}
                    onChange={(event) => setDraft({
                      ...draft,
                      checklist: draft.checklist.map((candidate) => candidate.id === entry.id
                        ? { ...candidate, reviewItemIds: event.target.value === '' ? [] : [event.target.value] }
                        : candidate),
                    })}
                  >
                    <option value="">{t(locale, 'review.work.noLinkedItem')}</option>
                    {review.items.map((item) => (
                      <option key={item.id} value={item.id}>{reviewItemLabel(item)}</option>
                    ))}
                  </select>
                </label>
              </div>
            ))}
            <button type="button" onClick={addChecklistItem}>
              {t(locale, 'review.work.addChecklist')}
            </button>
          </div>

          {formError && <p className={styles.error} role="alert">{formError}</p>}
          <div className={styles.formActions}>
            <button type="submit">{t(locale, 'review.work.save')}</button>
            <button type="button" onClick={() => setDraft(null)}>
              {t(locale, 'review.work.cancel')}
            </button>
          </div>
        </form>
      )}

      {review.packages.length === 0 ? (
        <p className={styles.empty}>{t(locale, 'review.work.noPackages')}</p>
      ) : (
        <div className={styles.cards}>
          {review.packages.map((pkg) => {
            const readiness = packageReadiness(pkg, review.items, current)
            return (
              <article className={styles.card} data-testid={`work-package-card-${pkg.id}`} key={pkg.id}>
                <header className={styles.cardHeading}>
                  <div>
                    <h3>{pkg.name}</h3>
                    <p>{t(locale, 'review.work.assigneeValue')}: {pkg.assignee || '—'}</p>
                    <p>{t(locale, 'review.work.dueDateValue')}: {pkg.dueDate || '—'}</p>
                  </div>
                  <span
                    className={styles.state}
                    data-testid="data-package-state"
                    data-package-state={readiness.state}
                  >
                    {readiness.state}
                  </span>
                </header>

                {readiness.blockers.length > 0 && (
                  <section className={styles.blockers}>
                    <h4>{t(locale, 'review.work.blockers')}</h4>
                    <ul>
                      {readiness.blockers.map((blocker) => (
                        <li
                          data-testid="data-blocker"
                          data-blocker={blocker.kind}
                          key={`${blocker.entryId ?? 'package'}-${blocker.kind}-${blocker.detail}`}
                        >
                          <strong>{blocker.kind}</strong>: {blocker.detail}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {readiness.exceptions.length > 0 && (
                  <section className={styles.exceptions}>
                    <h4>{t(locale, 'review.work.exceptions')}</h4>
                    <ul>
                      {readiness.exceptions.map((exception) => (
                        <li data-testid="data-exception" key={exception.entryId}>
                          <strong>{exception.kind}</strong>: {exception.reason}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <section className={styles.targets}>
                  <h4>{t(locale, 'review.work.targets')} · {t(locale, 'review.work.targetCount')} {readiness.memberIds.length}</h4>
                  <div className={styles.targetChips}>
                    {pkg.targets.map((target, index) => {
                      const memberId = targetMemberId(target)
                      return (
                        <button
                          className={styles.targetChip}
                          disabled={memberId === null}
                          key={`${target.kind}-${memberId ?? index}`}
                          type="button"
                          onClick={() => {
                            if (memberId) selectMember(memberId)
                          }}
                        >
                          {targetLabel(locale, target)}
                        </button>
                      )
                    })}
                  </div>
                </section>

                <section className={styles.checklist} data-testid="work-package-checklist">
                  <h4>{t(locale, 'review.work.checklist')}</h4>
                  {pkg.checklist.length === 0 ? (
                    <p>{t(locale, 'review.work.noChecklist')}</p>
                  ) : pkg.checklist.map((entry) => {
                    const edit = pendingFor(pkg.id, entry.id)
                    const displayedStatus = edit?.kind === 'reason' || edit?.kind === 'confirmation'
                      ? edit.kind === 'reason' ? edit.status : '確認済'
                      : entry.status
                    return (
                      <div className={styles.checklistRow} key={entry.id}>
                        <div>
                          <strong>{entry.label}</strong>
                          {entry.required && <span className={styles.required}>{t(locale, 'review.work.required')}</span>}
                        </div>
                        <label>
                          {t(locale, 'review.work.checklistStatus')}
                          <select
                            aria-label={t(locale, 'review.work.checklistStatus')}
                            value={displayedStatus}
                            onChange={(event) => changeChecklistStatus(pkg, entry.id, event.target.value as ChecklistStatus)}
                          >
                            {CHECKLIST_STATUSES.map((status) => (
                              <option key={status} value={status}>{statusLabel(locale, status)}</option>
                            ))}
                          </select>
                        </label>
                        {edit?.kind === 'confirmation' && (
                          <div className={styles.inlineForm}>
                            <label>
                              {t(locale, 'review.work.confirmBy')}
                              <input
                                value={edit.by}
                                onChange={(event) => setPending({ ...edit, by: event.target.value, error: false })}
                              />
                            </label>
                            <label>
                              {t(locale, 'review.work.confirmNote')}
                              <input
                                value={edit.note}
                                onChange={(event) => setPending({ ...edit, note: event.target.value })}
                              />
                            </label>
                            {edit.error && <p className={styles.error} role="alert">{t(locale, 'review.work.confirmByRequired')}</p>}
                            <button type="button" onClick={savePendingChecklist}>
                              {t(locale, 'review.work.saveChecklist')}
                            </button>
                          </div>
                        )}
                        {edit?.kind === 'reason' && (
                          <div className={styles.inlineForm}>
                            <label>
                              {t(locale, 'review.work.reason')}
                              <input
                                value={edit.reason}
                                onChange={(event) => setPending({ ...edit, reason: event.target.value, error: false })}
                              />
                            </label>
                            {edit.error && <p className={styles.error} role="alert">{t(locale, 'review.work.reasonRequired')}</p>}
                            <button type="button" onClick={savePendingChecklist}>
                              {t(locale, 'review.work.saveChecklist')}
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </section>

                <p className={styles.footer} data-testid="work-package-footer">
                  {t(locale, 'review.work.footer')}
                </p>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
