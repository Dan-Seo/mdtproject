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

  /** 마지막으로 보고한 메시지. resetKey가 편집마다 바뀌어도 원인이 그대로면 다시 보내지 않는다. */
  private reportedReason: string | null = null

  static getDerivedStateFromError(error: unknown): PaneBoundaryState {
    return {
      reason: error instanceof Error ? error.message : String(error),
    }
  }

  /**
   * 경계가 예외를 화면에서 삼키므로 여기서 보고하지 않으면 프로덕션에 흔적이 남지 않는다.
   * 여기 걸리는 것은 대부분 룰팩 조회 실패(`Rule not found`)다 — 사용자가 넣은 조합이
   * 룰팩에 없다는 뜻이고, 무엇을 다음에 채워야 하는지 알려주는 유일한 신호다.
   *
   * resetKey는 프로젝트 어디를 편집해도 바뀐다(AppShell이 project 전체를 넘긴다).
   * 근본 원인이 그대로면 되살아난 자식이 같은 메시지로 다시 던지므로, 메시지가
   * 바뀌지 않는 한 다시 보내지 않는다 — 안 그러면 무관한 편집마다 oncall이 다시 운다.
   */
  componentDidCatch(error: unknown): void {
    const reason = error instanceof Error ? error.message : String(error)
    if (reason === this.reportedReason) return

    this.reportedReason = reason
    posthog.captureException(error, { pane: this.props.pane })
  }

  componentDidUpdate(
    previous: PaneBoundaryProps,
    previousState: PaneBoundaryState,
  ): void {
    if (this.state.reason === null) {
      // 진짜 복구(자식이 더 이상 안 던짐)만 여기 온다 — 원인이 그대로면
      // 재throw가 곧바로 새 실패 상태를 만들어 이 분기를 안 탄다. resetKey
      // 변경 시점에 비우면 위 dedup이 무의미해지므로 복구 성공 시점에만 비운다.
      if (previousState.reason !== null) this.reportedReason = null
      return
    }
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
