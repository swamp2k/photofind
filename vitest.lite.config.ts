import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/renderer/src/lite/**/*.test.ts'],
    environment: 'node'
  }
})
