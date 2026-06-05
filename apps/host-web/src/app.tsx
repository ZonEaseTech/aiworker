import { Badge, BadgeLabel } from '@zonease/aiworker-ui/components/badge'
import { Button } from '@zonease/aiworker-ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@zonease/aiworker-ui/components/card'

export type AssignmentStatus =
  | 'draft'
  | 'provisioning'
  | 'checked_in'
  | 'access_ready'
  | 'ready'
  | 'needs_attention'
  | 'revoked'
  | 'archived'

export interface HostAssignmentSummary {
  assignedEmail: string
  serverRef: string
  soulReleaseRef: string
  status: AssignmentStatus
  workerId: null | string
  workbenchUrl: null | string
}

export const defaultAssignments: HostAssignmentSummary[] = [
  {
    assignedEmail: 'alice@example.com',
    serverRef: 'aissh://server/ap-sg-01',
    soulReleaseRef: 'aiworker-freeform@2026.06.01',
    status: 'ready',
    workerId: 'worker-alice',
    workbenchUrl: 'https://workers.example.com/alice',
  },
  {
    assignedEmail: 'ben@example.com',
    serverRef: 'aissh://server/ap-sg-02',
    soulReleaseRef: 'aiworker-support@2026.06.01',
    status: 'provisioning',
    workerId: null,
    workbenchUrl: null,
  },
]

export interface HostControlPlaneProps {
  assignments?: HostAssignmentSummary[]
}

function statusLabel(status: AssignmentStatus) {
  switch (status) {
    case 'ready':
      return '已可用'
    case 'needs_attention':
      return '需处理'
    case 'revoked':
      return '已撤销'
    case 'archived':
      return '已归档'
    default:
      return '开通中'
  }
}

export function HostControlPlane({ assignments = defaultAssignments }: HostControlPlaneProps = {}) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">AI Workers</h1>
          <p className="text-muted-foreground text-sm">
            管理员工 AI Worker 的开通状态和 Worker 入口。
          </p>
        </div>
        <Button type="button" className="w-full sm:w-auto">开通 AI Worker</Button>
      </header>

      <Card data-slot="host-worker-assignments">
        <CardHeader>
          <CardTitle>开通清单</CardTitle>
          <CardDescription>每个员工绑定一个 Soul release 和 aissh server。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {assignments.map((assignment) => {
            const workerUrl = assignment.status === 'ready' ? assignment.workbenchUrl : null

            return (
              <section
                key={`${assignment.assignedEmail}-${assignment.soulReleaseRef}`}
                className="grid min-w-0 gap-3 rounded-md border border-border p-3 sm:grid-cols-[minmax(12rem,1.4fr)_minmax(11rem,1fr)_minmax(11rem,1fr)_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="text-muted-foreground text-xs">员工邮箱</p>
                  <p className="truncate text-sm font-medium">{assignment.assignedEmail}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {assignment.workerId ?? 'Worker 待创建'}
                  </p>
                </div>

                <div className="min-w-0">
                  <p className="text-muted-foreground text-xs">aissh server</p>
                  <p className="truncate text-sm font-medium">{assignment.serverRef}</p>
                </div>

                <div className="min-w-0">
                  <p className="text-muted-foreground text-xs">Soul release</p>
                  <p className="truncate text-sm font-medium">{assignment.soulReleaseRef}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <Badge variant={assignment.status === 'ready' ? 'default' : 'secondary'}>
                    <BadgeLabel>{statusLabel(assignment.status)}</BadgeLabel>
                  </Badge>
                  {workerUrl
                    ? (
                        <Button asChild size="sm" variant="outline">
                          <a href={workerUrl}>打开 Worker</a>
                        </Button>
                      )
                    : null}
                </div>
              </section>
            )
          })}
        </CardContent>
      </Card>
    </main>
  )
}
