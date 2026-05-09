import { createFileRoute } from '@tanstack/react-router'
import { ReviewsPanel } from '@/worker/features/workbench/loop-panels'

export const Route = createFileRoute('/reviews')({
  component: ReviewsPanel,
})
