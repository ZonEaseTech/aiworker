import type { Conflict, ConflictResolution, ConflictsListResponse } from './types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { apiGet, apiPost } from '@/lib/api'

type ResolutionAction = Exclude<ConflictResolution, 'pending'>

const RESOLUTION_OPTIONS: { value: ResolutionAction, label: string }[] = [
  { value: 'brain', label: 'Use Brain' },
  { value: 'executor', label: 'Use Executor' },
  { value: 'manual', label: 'Mark Manual' },
]

interface ResolveVariables {
  id: number
  resolution: ResolutionAction
}

function shortHash(hash: string) {
  return hash.length > 8 ? hash.slice(0, 8) : hash
}

interface ConflictRowProps {
  conflict: Conflict
  isPending: boolean
  isSubmitting: boolean
  onResolve: (vars: ResolveVariables) => void
}

function ConflictRow({ conflict, isPending, isSubmitting, onResolve }: ConflictRowProps) {
  const [selected, setSelected] = useState<ResolutionAction>('brain')
  return (
    <li className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <span className="font-medium">{conflict.skillName}</span>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(conflict.createdAt), { addSuffix: true })}
          </span>
        </div>
        <Badge variant={isPending ? 'warning' : 'secondary'}>
          {conflict.resolution}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>Brain:</span>
          <code className="rounded bg-muted px-1.5 py-0.5">{shortHash(conflict.brainHash)}</code>
        </div>
        <div className="flex items-center gap-2">
          <span>Executor:</span>
          <code className="rounded bg-muted px-1.5 py-0.5">{shortHash(conflict.executorHash)}</code>
        </div>
      </div>
      {isPending && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="flex h-8 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm"
            value={selected}
            onChange={e => setSelected(e.target.value as ResolutionAction)}
            disabled={isSubmitting}
          >
            {RESOLUTION_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={isSubmitting}
            onClick={() => onResolve({ id: conflict.id, resolution: selected })}
          >
            Resolve
          </Button>
        </div>
      )}
    </li>
  )
}

export function ConflictsTab() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['skills', 'conflicts'],
    queryFn: () => apiGet<ConflictsListResponse>('/api/skills/conflicts'),
  })

  const resolve = useMutation({
    mutationFn: ({ id, resolution }: ResolveVariables) =>
      apiPost<Conflict>(`/api/skills/conflicts/${id}/resolve`, { resolution }),
    onSuccess: (result) => {
      toast.success('Conflict resolved', {
        description: `${result.skillName} -> ${result.resolution}`,
      })
      queryClient.invalidateQueries({ queryKey: ['skills', 'conflicts'] })
    },
    onError: () => {
      toast.error('Failed to resolve conflict')
    },
  })

  const pending = query.data?.conflicts.filter(c => c.resolution === 'pending') ?? []

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold">Conflicts</h2>
        <p className="text-sm text-muted-foreground">
          {query.data
            ? `${pending.length} pending / ${query.data.total} total`
            : 'Loading...'}
        </p>
      </div>

      {query.isLoading && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {query.data && query.data.total === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No conflicts recorded.
        </Card>
      )}

      {query.data && query.data.total > 0 && (
        <ul className="flex flex-col gap-3">
          {query.data.conflicts.map(conflict => (
            <ConflictRow
              key={conflict.id}
              conflict={conflict}
              isPending={conflict.resolution === 'pending'}
              isSubmitting={resolve.isPending}
              onResolve={vars => resolve.mutate(vars)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
