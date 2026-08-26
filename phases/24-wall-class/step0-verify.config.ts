import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../../src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: [fileURLToPath(new URL('../../vitest.ui.setup.test.ts', import.meta.url))],
    include: ['phases/24-wall-class/step0-verify.test.tsx'],
  },
})
