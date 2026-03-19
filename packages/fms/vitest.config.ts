import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@open-mercato/shared': resolve(__dirname, '../shared/src'),
      '@open-mercato/core': resolve(__dirname, '../core/src'),
      '@open-mercato/ui': resolve(__dirname, '../ui/src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    root: resolve(__dirname),
    include: ['src/**/__tests__/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/__integration__/**'],
  },
})
