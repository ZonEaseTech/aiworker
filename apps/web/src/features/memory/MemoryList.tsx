import type { MemoryEntry, MemoryType } from './types'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { memoryDescription, memoryType } from './types'

interface MemoryListProps {
  items: MemoryEntry[]
  selectedId: string | null
  onSelect: (id: string) => void
  isLoading: boolean
  typeFilters: Set<MemoryType>
}

function typeBadgeVariant(type: MemoryType | 'unknown') {
  switch (type) {
    case 'feedback': return 'warning' as const
    case 'project': return 'secondary' as const
    case 'reference': return 'outline' as const
    case 'user': return 'default' as const
    default: return 'outline' as const
  }
}

export function MemoryList({ items, selectedId, onSelect, isLoading, typeFilters }: MemoryListProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {['a', 'b', 'c', 'd'].map(k => (
          <Skeleton key={k} className="h-16 w-full" />
        ))}
      </div>
    )
  }

  const filtered = typeFilters.size === 0
    ? items
    : items.filter((m) => {
        const t = memoryType(m)
        return t !== 'unknown' && typeFilters.has(t)
      })

  if (filtered.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">No memories found.</p>
  }

  return (
    <ul className="flex flex-col gap-1">
      {filtered.map((m) => {
        const t = memoryType(m)
        const desc = memoryDescription(m)
        const active = m.id === selectedId
        return (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => onSelect(m.id)}
              className={cn(
                'flex w-full flex-col gap-1 rounded-md border border-transparent px-3 py-2 text-left transition-colors hover:bg-accent hover:text-accent-foreground',
                active && 'border-border bg-accent text-accent-foreground',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{m.title}</span>
                <Badge variant={typeBadgeVariant(t)} className="shrink-0 capitalize">
                  {t}
                </Badge>
              </div>
              {desc && (
                <span className="line-clamp-2 text-xs text-muted-foreground">{desc}</span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
