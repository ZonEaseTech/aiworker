import { createFileRoute } from '@tanstack/react-router'
import { CasesPanel } from '@/worker/features/cases/cases-panel'

export const Route = createFileRoute('/cases')({
  component: CasesPanel,
})
