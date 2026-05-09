import { createFileRoute } from '@tanstack/react-router'
import { LessonsPanel } from '@/worker/features/workbench/loop-panels'

export const Route = createFileRoute('/lessons')({
  component: LessonsPanel,
})
