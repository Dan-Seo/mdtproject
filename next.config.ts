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
  webpack(config) {
    config.module.rules.push({ test: /\.yaml$/, type: 'asset/source' })
    return config
  },
}

export default nextConfig
