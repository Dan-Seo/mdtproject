'use client'

import localFont from 'next/font/local'
import type { ReactNode } from 'react'

import './globals.css'

// 자기 호스팅하는 **문자 서브셋** 가변 폰트다. 근거와 재현 절차·수록 문자·OFL은
// `src/app/fonts/README.md`에 있다. 요약: Google이 주는 latin 서브셋에는 이 제품이
// 절대 그리지 않는 라틴 확장 자형이 들어 있어 Inter 48,732 B·JetBrains Mono 31,640 B를
// 냈다. `text=` 서브셋으로 36,856 B·28,268 B가 됐다(실측, −15,248 B).
//
// `weight: '400 700'`은 가변 축 범위다 — 400·600·700을 그대로 쓴다. 토큰이 400·600을
// 쓰고 th·strong의 브라우저 기본값이 700이므로 범위를 좁히지 말 것.
// 새 굵기를 CSS에 쓸 때는 이 범위 안인지만 보면 된다(파일은 그대로다).
const inter = localFont({
  src: './fonts/inter-latin-subset.woff2',
  weight: '400 700',
  style: 'normal',
  display: 'swap',
  variable: '--font-inter',
  // 서브셋에 없는 글자(악센트 라틴 등)와 日本語·한국어는 여기로 떨어진다 —
  // next/font/google이 붙여 주던 폴백 메트릭을 자기 호스팅에서도 유지한다.
  adjustFontFallback: 'Arial',
  fallback: ['system-ui', 'sans-serif'],
})

const jetBrainsMono = localFont({
  src: './fonts/jetbrains-mono-latin-subset.woff2',
  weight: '400 700',
  style: 'normal',
  display: 'swap',
  variable: '--font-jetbrains-mono',
  adjustFontFallback: 'Arial',
  fallback: ['ui-monospace', 'monospace'],
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
