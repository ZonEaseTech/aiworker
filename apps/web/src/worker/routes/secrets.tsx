import { createFileRoute } from '@tanstack/react-router'
import { SecretsPanel } from '@/worker/features/secrets/secrets-panel'

export const Route = createFileRoute('/secrets')({
  component: SecretsPanel,
})
