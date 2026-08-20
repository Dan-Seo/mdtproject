'use client'

import { Inter, JetBrains_Mono } from 'next/font/google'
import type { ReactNode } from 'react'

import './globals.css'

// weight를 적으면 Google Fonts가 wght 축을 그 범위로 좁힌 가변 폰트를 준다 —
// JetBrains Mono latin이 40,480 → 31,340 B로 줄었다(Inter는 48,432 B로 동일).
// 목록은 CSS가 실제로 쓰는 값 전부다: 토큰이 400·600을 쓰고, th·strong의
// 브라우저 기본값이 700이다. 700을 빼면 그 자리가 600으로 주저앉으므로 지우지 말 것
// (파일 크기는 700을 넣어도 그대로다 — 실측으로 확인했다).
// 여기 없는 굵기(500·800 등)를 CSS에 새로 쓸 때는 이 목록에도 함께 더할 것.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-inter',
})

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
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
        content="公共建築工事標準仕様書に基づき、柱・大梁の配筋詳細と鉄筋数量をブラウザ上で算定するツール（開発中・M2 未完了：ルールパック数値は原文抽出前の仮値。検収・発注には使用不可）。図面データは端末外に送信しない。"
      />
      <body>{children}</body>
    </html>
  )
}
