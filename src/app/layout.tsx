'use client'

import { Inter, JetBrains_Mono } from 'next/font/google'
import type { ReactNode } from 'react'

import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
})

// lang은 초기값만 두고 AppShell이 로케일에 맞춰 갱신한다 —
// 루트 레이아웃에서 스토어를 구독하면 프리렌더가 깨진다.
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ja" className={`${inter.variable} ${jetBrainsMono.variable}`}>
      {/* 이 레이아웃은 클라이언트 컴포넌트라 metadata export를 쓸 수 없다 —
          React 19가 head로 끌어올리는 태그를 그대로 쓴다. */}
      <title>Kijun 基準</title>
      <meta
        name="description"
        content="公共建築工事標準仕様書に基づき、柱・大梁の配筋詳細と鉄筋数量をブラウザ上で算定するツール。図面データは端末外に送信しない。"
      />
      <body>{children}</body>
    </html>
  )
}
