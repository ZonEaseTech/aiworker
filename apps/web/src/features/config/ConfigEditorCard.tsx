import type { ConfigResponse, ConfigUpdateResponse } from './types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { apiGet, apiPut } from '@/lib/api'

interface ConfigEditorCardProps {
  title: string
  path: string
  filePath?: string
}

export function ConfigEditorCard({ title, path, filePath }: ConfigEditorCardProps) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<string | null>(null)

  const configQuery = useQuery({
    queryKey: ['config', path],
    queryFn: () => apiGet<ConfigResponse>(path),
  })

  const serverText = useMemo(
    () => (configQuery.data ? JSON.stringify(configQuery.data.config, null, 2) : ''),
    [configQuery.data],
  )
  const text = draft ?? serverText
  const dirty = draft !== null && draft !== serverText

  const saveMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPut<ConfigUpdateResponse>(path, body),
    onSuccess: (data) => {
      toast.success('Saved (backup created)', { description: data.backupPath })
      queryClient.invalidateQueries({ queryKey: ['config', path] })
      setDraft(null)
    },
    onError: (err: unknown) => {
      toast.error('Save failed', { description: err instanceof Error ? err.message : 'Unknown error' })
    },
  })

  function handleSave() {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    }
    catch (e) {
      toast.error('Invalid JSON', { description: e instanceof Error ? e.message : 'Parse error' })
      return
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      toast.error('Config must be a JSON object')
      return
    }
    saveMutation.mutate(parsed as Record<string, unknown>)
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-1">
        <CardTitle className="text-base">{title}</CardTitle>
        {filePath && (
          <p className="text-xs text-muted-foreground">{filePath}</p>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {configQuery.isLoading
          ? <Skeleton className="h-64 w-full" />
          : (
              <textarea
                className="min-h-64 w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={text}
                onChange={e => setDraft(e.target.value)}
                spellCheck={false}
              />
            )}
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending || !dirty}>
            <Save className="size-4" />
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </Button>
          {dirty && <span className="text-xs text-amber-600 dark:text-amber-400">Unsaved changes</span>}
        </div>
      </CardContent>
    </Card>
  )
}
