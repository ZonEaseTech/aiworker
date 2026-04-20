import type { MemoryEntry } from './types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { memoryDescription, memoryType } from './types'

interface MemoryDetailProps {
  memory: MemoryEntry | undefined
  isLoading: boolean
}

export function MemoryDetail({ memory, isLoading }: MemoryDetailProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!memory) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Select a memory to view its contents.
      </div>
    )
  }

  const type = memoryType(memory)
  const desc = memoryDescription(memory)
  const metadataEntries = Object.entries(memory.metadata ?? {}).filter(
    ([k]) => k !== 'description' && k !== 'type',
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-semibold tracking-tight">{memory.title}</h2>
        <Badge variant="secondary" className="capitalize">{type}</Badge>
      </div>
      {desc && <p className="text-sm text-muted-foreground">{desc}</p>}
      <p className="text-xs text-muted-foreground">{memory.filePath}</p>

      {metadataEntries.length > 0 && (
        <>
          <Separator />
          <div className="flex flex-col gap-1 text-xs">
            {metadataEntries.map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <span className="font-medium text-muted-foreground">
                  {k}
                  :
                </span>
                <span className="text-foreground">{typeof v === 'string' ? v : JSON.stringify(v)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <Separator />

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled
          title="Coming soon"
        >
          Edit
        </Button>
      </div>

      <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-4 text-xs leading-relaxed">
        {memory.content}
      </pre>
    </div>
  )
}
