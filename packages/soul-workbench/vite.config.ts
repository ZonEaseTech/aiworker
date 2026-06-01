import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const packageRoot = fileURLToPath(new URL('.', import.meta.url))
const workbenchDist = fileURLToPath(new URL('./dist/web/workbench', import.meta.url))

// The SDK common workbench is a mounted micro-app served by the daemon under
// `/api/apps/:appId/dist/web/workbench/`, so asset URLs must be relative (`base:
// './'`). soul-app-sdk copies this build output into a Soul's dist for the
// sdk-common fallback.
export default defineConfig({
  root: packageRoot,
  base: './',
  plugins: [react()],
  build: {
    outDir: workbenchDist,
    emptyOutDir: true,
    // Stable, content-hash-free asset names: a Soul's committed
    // dist/web/workbench/index.html references these, so a non-deterministic hash
    // would churn the tracked file on every build.
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name][extname]',
        chunkFileNames: 'assets/[name].js',
        entryFileNames: 'assets/[name].js',
      },
    },
  },
})
