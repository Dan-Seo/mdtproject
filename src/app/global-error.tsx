'use client'

import { useEffect } from 'react'
import posthog from 'posthog-js'

export default function GlobalError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string }
  reset: () => void
}>) {
  useEffect(() => {
    posthog.captureException(error)
  }, [error])

  // 루트 레이아웃(layout.tsx)까지 죽었을 수 있어 스토어에 기댈 수 없다 —
  // t() 대신 ADR-008 기본 로케일(ja)의 정적 문구를 직접 쓴다.
  return (
    <html lang="ja">
      <body>
        <main>
          <h1>表示できませんでした</h1>
          <p>入力を見直して、もう一度お試しください。</p>
          <button onClick={reset}>再試行</button>
        </main>
      </body>
    </html>
  )
}
