import type { AgentTaskStatus } from './types'
import type { BadgeVariantProps } from '@/components/ui/badge-variants'
import { Badge } from '@/components/ui/badge'

const STATUS_VARIANT: Record<AgentTaskStatus, NonNullable<BadgeVariantProps['variant']>> = {
  queued: 'outline',
  running: 'warning',
  succeeded: 'success',
  failed: 'destructive',
  cancelled: 'secondary',
}

interface StatusBadgeProps {
  status: AgentTaskStatus
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <Badge variant={STATUS_VARIANT[status]} className={className}>
      {status}
    </Badge>
  )
}
