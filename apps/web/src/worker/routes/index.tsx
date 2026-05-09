import { createFileRoute } from '@tanstack/react-router'
import { WorkbenchPanel } from '@/worker/features/workbench/workbench-panel'

export const Route = createFileRoute('/')({
  component: WorkbenchPanel,
})
