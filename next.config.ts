import path from 'node:path'

import type { NextConfig } from 'next'

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
  webpack(config, { isServer }) {
    // 룰팩 YAML은 빌드 시점에 JSON으로 굳힌다 — default export는 이전(asset/source)과
    // 같은 **문자열**이고 문법만 JSON이다. 근거와 계약은 로더 파일 상단에 적어 두었다.
    config.module.rules.push({
      test: /\.yaml$/,
      type: 'javascript/auto',
      use: [{ loader: path.resolve('scripts/build/yaml-json-loader.cjs') }],
    })
    if (!isServer) {
      // 그 결과 브라우저에는 실행 시점 YAML 파서가 필요 없다. 정적 import만 남아
      // 초기 로드에 실리는 41,143 B(min)를 던지는 stub으로 바꾼다.
      config.resolve.alias = {
        ...config.resolve.alias,
        'js-yaml$': path.resolve('scripts/build/js-yaml-browser-stub.cjs'),
      }
    }
    return config
  },
}

export default nextConfig
