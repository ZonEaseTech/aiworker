import { createRouter, RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { resolveWebRouterBasepath } from '@/shared/lib/router-basepath'
import { bootstrapTheme, ThemeInitializer } from '@/shared/stores/theme'
import { routeTree } from './routeTree.gen'
import '@/shared/styles/globals.css'

bootstrapTheme('worker')

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
    <ThemeInitializer scope="worker" />
    <RouterProvider router={router} />
  </StrictMode>,
)
