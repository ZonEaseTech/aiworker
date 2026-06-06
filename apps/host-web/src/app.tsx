import type { FormEvent } from 'react'
import type {
  AssignmentStatus,
  HostApiClient,
  HostAssignmentSummary,
} from './host-api'

import { Alert, AlertDescription } from '@zonease/aiworker-ui/components/alert'
import { Badge, BadgeLabel } from '@zonease/aiworker-ui/components/badge'
import { Button } from '@zonease/aiworker-ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@zonease/aiworker-ui/components/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@zonease/aiworker-ui/components/empty'
import { Input } from '@zonease/aiworker-ui/components/input'
import { Label } from '@zonease/aiworker-ui/components/label'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { createHostApiClient } from './host-api'

export type { AssignmentStatus, HostAssignmentSummary } from './host-api'

export interface HostControlPlaneProps {
  api?: HostApiClient
}

interface AssignmentFormState {
  assignedEmail: string
  serverRef: string
  soulReleaseRef: string
}

const emptyFormState: AssignmentFormState = {
  assignedEmail: '',
  serverRef: '',
  soulReleaseRef: '',
}

function statusLabel(status: AssignmentStatus | string) {
  switch (status) {
    case 'ready':
      return '可打开 Worker'
    case 'access_ready':
      return '访问通道已就绪'
    case 'checked_in':
      return 'Worker 已报到'
    case 'provisioning':
      return '等待 Worker check-in'
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

function errorMessage(error: unknown): string {
  if (error instanceof Error)
    return error.message
  if (typeof error === 'string')
    return error
  return 'Host API 请求失败'
}

function assignmentKey(assignment: HostAssignmentSummary): string {
  return assignment.assignmentId ?? `${assignment.assignedEmail}-${assignment.soulReleaseRef}`
}

export function HostControlPlane({ api }: HostControlPlaneProps = {}) {
  const hostApi = useMemo(() => api ?? createHostApiClient(), [api])
  const [assignments, setAssignments] = useState<HostAssignmentSummary[]>([])
  const [formState, setFormState] = useState<AssignmentFormState>(emptyFormState)
  const [hasLoadedAssignments, setHasLoadedAssignments] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false)
  const [createError, setCreateError] = useState<null | string>(null)
  const [listError, setListError] = useState<null | string>(null)
  const [lastProvisionCommand, setLastProvisionCommand] = useState<null | string>(null)

  const refreshAssignments = useCallback(async () => {
    setIsLoadingAssignments(true)
    setListError(null)
    try {
      setAssignments(await hostApi.listAssignments())
    }
    catch (error) {
      setListError(errorMessage(error))
    }
    finally {
      setHasLoadedAssignments(true)
      setIsLoadingAssignments(false)
    }
  }, [hostApi])

  useEffect(() => {
    void refreshAssignments()
  }, [refreshAssignments])

  async function handleCreateAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreateError(null)

    const input = {
      assignedEmail: formState.assignedEmail.trim(),
      serverRef: formState.serverRef.trim(),
      soulReleaseRef: formState.soulReleaseRef.trim(),
    }

    setIsCreating(true)
    try {
      const created = await hostApi.createAssignment(input)
      setLastProvisionCommand(created.provisionCommand)
      setFormState(emptyFormState)
      await refreshAssignments()
    }
    catch (error) {
      setCreateError(errorMessage(error))
    }
    finally {
      setIsCreating(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-5 p-4 sm:p-6">
      <header className="min-w-0">
        <h1 className="text-2xl font-semibold">AI Workers</h1>
        <p className="text-muted-foreground text-sm">
          管理员工 AI Worker 的开通状态和 Worker 入口。
        </p>
      </header>

      <Card data-slot="host-assignment-create">
        <CardHeader>
          <CardTitle>创建 assignment</CardTitle>
          <CardDescription>为员工绑定 aissh server 和 Soul release。</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end" onSubmit={handleCreateAssignment}>
            <div className="grid min-w-0 gap-1.5">
              <Label htmlFor="assignedEmail">员工邮箱</Label>
              <Input
                id="assignedEmail"
                autoComplete="email"
                required
                type="email"
                value={formState.assignedEmail}
                onChange={(event) => {
                  setFormState(current => ({ ...current, assignedEmail: event.target.value }))
                }}
              />
            </div>
            <div className="grid min-w-0 gap-1.5">
              <Label htmlFor="serverRef">aissh server</Label>
              <Input
                id="serverRef"
                required
                value={formState.serverRef}
                onChange={(event) => {
                  setFormState(current => ({ ...current, serverRef: event.target.value }))
                }}
              />
            </div>
            <div className="grid min-w-0 gap-1.5">
              <Label htmlFor="soulReleaseRef">Soul release</Label>
              <Input
                id="soulReleaseRef"
                required
                value={formState.soulReleaseRef}
                onChange={(event) => {
                  setFormState(current => ({ ...current, soulReleaseRef: event.target.value }))
                }}
              />
            </div>
            <Button type="submit" disabled={isCreating}>
              {isCreating ? '创建中' : '创建 assignment'}
            </Button>
          </form>

          {createError
            ? (
                <Alert variant="destructive" className="mt-3">
                  <AlertDescription>{createError}</AlertDescription>
                </Alert>
              )
            : null}

          {lastProvisionCommand
            ? (
                <Alert className="mt-3">
                  <AlertDescription>
                    <div className="font-medium text-foreground">token 只显示一次</div>
                    <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-2 text-xs text-foreground">
                      {lastProvisionCommand}
                    </pre>
                  </AlertDescription>
                </Alert>
              )
            : null}
        </CardContent>
      </Card>

      <Card data-slot="host-worker-assignments">
        <CardHeader>
          <CardTitle>开通清单</CardTitle>
          <CardDescription>每个员工绑定一个 Soul release 和 aissh server。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {listError
            ? (
                <Alert variant="destructive">
                  <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <span>{listError}</span>
                    <Button type="button" size="sm" variant="outline" disabled={isLoadingAssignments} onClick={() => void refreshAssignments()}>
                      重试
                    </Button>
                  </AlertDescription>
                </Alert>
              )
            : null}

          {!listError && isLoadingAssignments && !hasLoadedAssignments
            ? <p className="text-muted-foreground text-sm">正在加载开通清单...</p>
            : null}

          {!listError && hasLoadedAssignments && assignments.length === 0
            ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>暂无开通记录</EmptyTitle>
                    <EmptyDescription>创建 assignment 后，这里会显示员工 Worker 开通状态。</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )
            : null}

          {assignments.map((assignment) => {
            const workerUrl = assignment.status === 'ready' ? assignment.workbenchUrl : null

            return (
              <section
                key={assignmentKey(assignment)}
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
