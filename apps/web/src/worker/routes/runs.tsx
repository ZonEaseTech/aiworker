import { createFileRoute } from '@tanstack/react-router'
import { RunsPanel } from '@/worker/features/workbench/loop-panels'

export const Route = createFileRoute('/runs')({
  component: RunsPanel,
})
