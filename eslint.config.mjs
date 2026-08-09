import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { FlatCompat } from '@eslint/eslintrc'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const compat = new FlatCompat({ baseDirectory: dirname })

const config = [
  {
    ignores: ['node_modules/**', '.next/**', 'design/**', 'next-env.d.ts'],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
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
