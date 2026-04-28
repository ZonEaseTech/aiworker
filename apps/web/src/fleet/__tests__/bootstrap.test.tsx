import { QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { routeTree } from '@/fleet/routeTree.gen'
import { queryClient } from '@/shared/lib/queryClient'

describe('fleet bundle bootstrap', () => {
  it('imports the fleet routeTree without throwing', () => {
    // routeTree 是 TanStack Router plugin 在构建期生成的产物。能 import 通过即
    // 证明：1) `apps/web/src/fleet/routes/*` 全部 transpile OK（路径别名链路正确）；
    //       2) shared 资源的引用链没断；3) Phase 1 双视角骨架闭环。
    expect(routeTree).toBeDefined()
  })

  it('mounts the fleet RouterProvider with the generated routeTree', async () => {
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/workers'] }),
      defaultPreload: false,
    })

    // 等待 lazy 路由 chunk 完成首次 load，避免首帧空 body。
    await router.load()

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    // 侧边栏与 header 都含 'AIWorker' 文案——任意命中即说明 root layout 渲染成功。
    expect(await screen.findAllByText(/AIWorker/i)).not.toHaveLength(0)
  })
})
