import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'

const packageRoot = fileURLToPath(new URL('.', import.meta.url))
const entry = fileURLToPath(new URL('./src/main.tsx', import.meta.url))
const workbenchDist = fileURLToPath(new URL('./dist/web/workbench', import.meta.url))

// The SDK common workbench is a mounted micro-app served by the daemon under
// `/api/apps/:appId/.../`, so asset URLs must be relative (`base: './'`).
//
// IIFE (classic, non-ESM) output is required: micro-app's sandbox executes the
// mounted bundle via `new Function`, which cannot run an ES module (the `<script
// type="module">` an app build emits throws `SyntaxError` in the sandbox). The
// static shell lives in public/index.html and loads this bundle with a classic
// `<script src="./assets/index.js">`. Stable, hash-free names keep the committed
// Soul dist from churning.
export default defineConfig({
  root: packageRoot,
  base: './',
  // tailwindcss(): build the packages/ui design system + workbench classes.
  // cssInjectedByJsPlugin(): inline the emitted CSS into the IIFE bundle so the
  // classic-script mounted shell needs no separate stylesheet link (the mount
  // serves only the entry html + the JS bundle).
  plugins: [react(), tailwindcss(), cssInjectedByJsPlugin()],
  // Vite lib mode does NOT replace `process.env.NODE_ENV` (it assumes the
  // consumer's bundler does). The micro-app sandbox has no `process`, so React's
  // production checks throw `ReferenceError: process is not defined`. Replace the
  // reference at build time so the bundle is self-contained.
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: workbenchDist,
    emptyOutDir: true,
    copyPublicDir: true,
    lib: {
      entry,
      fileName: () => 'assets/index.js',
      formats: ['iife'],
      name: 'AiworkerCommonWorkbench',
    },
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
})
