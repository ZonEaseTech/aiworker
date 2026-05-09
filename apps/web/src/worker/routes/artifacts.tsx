import { createFileRoute } from '@tanstack/react-router'
import { ArtifactsPanel } from '@/worker/features/workbench/loop-panels'

export const Route = createFileRoute('/artifacts')({
  component: ArtifactsPanel,
})
