import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from '@/shared/components/ui/sonner'
import { queryClient } from '@/shared/lib/queryClient'
import { ThemeInitializer } from '@/shared/stores/theme'
import { routeTree } from './routeTree.gen'
import '@/shared/styles/globals.css'

// 不挂全局 `declare module '@tanstack/react-router'`：fleet/main.tsx 已注册了
// 全局 router 类型，两个 bundle 的 router 形态不同，重复声明会触发 TS2717。
// 运行时各自独立，类型上 worker bundle 暂用非全局 router 实例（Phase 2 真正
// 引入业务路由时再视情况引入 per-bundle 的 module 声明）。
const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
})

const rootElement = document.getElementById('root')
if (!rootElement)
  throw new Error('Root element not found')

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeInitializer />
      <RouterProvider router={router} />
      <Toaster />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </StrictMode>,
)
