import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { HostControlPlane } from './app'
import './styles/index.css'

const rootElement = document.getElementById('root')
if (!rootElement)
  throw new Error('Root element not found')

createRoot(rootElement).render(
  <StrictMode>
    <HostControlPlane />
  </StrictMode>,
)
