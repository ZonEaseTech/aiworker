/// <reference types="vitest/config" />
import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const hostApiProxyTarget = process.env.AIWORKER_HOST_API_URL ?? 'http://127.0.0.1:9117'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': {
        changeOrigin: true,
        target: hostApiProxyTarget,
      },
      // Operator login/logout/callback must reach the Host in dev too, so the
      // identity + logout controls work behind the Vite dev server.
      '/auth': {
        changeOrigin: true,
        target: hostApiProxyTarget,
      },
      '/workers': {
        changeOrigin: true,
        target: hostApiProxyTarget,
      },
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
  },
})
