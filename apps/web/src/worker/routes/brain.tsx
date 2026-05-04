import { createFileRoute } from '@tanstack/react-router'

import { BrainPanel } from '@/worker/features/brain/brain-panel'

export const Route = createFileRoute('/brain')({
  component: BrainPanel,
})
