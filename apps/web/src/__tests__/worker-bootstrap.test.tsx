import { QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { queryClient } from '@/shared/lib/queryClient'
import { routeTree } from '@/worker/routeTree.gen'

describe('worker bundle bootstrap', () => {
  it('imports the worker routeTree without throwing', () => {
    // routeTree 是 TanStack Router plugin 在构建期生成的产物；能 import 通过即
    // 证明：1) `apps/web/src/worker/routes/*` 全部 transpile OK；2) shared 资源
    //       链路完整；3) Phase 3 worker UI MVP 闭环。
    expect(routeTree).toBeDefined()
  })

  it('mounts the worker RouterProvider with the overview shell', async () => {
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/'] }),
      defaultPreload: false,
    })

    await router.load()

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    // 侧边栏与 top-bar 都标注 worker 视角；"概览" 为 index 路由的 h1 文案，
    // 命中即说明 root layout + outlet 子节点都成功 mount。
    expect(await screen.findByText(/AIWorker · Worker/)).toBeTruthy()
    expect(await screen.findByRole('heading', { name: '概览' })).toBeTruthy()
  })
})
