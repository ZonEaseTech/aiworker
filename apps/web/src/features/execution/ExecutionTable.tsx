import type { ExecutionLog } from './types'
import { formatDistanceToNow } from 'date-fns'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Fragment, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

interface ExecutionTableProps {
  executions: ExecutionLog[]
  isLoading: boolean
}

export function ExecutionTable({ executions, isLoading }: ExecutionTableProps) {
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set())

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {['a', 'b', 'c', 'd', 'e'].map(k => (
          <Skeleton key={k} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  if (executions.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No executions logged yet.</p>
  }

  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id))
        next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="overflow-hidden rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="w-8" />
            <th className="px-3 py-2 text-left">Tool</th>
            <th className="px-3 py-2 text-left">Issue</th>
            <th className="px-3 py-2 text-right">Duration</th>
            <th className="px-3 py-2 text-left">When</th>
          </tr>
        </thead>
        <tbody>
          {executions.map((log) => {
            const isOpen = expanded.has(log.id)
            return (
              <Fragment key={log.id}>
                <tr
                  className="cursor-pointer border-t hover:bg-muted/30"
                  onClick={() => toggle(log.id)}
                >
                  <td className="px-2 py-2 align-middle">
                    {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  </td>
                  <td className="px-3 py-2 font-medium">{log.toolName}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline">{log.issueId}</Badge>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {log.duration != null ? `${log.duration}ms` : '—'}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                  </td>
                </tr>
                {isOpen && (
                  <tr className="border-t bg-muted/10">
                    <td colSpan={5} className="px-4 py-3">
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                          <div className="mb-1 text-xs font-semibold text-muted-foreground">Params</div>
                          <pre className="max-h-64 overflow-auto rounded-md bg-background p-2 text-xs">
                            {JSON.stringify(log.params ?? {}, null, 2)}
                          </pre>
                        </div>
                        <div>
                          <div className="mb-1 text-xs font-semibold text-muted-foreground">Result</div>
                          <pre className="max-h-64 overflow-auto rounded-md bg-background p-2 text-xs">
                            {JSON.stringify(log.result ?? {}, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
