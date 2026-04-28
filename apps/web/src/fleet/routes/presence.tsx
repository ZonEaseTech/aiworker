import { createFileRoute } from '@tanstack/react-router'
import { PresenceCard } from '@/fleet/features/presence/components/presence-card'

function PresencePage() {
  return <PresenceCard />
}

export const Route = createFileRoute('/presence')({
  component: PresencePage,
})
