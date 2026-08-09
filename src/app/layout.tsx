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
      <title>Kijun 基準</title>
      <body>{children}</body>
    </html>
  )
}
