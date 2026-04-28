import { createFileRoute } from '@tanstack/react-router'
import { TestPanel } from '@/worker/features/test/test-panel'

export const Route = createFileRoute('/test')({
  component: TestPanel,
})
