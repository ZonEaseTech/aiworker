/// <reference types="vitest/config" />
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const apiTarget = process.env.AIWORKER_API_URL ?? 'http://localhost:9217'

const repoWebRoot = fileURLToPath(new URL('.', import.meta.url))
const srcRoot = fileURLToPath(new URL('./src', import.meta.url))
const workerDist = fileURLToPath(new URL('./dist/worker', import.meta.url))

function markdownTextImports() {
  return {
    name: 'aiworker-markdown-text-imports',
    enforce: 'pre' as const,
    async load(id: string) {
      const [rawFilename] = id.split('?', 1)
      if (!rawFilename?.endsWith('.md'))
        return null
      const filename = rawFilename.startsWith('/@fs/')
        ? rawFilename.slice('/@fs'.length)
        : rawFilename
      const source = await readFile(filename, 'utf8')
      return {
        code: `export default ${JSON.stringify(source)};`,
        map: null,
      }
    },
  }
}

export default defineConfig({
  root: repoWebRoot,
  // Relative base so the built index.html references `./assets/...` instead of
  // origin-absolute `/assets/...`. When the Workbench is served behind the Host
  // tunnel prefix `/workers/:id/`, absolute asset URLs would hit the Host root
  // (404); relative URLs resolve under the prefix. Standalone (root entry) is
  // unaffected because `./` resolves to `/` at the root.
  base: './',
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  plugins: [
    markdownTextImports(),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': srcRoot,
    },
  },
  build: {
    outDir: workerDist,
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true, ws: true },
      '/health': { target: apiTarget, changeOrigin: true },
      '/openapi.json': { target: apiTarget, changeOrigin: true },
      '/docs': { target: apiTarget, changeOrigin: true },
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
  },
})
