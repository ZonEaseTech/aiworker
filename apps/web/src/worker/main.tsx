import { QueryClientProvider } from '@tanstack/react-query'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from '@/shared/components/ui/sonner'
import { queryClient } from '@/shared/lib/queryClient'
import { resolveWebRouterBasepath } from '@/shared/lib/router-basepath'
import { bootstrapTheme, ThemeInitializer } from '@/shared/stores/theme'
import { bootstrapBearerFromLocation } from './lib/auth'
import { routeTree } from './routeTree.gen'
import '@/shared/styles/globals.css'

bootstrapTheme('worker')

// FEAT-035 §验收 8：URL fragment `#token=<bearer>` → sessionStorage，并立即
// 清掉 hash。必须在 router 挂载前调，避免首帧无鉴权请求。
bootstrapBearerFromLocation()

// 不挂全局 `declare module '@tanstack/react-router'`：fleet/main.tsx 已注册了
// 全局 router 类型，两个 bundle 的 router 形态不同，重复声明会触发 TS2717。
//
// FEAT-035 + BUG-022：生产由 worker apps/api 挂到 `/admin/*`，dev chooser
// 则挂到 `/worker/*`；basepath 根据当前 pathname 推导，保持两种入口都可用。
const router = createRouter({
  routeTree,
  basepath: resolveWebRouterBasepath('worker'),
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
      <ThemeInitializer scope="worker" />
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>
  </StrictMode>,
)
