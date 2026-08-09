import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      '*.yaml': {
        loaders: ['raw-loader'],
        as: '*.js',
      },
    },
  },
  webpack(config) {
    config.module.rules.push({ test: /\.yaml$/, type: 'asset/source' })
    return config
  },
}

export default nextConfig
