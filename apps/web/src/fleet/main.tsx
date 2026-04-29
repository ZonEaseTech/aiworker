import { QueryClientProvider } from '@tanstack/react-query'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from '@/shared/components/ui/sonner'
import { queryClient } from '@/shared/lib/queryClient'
import { resolveWebRouterBasepath } from '@/shared/lib/router-basepath'
import { bootstrapTheme, ThemeInitializer } from '@/shared/stores/theme'
import { routeTree } from './routeTree.gen'
import '@/shared/styles/globals.css'

bootstrapTheme('fleet')

const router = createRouter({
  routeTree,
  basepath: resolveWebRouterBasepath('fleet'),
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('root')
if (!rootElement)
  throw new Error('Root element not found')

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeInitializer scope="fleet" />
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>
  </StrictMode>,
)
