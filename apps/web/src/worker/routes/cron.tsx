import { createFileRoute } from '@tanstack/react-router'
import { CronPanel } from '@/worker/features/cron/cron-panel'

export const Route = createFileRoute('/cron')({
  component: CronPanel,
})
