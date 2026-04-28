import type { ListAuditEventsInput } from '@/fleet/api'
import { useQuery } from '@tanstack/react-query'
import { listAuditEvents } from '@/fleet/api'

const AUDIT_KEY = ['fleet', 'audit'] as const

export function useAuditEvents(input: ListAuditEventsInput) {
  return useQuery({
    queryKey: [...AUDIT_KEY, input],
    queryFn: () => listAuditEvents(input),
    staleTime: 5_000,
  })
}
