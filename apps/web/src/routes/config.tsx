import type { ConfigResponse } from '@/features/config/types'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { apiGet } from '@/lib/api'

interface KvRowProps {
  label: string
  value: React.ReactNode
}

function KvRow({ label, value }: KvRowProps) {
  return (
    <tr className="border-t first:border-t-0">
      <td className="w-44 py-1.5 pr-4 text-xs text-muted-foreground">{label}</td>
      <td className="py-1.5 font-mono text-xs">{value}</td>
    </tr>
  )
}

function ConfigPage() {
  const configQuery = useQuery({
    queryKey: ['config'],
    queryFn: () => apiGet<ConfigResponse>('/api/config'),
  })

  const cfg = configQuery.data

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Config</h1>
        <p className="text-sm text-muted-foreground">Read-only view of Brain and Executor configuration. Secrets are never exposed.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Brain (Hermes)</CardTitle>
        </CardHeader>
        <CardContent>
          {configQuery.isLoading
            ? <Skeleton className="h-20 w-full" />
            : cfg
              ? (
                  <table className="w-full text-sm">
                    <tbody>
                      <KvRow label="API URL" value={cfg.brain.apiUrl || '—'} />
                      <KvRow label="Home path" value={cfg.brain.homePath || '—'} />
                    </tbody>
                  </table>
                )
              : <p className="text-sm text-muted-foreground">Failed to load.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Executor</CardTitle>
        </CardHeader>
        <CardContent>
          {configQuery.isLoading
            ? <Skeleton className="h-20 w-full" />
            : cfg
              ? (
                  <table className="w-full text-sm">
                    <tbody>
                      <KvRow label="Base URL" value={cfg.executor.baseUrl || '—'} />
                      <KvRow label="Model" value={cfg.executor.model || '—'} />
                      <KvRow
                        label="API key configured"
                        value={(
                          <Badge variant={cfg.executor.apiKeySet ? 'success' : 'destructive'}>
                            {cfg.executor.apiKeySet ? 'yes' : 'no'}
                          </Badge>
                        )}
                      />
                    </tbody>
                  </table>
                )
              : <p className="text-sm text-muted-foreground">Failed to load.</p>}
        </CardContent>
      </Card>
    </div>
  )
}

export const Route = createFileRoute('/config')({
  component: ConfigPage,
})
