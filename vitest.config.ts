import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const yamlRawPlugin = {
  name: 'yaml-raw',
  load(id: string) {
    const path = id.split('?', 1)[0]
    if (!path.endsWith('.yaml')) return null
    return `export default ${JSON.stringify(readFileSync(path, 'utf8'))}`
  },
}

const aliases = {
  '@': fileURLToPath(new URL('./src', import.meta.url)),
}

export default defineConfig({
  resolve: {
    alias: aliases,
  },
  test: {
    projects: [
      {
        plugins: [yamlRawPlugin],
        resolve: { alias: aliases },
        test: {
          name: 'domain',
          environment: 'node',
          include: [
            'src/domain/**/*.test.ts',
            'src/rulepack/**/*.test.ts',
            'tests/**/*.test.ts',
          ],
        },
      },
      {
        plugins: [react(), yamlRawPlugin],
        resolve: { alias: aliases },
        test: {
          name: 'ui',
          environment: 'jsdom',
          setupFiles: ['./vitest.ui.setup.test.ts'],
          include: [
            'src/components/**/*.test.tsx',
            'src/app/**/*.test.tsx',
            'src/lib/**/*.test.ts',
            'src/lib/**/*.test.tsx',
          ],
        },
      },
    ],
  },
})
