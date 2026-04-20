import type { DiffEntry, DiffResponse, DiffStatus, SyncDirection, SyncResponse } from './types'
import type { BadgeVariantProps } from '@/components/ui/badge-variants'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { apiGet, apiPost } from '@/lib/api'

const STATUS_VARIANT: Record<DiffStatus, BadgeVariantProps['variant']> = {
  'added-brain': 'success',
  'added-executor': 'success',
  'modified': 'warning',
  'identical': 'secondary',
}

const STATUS_LABEL: Record<DiffStatus, string> = {
  'added-brain': 'Added (Brain)',
  'added-executor': 'Added (Executor)',
  'modified': 'Modified',
  'identical': 'Identical',
}

const DIRECTION_OPTIONS: { value: SyncDirection, label: string }[] = [
  { value: 'bidirectional', label: 'Bidirectional' },
  { value: 'brain-to-executor', label: 'Brain -> Executor' },
  { value: 'executor-to-brain', label: 'Executor -> Brain' },
]

function groupByStatus(entries: DiffEntry[]) {
  const groups: Record<DiffStatus, DiffEntry[]> = {
    'added-brain': [],
    'added-executor': [],
    'modified': [],
    'identical': [],
  }
  for (const entry of entries)
    groups[entry.status].push(entry)
  return groups
}

export function DiffTab() {
  const queryClient = useQueryClient()
  const [direction, setDirection] = useState<SyncDirection>('bidirectional')
  const [menuOpen, setMenuOpen] = useState(false)

  const diff = useQuery({
    queryKey: ['skills', 'diff'],
    queryFn: () => apiGet<DiffResponse>('/api/skills/diff'),
  })

  const sync = useMutation({
    mutationFn: (dir: SyncDirection) =>
      apiPost<SyncResponse>('/api/skills/sync', { direction: dir }),
    onSuccess: (result) => {
      toast.success('Sync completed', {
        description: `${result.synced} synced, ${result.conflicts} conflicts.`,
      })
      queryClient.invalidateQueries({ queryKey: ['skills'] })
    },
    onError: () => {
      toast.error('Sync failed')
    },
  })

  const groups = diff.data ? groupByStatus(diff.data.diff) : null
  const selectedLabel = DIRECTION_OPTIONS.find(o => o.value === direction)?.label ?? direction

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Sync diff</h2>
          <p className="text-sm text-muted-foreground">Differences between Brain and Executor skill sets.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMenuOpen(v => !v)}
              disabled={sync.isPending}
            >
              {selectedLabel}
              <ChevronDown />
            </Button>
            {menuOpen && (
              <>
                <button
                  type="button"
                  aria-label="Close menu"
                  className="fixed inset-0 z-10"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 top-full z-20 mt-1 flex w-56 flex-col rounded-md border bg-popover p-1 shadow-md">
                  {DIRECTION_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setDirection(opt.value)
                        setMenuOpen(false)
                      }}
                      className="rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <Button
            size="sm"
            onClick={() => sync.mutate(direction)}
            disabled={sync.isPending}
          >
            <RefreshCw className={sync.isPending ? 'animate-spin' : ''} />
            Sync all
          </Button>
        </div>
      </div>

      {diff.isLoading && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {groups && diff.data!.total === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No differences found.
        </Card>
      )}

      {groups && diff.data!.total > 0 && (
        <div className="flex flex-col gap-5">
          {(Object.keys(groups) as DiffStatus[]).map((status) => {
            const entries = groups[status]
            if (entries.length === 0)
              return null
            return (
              <section key={status} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">{STATUS_LABEL[status]}</h3>
                  <Badge variant="outline">{entries.length}</Badge>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {entries.map(entry => (
                    <li
                      key={`${status}-${entry.name}`}
                      className="flex items-center justify-between gap-3 rounded-md border bg-card p-3"
                    >
                      <span className="font-medium">{entry.name}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
