'use client'

import { Component, type ReactNode } from 'react'

import styles from './PaneBoundary.module.css'

export interface PaneBoundaryProps {
  /** Localised heading. The thrown message follows it as the reason. */
  label: string
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
