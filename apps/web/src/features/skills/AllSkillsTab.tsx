import type { SkillsListResponse } from './types'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { apiGet } from '@/lib/api'
import { SkillDetailPanel } from './SkillDetailPanel'
import { SourceBadge } from './SourceBadge'

export function AllSkillsTab() {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  const query = useQuery({
    queryKey: ['skills', 'list'],
    queryFn: () => apiGet<SkillsListResponse>('/api/skills'),
  })

  const filtered = useMemo(() => {
    const skills = query.data?.skills ?? []
    const trimmed = search.trim().toLowerCase()
    if (!trimmed)
      return skills
    return skills.filter(s => s.name.toLowerCase().includes(trimmed))
  }, [query.data?.skills, search])

  return (
    <div className="flex flex-col gap-4">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search skills by name..."
          className="pl-9"
        />
      </div>

      {query.isLoading
        ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          )
        : filtered.length === 0
          ? (
              <Card className="p-8 text-center text-sm text-muted-foreground">
                {query.data?.skills.length ? 'No skills match your search.' : 'No skills registered yet.'}
              </Card>
            )
          : (
              <ul className="flex flex-col gap-2">
                {filtered.map(skill => (
                  <li key={skill.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(skill.name)}
                      className="flex w-full flex-col gap-2 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{skill.name}</span>
                        <SourceBadge source={skill.source} />
                        <Badge variant="outline">
                          v
                          {skill.version}
                        </Badge>
                      </div>
                      <p className="line-clamp-1 text-sm text-muted-foreground">
                        {skill.description || '—'}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}

      {selected && (
        <SkillDetailPanel name={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
