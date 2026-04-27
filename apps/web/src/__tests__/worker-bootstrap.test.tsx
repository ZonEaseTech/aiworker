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
    expect(routeTree).toBeDefined()
  })

  it('mounts the worker RouterProvider with the placeholder route', async () => {
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

    expect(await screen.findByText(/AIWorker · Worker/)).toBeTruthy()
    expect(await screen.findByText(/Worker 自助管理/)).toBeTruthy()
  })
})
