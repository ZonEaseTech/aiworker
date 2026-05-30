import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { HostControlPlane } from './app'
import './styles/index.css'

// Register the micro-app runtime so the management mount can resolve a worker
// configuration micro-app via `router-mode="search"`.
void import('@micro-zoe/micro-app').then(({ default: microApp }) => {
  microApp.start()
})

const rootElement = document.getElementById('root')
if (!rootElement)
  throw new Error('Root element not found')

createRoot(rootElement).render(
  <StrictMode>
    <HostControlPlane />
  </StrictMode>,
)
