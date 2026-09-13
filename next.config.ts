import path from 'node:path'

import type { NextConfig } from 'next'

import { shortenCssModuleNames } from './scripts/build/short-css-module-names.mjs'

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
  webpack(config, { dev }) {
    // CSS Modules のクラス名は CSS・SSR HTML・JS の三箇所に出る。本番だけ潰す。
    if (!dev) shortenCssModuleNames(config.module.rules)

    // ルールパックの YAML はビルド時に一度だけ解釈し、JSON テキストとして配る。
    // 出所も値も変わらない — 変わるのは「いつ読むか」だけだ。おかげでブラウザに
    // YAML パーサ (js-yaml) を載せずに済み、原文のコメントも束から落ちる。
    // 詳細は scripts/build/yaml-json-loader.mjs と js-yaml-json.mjs にある。
    config.module.rules.push({
      test: /\.yaml$/,
      use: [path.resolve(process.cwd(), 'scripts/build/yaml-json-loader.mjs')],
    })
    config.resolve.alias = {
      ...config.resolve.alias,
      'js-yaml': path.resolve(process.cwd(), 'scripts/build/js-yaml-json.mjs'),
    }
    return config
  },
}

export default nextConfig
