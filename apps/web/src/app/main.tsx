import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WorkerStudio } from '../worker/worker-studio'
import '../worker/studio.css'

const rootElement = document.getElementById('root')
if (!rootElement)
  throw new Error('Root element not found')

createRoot(rootElement).render(
  <StrictMode>
    <WorkerStudio />
  </StrictMode>,
)
