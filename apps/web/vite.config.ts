/// <reference types="vitest/config" />
import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
// PLAN-022 / FEAT-033：用 tanstackRouterGenerator（纯 routeTree.gen.ts 生成器）
// 而非 composed `tanstackRouter`。后者会同时挂 HMR + code-splitter transforms，
// 两个实例会各往同一 route 文件注入一个 `hot` 变量 → "Duplicate declaration"。
// generator-only 不碰源码，只写产物，可以并存任意数量。
import { tanstackRouterGenerator } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// FEAT-030: dev 代理默认指向 worker 9217
const apiTarget = process.env.AIWORKER_API_URL ?? 'http://localhost:9217'

// PLAN-022 / FEAT-033：双视角 multi-page。fleet 与 worker 各一棵 routeTree、
// 各一个 HTML 入口、各一个 main.tsx。
//
// **构建关键**：fleet 与 worker 必须打成两个**完全独立**的 dist/{fleet,worker}/，
// 各自携带自己的 assets/，因为 fleet 由 gateway 托管、worker 由各 worker 自托管，
// 物理位置不同，不能共享 `../assets/` 的相对引用。
//
// 实现方式：每次 vite build 切一次 root —— `root: apps/web/{bundle}` 让 vite
// 把 entry HTML 当成 root 的 index.html，输出 `dist/{bundle}/index.html`。
// dev 模式（无 env）走默认 root（apps/web），用户访问 /fleet/ 与 /worker/ 各看
// 一棵路由树。

const bundle = process.env.AIWORKER_WEB_BUNDLE as 'fleet' | 'worker' | undefined

const repoWebRoot = fileURLToPath(new URL('.', import.meta.url))
const srcRoot = fileURLToPath(new URL('./src', import.meta.url))
const fleetRoutes = fileURLToPath(new URL('./src/fleet/routes', import.meta.url))
const fleetTree = fileURLToPath(new URL('./src/fleet/routeTree.gen.ts', import.meta.url))
const workerRoutes = fileURLToPath(new URL('./src/worker/routes', import.meta.url))
const workerTree = fileURLToPath(new URL('./src/worker/routeTree.gen.ts', import.meta.url))

const buildRoot = bundle
  ? fileURLToPath(new URL(`./${bundle}`, import.meta.url))
  : repoWebRoot
const buildOutDir = bundle
  ? fileURLToPath(new URL(`./dist/${bundle}`, import.meta.url))
  : fileURLToPath(new URL('./dist', import.meta.url))

export default defineConfig({
  root: buildRoot,
  base: './',
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  plugins: [
    tanstackRouterGenerator({
      target: 'react',
      routesDirectory: fleetRoutes,
      generatedRouteTree: fleetTree,
    }),
    tanstackRouterGenerator({
      target: 'react',
      routesDirectory: workerRoutes,
      generatedRouteTree: workerTree,
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': srcRoot,
    },
  },
  build: {
    outDir: buildOutDir,
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
