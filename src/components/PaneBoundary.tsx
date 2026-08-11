'use client'

import { Component, type ReactNode } from 'react'
import posthog from 'posthog-js'

import styles from './PaneBoundary.module.css'

export interface PaneBoundaryProps {
  /** Localised heading. The thrown message follows it as the reason. */
  label: string
  /** Which pane died. Travels with the report — otherwise every pane looks alike. */
  pane: string
  /** Changing this revives the pane — the input that caused the throw was edited. */
  resetKey: unknown
  children?: ReactNode
}

interface PaneBoundaryState {
  reason: string | null
}

export class PaneBoundary extends Component<
  PaneBoundaryProps,
  PaneBoundaryState
> {
  state: PaneBoundaryState = { reason: null }

  static getDerivedStateFromError(error: unknown): PaneBoundaryState {
    return {
      reason: error instanceof Error ? error.message : String(error),
    }
  }

  /**
   * 경계가 예외를 화면에서 삼키므로 여기서 보고하지 않으면 프로덕션에 흔적이 남지 않는다.
   * 여기 걸리는 것은 대부분 룰팩 조회 실패(`Rule not found`)다 — 사용자가 넣은 조합이
   * 룰팩에 없다는 뜻이고, 무엇을 다음에 채워야 하는지 알려주는 유일한 신호다.
   */
  componentDidCatch(error: unknown): void {
    posthog.captureException(error, { pane: this.props.pane })
  }

  componentDidUpdate(previous: PaneBoundaryProps): void {
    if (this.state.reason === null) return
    if (previous.resetKey === this.props.resetKey) return
    this.setState({ reason: null })
  }

  render(): ReactNode {
    const { reason } = this.state

    if (reason === null) return this.props.children

    return (
      <div className={styles.failure} role="alert">
        <p className={styles.label}>{this.props.label}</p>
        <p className={styles.reason}>{reason}</p>
      </div>
    )
  }
}
