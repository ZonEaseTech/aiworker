import { createFileRoute } from '@tanstack/react-router'
import { ConfigEditor } from '@/worker/features/config'

export const Route = createFileRoute('/settings')({
  component: ConfigEditor,
})
