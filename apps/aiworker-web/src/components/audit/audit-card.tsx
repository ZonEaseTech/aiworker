import { StatusBadge } from '@/components/status-badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { adminConsoleData } from '@/lib/admin-data'

export function AuditCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>最近审计事件</CardTitle>
        <CardDescription>所有事件都是 AIWorker 元数据事件，不含 Paseo 会话内容。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {adminConsoleData.recentAuditEvents.map(event => (
          <div key={event.id} className="flex items-start gap-3 rounded-md border p-3">
            <StatusBadge tone={event.tone}>{event.at}</StatusBadge>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground">{event.action}</p>
              <p className="mt-1 truncate font-mono text-[0.625rem] text-muted-foreground">{event.target}</p>
              <p className="mt-1 text-[0.625rem] text-muted-foreground">{event.actor}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
