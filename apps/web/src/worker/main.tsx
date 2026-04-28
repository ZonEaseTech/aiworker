import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from '@/shared/components/ui/sonner'
import { queryClient } from '@/shared/lib/queryClient'
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
// FEAT-035：worker bundle 通过 `/admin/*` 路径由 worker apps/api 直接 serve。
// `basepath: '/admin'` 让 file-based routes（`/`, `/config`, ...）映射到
// `/admin/`, `/admin/config`，与浏览器实际地址对齐。dev mode（5173）按相同
// 配置工作——无 `/admin` 前缀时 router 会重定向到 `/admin/`。
const router = createRouter({
  routeTree,
  basepath: '/admin',
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
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </StrictMode>,
)
