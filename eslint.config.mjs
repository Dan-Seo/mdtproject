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
      '.pytest_cache/**',
      '.cache/**',
      'design/**',
      'next-env.d.ts',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    // instrumentation-client.ts는 리포 루트(Next.js 관례)라 src/** 밖이지만
    // 이 프로젝트의 두 번째 아웃바운드 경로다(ADR-020) — 가드 사각지대에
    // 두면 안 된다.
    files: ['src/**/*.{js,jsx,ts,tsx}', 'instrumentation-client.ts'],
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
    // oncall alert 웹훅 수신 라우트만 예외 — PostHog 알림 메타데이터를 받아
    // GitHub API(멱등 ref·dispatch)를 호출하는 서버 코드다 (ADR-017). 사용자 도면
    // 데이터는 브라우저를 떠나지 않는다는 CRITICAL의 보호 대상과 무관하다.
    // fetch만 푼다 — XHR·WebSocket·EventSource 금지는 이 디렉터리에도 그대로 산다.
    files: ['src/app/api/oncall/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': [
        'error',
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
            'posthog-js',
          ],
          patterns: [
            'react/*',
            'react-dom/*',
            'next/*',
            'three/*',
            'zustand/*',
            'exceljs/*',
            'posthog-js/*',
          ],
        },
      ],
    },
  },
]

export default config
