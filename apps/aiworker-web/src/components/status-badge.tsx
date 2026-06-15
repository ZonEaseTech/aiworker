import type { ReactNode } from 'react'

import type { Tone } from '@/lib/admin-data'
import { Badge } from '@/components/ui/badge'

interface StatusBadgeProps {
  tone: Tone
  children: ReactNode
}

export function StatusBadge({ tone, children }: StatusBadgeProps) {
  return <Badge variant={tone}>{children}</Badge>
}
