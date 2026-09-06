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

// 이 목록은 **본문 서체(sans)의** 사정이다. 等幅(mono)은 사정이 다르다 —
// 디자인 시스템이 부르는 축이 `JetBrains+Mono:wght@400;500`이고
// (design/kijun-design-system/tokens/fonts.css), 이 앱에서 mono를 쓰는 CSS 규칙
// 15개는 전부 400이거나 굵기를 정하지 않는다. 그래서 400 하나만 받는다:
// 31,340 → 21,212 B (−10,128, 실측).
// 굵기를 정하지 않던 규칙에는 `font-weight: 400`을 함께 박았다 — 상속으로 600·700이
// 흘러들면 브라우저가 가짜 굵게(synthetic bold)를 그리기 때문이다. mono를 600 이상으로
// 쓸 일이 생기면 그 굵기를 이 목록에 먼저 더할 것.
const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400'],
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
