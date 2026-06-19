import { StatusBadge } from '@/components/status-badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { adminConsoleData } from '@/lib/admin-data'

export function AuditCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>最近操作记录</CardTitle>
        <CardDescription>只记录管理员开通动作，不显示员工对话内容。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {adminConsoleData.recentAuditEvents.map(event => (
          <div key={event.id} className="flex items-start gap-3 rounded-md border p-3">
            <StatusBadge tone={event.tone}>{event.at}</StatusBadge>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground">{event.action}</p>
              <p className="mt-1 text-[0.625rem] text-muted-foreground">{event.actor}</p>
              <details className="mt-1">
                <summary className="cursor-pointer text-[0.625rem] text-muted-foreground">支持信息</summary>
                <p className="mt-1 truncate font-mono text-[0.625rem] text-muted-foreground">{event.target}</p>
              </details>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
