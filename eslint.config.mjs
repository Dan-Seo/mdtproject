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
    // src/instrumentation-client.ts는 이 프로젝트의 두 번째 아웃바운드
    // 경로다(ADR-020) — 가드 사각지대에 두면 안 된다. src/ 안에 있으므로
    // 아래 files 로 함께 덮인다.
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
    // posthog-js 직접 import는 src/lib/telemetry.ts 하나만 허용한다. 다른
    // 컴포넌트가 직접 import하면 (1) SDK가 그 컴포넌트의 번들에 정적으로
    // 끌려 들어오고(instrumentation-client.ts만 동적 import해서는 안 막힌다
    // — 실측: 다른 파일이 정적 import하면 그 파일이 속한 청크에도 SDK
    // 전체가 실린다), (2) before_send 스크러빙은 posthog.init을 실제로
    // 호출한 telemetry.ts를 거쳐야만 걸리는데 그 경로를 우회하게 된다.
    // src/instrumentation-client.ts도 이 규칙 안에 있어야 한다 — Next.js가
    // 모든 페이지에서 부수 효과로 로드하는 진입점이라, 여기서 posthog-js를
    // 직접 잡으면 SDK가 초기 번들에 그대로 실린다 (9차 리뷰 minor).
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    ignores: ['src/lib/telemetry.ts', 'src/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'posthog-js',
              message:
                'capture·captureException은 src/lib/telemetry.ts를 거친다 — 속성에 도면 유래 값이 실리지 않게 호출부를 한 곳으로 모은다 (ADR-020)',
            },
          ],
          patterns: ['posthog-js/*'],
        },
      ],
    },
  },
  {
    // domain이 실제로 닿을 수 있는 브라우저 전용 경로는 posthog-js 자체가
    // 아니라 그걸 감싼 @/lib/telemetry다 — 별칭만 막으면 domain에서
    // window.localStorage·동적 import를 쓰는 그 모듈이 lint 없이 들어온다
    // (10차 리뷰 minor).
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
            '@/lib/telemetry',
          ],
          patterns: [
            'react/*',
            'react-dom/*',
            'next/*',
            'three/*',
            'zustand/*',
            'exceljs/*',
            'posthog-js/*',
            '@/lib/*',
            // 별칭만 막으면 `import { capture } from '../../lib/telemetry'` 가
            // 그대로 통과한다 — src/domain 의 순수성을 지키는 장치가 이 규칙
            // 하나뿐이라 구멍이 있으면 규칙이 없는 것과 같다 (#53). `../` 로
            // 시작하는 모양만 막아 도메인 안끼리의 상대 import 는 남긴다.
            '../**/lib/*',
          ],
        },
      ],
    },
  },
]

export default config
