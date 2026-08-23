import { fileURLToPath } from 'node:url'

import type { NextConfig } from 'next'

const fromRoot = (relative: string) =>
  fileURLToPath(new URL(relative, import.meta.url))

const nextConfig: NextConfig = {
  // Flat-config linting is enforced by the separate `npm run lint` AC.
  eslint: {
    ignoreDuringBuilds: true,
  },
  turbopack: {
    rules: {
      '*.yaml': {
        loaders: ['raw-loader'],
        as: '*.js',
      },
    },
  },
  // 번들(next build)에서만 룰팩 YAML을 빌드 시점에 JSON으로 굳힌다. 원문 96 kB의
  // 주석·전사 메모까지 브라우저로 실려 갈 이유가 없고, JSON은 YAML의 부분집합이라
  // parseRulePack이 받는 값은 그대로다. dev(turbopack)와 vitest는 이 경로를 지나지 않고
  // YAML 원문 + 진짜 js-yaml로 돈다 — 규준 값을 검증하는 경로는 건드리지 않는다.
  //
  // `experimental.optimizePackageImports: ['three']`은 시도했다가 되돌렸다 —
  // three 청크가 348,170 → 350,469 B로 오히려 늘었다(2026-08-23 실측).
  webpack(config) {
    config.module.rules.push({
      test: /\.yaml$/,
      type: 'javascript/auto',
      use: [{ loader: fromRoot('./scripts/build/yaml-json-loader.mjs') }],
    })
    // 남는 것이 JSON뿐이므로 런타임 파서도 JSON.parse로 충분하다 — js-yaml 청크
    // 13.5 kB(전송)가 초기 로드에서 통째로 빠진다.
    config.resolve.alias = {
      ...config.resolve.alias,
      'js-yaml': fromRoot('./src/lib/build/yaml-json.ts'),
    }
    return config
  },
}

export default nextConfig
