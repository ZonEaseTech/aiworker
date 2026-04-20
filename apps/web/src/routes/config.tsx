import type { AIWorkerConfig } from '@/features/config/types'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfigEditorCard } from '@/features/config/ConfigEditorCard'
import { apiGet } from '@/lib/api'

function ConfigPage() {
  const aiworkerQuery = useQuery({
    queryKey: ['config', 'aiworker'],
    queryFn: () => apiGet<AIWorkerConfig>('/api/config/aiworker'),
  })

  const cfg = aiworkerQuery.data

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Config</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">AIWorker (read-only)</CardTitle>
        </CardHeader>
        <CardContent>
          {aiworkerQuery.isLoading
            ? <Skeleton className="h-40 w-full" />
            : cfg
              ? (
                  <table className="w-full text-sm">
                    <tbody>
                      {Object.entries(cfg).map(([k, v]) => (
                        <tr key={k} className="border-t first:border-t-0">
                          <td className="py-1.5 pr-4 font-mono text-xs text-muted-foreground">{k}</td>
                          <td className="py-1.5 font-mono text-xs">{String(v)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              : <p className="text-sm text-muted-foreground">Failed to load.</p>}
        </CardContent>
      </Card>

      <ConfigEditorCard
        title="Hermes (config.yaml)"
        path="/api/config/hermes"
        filePath={cfg?.HERMES_HOME}
      />

      <ConfigEditorCard
        title="OpenClaw (openclaw.json)"
        path="/api/config/openclaw"
        filePath={cfg?.OPENCLAW_HOME}
      />
    </div>
  )
}

export const Route = createFileRoute('/config')({
  component: ConfigPage,
})
