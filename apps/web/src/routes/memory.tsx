import type { MemoryEntry, MemoryListResponse, MemorySearchResponse, MemoryType, WriteMemoryInput, WriteMemoryResponse } from '@/features/memory/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { MemoryDetail } from '@/features/memory/MemoryDetail'
import { MemoryList } from '@/features/memory/MemoryList'
import { NewMemoryForm } from '@/features/memory/NewMemoryForm'
import { MEMORY_TYPES } from '@/features/memory/types'
import { apiGet, apiPost } from '@/lib/api'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { cn } from '@/lib/utils'

function MemoryPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [typeFilters, setTypeFilters] = useState<Set<MemoryType>>(() => new Set())
  const [showNewForm, setShowNewForm] = useState(false)

  const listQuery = useQuery({
    queryKey: ['memories', 'list'],
    queryFn: () => apiGet<MemoryListResponse>('/api/memories'),
    enabled: debouncedSearch.trim() === '',
  })

  const searchQuery = useQuery({
    queryKey: ['memories', 'search', debouncedSearch],
    queryFn: () => apiGet<MemorySearchResponse>(`/api/memories/search?q=${encodeURIComponent(debouncedSearch)}`),
    enabled: debouncedSearch.trim() !== '',
  })

  const items: MemoryEntry[] = useMemo(() => {
    if (debouncedSearch.trim() !== '')
      return searchQuery.data?.results ?? []
    return listQuery.data?.memories ?? []
  }, [debouncedSearch, searchQuery.data, listQuery.data])

  const detailQuery = useQuery({
    queryKey: ['memories', 'detail', selectedId],
    queryFn: () => apiGet<MemoryEntry>(`/api/memories/${encodeURIComponent(selectedId!)}`),
    enabled: !!selectedId,
  })

  const createMutation = useMutation({
    mutationFn: (input: WriteMemoryInput) => apiPost<WriteMemoryResponse>('/api/memories', input),
    onSuccess: (data) => {
      toast.success('Memory created', { description: data.filePath })
      queryClient.invalidateQueries({ queryKey: ['memories'] })
      setShowNewForm(false)
      setSelectedId(data.id)
    },
    onError: (err: unknown) => {
      toast.error('Failed to create memory', { description: err instanceof Error ? err.message : 'Unknown error' })
    },
  })

  function toggleTypeFilter(t: MemoryType) {
    setTypeFilters((prev) => {
      const next = new Set(prev)
      if (next.has(t))
        next.delete(t)
      else next.add(t)
      return next
    })
  }

  const isListLoading = debouncedSearch.trim() !== '' ? searchQuery.isLoading : listQuery.isLoading
  const selectedMemory = detailQuery.data

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Memory</h1>
        <Button size="sm" onClick={() => setShowNewForm(v => !v)}>
          <Plus className="size-4" />
          New Memory
        </Button>
      </div>

      {showNewForm && (
        <NewMemoryForm
          onSubmit={input => createMutation.mutate(input)}
          onCancel={() => setShowNewForm(false)}
          isSubmitting={createMutation.isPending}
        />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
        <Card className="flex flex-col">
          <CardHeader className="gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search memories..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-1">
              <FilterPill
                active={typeFilters.size === 0}
                onClick={() => setTypeFilters(new Set())}
              >
                all
              </FilterPill>
              {MEMORY_TYPES.map(t => (
                <FilterPill
                  key={t}
                  active={typeFilters.has(t)}
                  onClick={() => toggleTypeFilter(t)}
                >
                  {t}
                </FilterPill>
              ))}
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto">
            <MemoryList
              items={items}
              selectedId={selectedId}
              onSelect={setSelectedId}
              isLoading={isListLoading}
              typeFilters={typeFilters}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Detail</CardTitle>
          </CardHeader>
          <CardContent>
            <MemoryDetail memory={selectedMemory} isLoading={detailQuery.isLoading && !!selectedId} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

interface FilterPillProps {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}

function FilterPill({ active, onClick, children }: FilterPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'cursor-pointer',
      )}
    >
      <Badge variant={active ? 'default' : 'outline'} className="capitalize">
        {children}
      </Badge>
    </button>
  )
}

export const Route = createFileRoute('/memory')({
  component: MemoryPage,
})
