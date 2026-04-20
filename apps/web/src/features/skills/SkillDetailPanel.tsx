import type { Skill } from './types'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { apiGet } from '@/lib/api'
import { SourceBadge } from './SourceBadge'

interface SkillDetailPanelProps {
  name: string
  onClose: () => void
}

export function SkillDetailPanel({ name, onClose }: SkillDetailPanelProps) {
  const query = useQuery({
    queryKey: ['skills', 'detail', name],
    queryFn: () => apiGet<Skill>(`/api/skills/${encodeURIComponent(name)}`),
  })

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        aria-label="Close panel"
        className="flex-1 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside className="flex h-full w-full max-w-md flex-col border-l bg-background shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="truncate text-sm font-semibold">{name}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {query.isLoading && (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}
          {query.isError && (
            <p className="text-sm text-destructive">Failed to load skill.</p>
          )}
          {query.data && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <SourceBadge source={query.data.source} />
                <Badge variant="outline">
                  v
                  {query.data.version}
                </Badge>
              </div>
              <section className="flex flex-col gap-1">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</h3>
                <p className="text-sm leading-relaxed">{query.data.description || '—'}</p>
              </section>
              <section className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Capabilities</h3>
                {query.data.capabilities.length === 0
                  ? <p className="text-sm text-muted-foreground">None declared.</p>
                  : (
                      <ul className="flex flex-wrap gap-1.5">
                        {query.data.capabilities.map(cap => (
                          <li key={cap}>
                            <Badge variant="secondary">{cap}</Badge>
                          </li>
                        ))}
                      </ul>
                    )}
              </section>
              <section className="flex flex-col gap-1">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Identifier</h3>
                <code className="break-all rounded bg-muted px-2 py-1 text-xs">{query.data.id}</code>
              </section>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
