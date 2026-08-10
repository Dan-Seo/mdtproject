import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { FlatCompat } from '@eslint/eslintrc'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const compat = new FlatCompat({ baseDirectory: dirname })

const config = [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      '.claude/**',
      'design/**',
      'next-env.d.ts',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    ignores: ['src/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message:
            '사용자 도면 데이터를 서버로 보내지 않는다 (CLAUDE.md CRITICAL) — 네트워크 전송 코드 금지',
        },
        {
          name: 'XMLHttpRequest',
          message:
            '사용자 도면 데이터를 서버로 보내지 않는다 (CLAUDE.md CRITICAL) — 네트워크 전송 코드 금지',
        },
        {
          name: 'WebSocket',
          message:
            '사용자 도면 데이터를 서버로 보내지 않는다 (CLAUDE.md CRITICAL) — 네트워크 전송 코드 금지',
        },
        {
          name: 'EventSource',
          message:
            '사용자 도면 데이터를 서버로 보내지 않는다 (CLAUDE.md CRITICAL) — 네트워크 전송 코드 금지',
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'navigator',
          property: 'sendBeacon',
          message:
            '사용자 도면 데이터를 서버로 보내지 않는다 (CLAUDE.md CRITICAL) — 네트워크 전송 코드 금지',
        },
      ],
    },
  },
  {
    files: ['src/domain/**/*.{js,jsx,ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            'react',
            'react-dom',
            'next',
            'three',
            'zustand',
            'exceljs',
          ],
          patterns: [
            'react/*',
            'react-dom/*',
            'next/*',
            'three/*',
            'zustand/*',
            'exceljs/*',
          ],
        },
      ],
    },
  },
]

export default config
