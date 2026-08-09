import { readFileSync } from 'node:fs'

import { defineConfig } from 'vitest/config'

const yamlRawPlugin = {
  name: 'yaml-raw',
  load(id: string) {
    const path = id.split('?', 1)[0]
    if (!path.endsWith('.yaml')) return null
    return `export default ${JSON.stringify(readFileSync(path, 'utf8'))}`
  },
}

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [yamlRawPlugin],
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
    ],
  },
})
