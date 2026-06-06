import type { FormEvent } from 'react'
import type {
  AssignmentStatus,
  CreateHostAssignmentResult,
  HostApiClient,
  HostAssignmentSummary,
  HostOptionsSummary,
} from './host-api'

import { Alert, AlertDescription } from '@zonease/aiworker-ui/components/alert'
import { Badge, BadgeLabel } from '@zonease/aiworker-ui/components/badge'
import { Button } from '@zonease/aiworker-ui/components/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@zonease/aiworker-ui/components/empty'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@zonease/aiworker-ui/components/field'
import { Input } from '@zonease/aiworker-ui/components/input'
import { NativeSelect, NativeSelectOption } from '@zonease/aiworker-ui/components/native-select'
import { ScrollArea } from '@zonease/aiworker-ui/components/scroll-area'
import { Separator } from '@zonease/aiworker-ui/components/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@zonease/aiworker-ui/components/table'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { createHostApiClient } from './host-api'

export type { AssignmentStatus, HostAssignmentSummary, HostOptionsSummary } from './host-api'

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

const navItems = ['AI Workers', 'Souls', 'Activity', 'Settings'] as const

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

function nextStepLabel(status: AssignmentStatus | string) {
  switch (status) {
    case 'ready':
      return '员工可打开 Worker'
    case 'access_ready':
      return '等待 ready URL'
    case 'checked_in':
      return '等待 Worker Access Tunnel'
    case 'provisioning':
      return '执行 provision command'
    case 'needs_attention':
      return '需要管理员处理'
    case 'revoked':
      return '访问已撤销'
    case 'archived':
      return '已归档'
    default:
      return '继续开通'
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

function selectedServerLabel(options: HostOptionsSummary | null, serverRef: string): string {
  const server = options?.servers.find(item => item.id === serverRef)
  if (!server)
    return serverRef || '未选择'
  return server.name ? `${server.name} (${server.id})` : server.id
}

function selectedSoulLabel(options: HostOptionsSummary | null, soulReleaseRef: string): string {
  const soul = options?.soulReleases.find(item => item.releaseRef === soulReleaseRef)
  if (!soul)
    return soulReleaseRef || '未选择'
  return `${soul.name} (${soul.releaseRef})`
}

function isCheckedInOrBeyond(status: AssignmentStatus | string): boolean {
  return ['checked_in', 'access_ready', 'ready'].includes(status)
}

export function HostControlPlane({ api }: HostControlPlaneProps = {}) {
  const hostApi = useMemo(() => api ?? createHostApiClient(), [api])
  const assignmentRequestIdRef = useRef(0)
  const mountedRef = useRef(false)
  const [assignments, setAssignments] = useState<HostAssignmentSummary[]>([])
  const [formState, setFormState] = useState<AssignmentFormState>(emptyFormState)
  const [hasLoadedAssignments, setHasLoadedAssignments] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false)
  const [createError, setCreateError] = useState<null | string>(null)
  const [listError, setListError] = useState<null | string>(null)
  const [options, setOptions] = useState<HostOptionsSummary | null>(null)
  const [optionsError, setOptionsError] = useState<null | string>(null)
  const [lastCreateResult, setLastCreateResult] = useState<CreateHostAssignmentResult | null>(null)

  const refreshAssignments = useCallback(async () => {
    const requestId = assignmentRequestIdRef.current + 1
    assignmentRequestIdRef.current = requestId
    if (mountedRef.current) {
      setIsLoadingAssignments(true)
      setListError(null)
    }

    const canApplyResult = () => mountedRef.current && assignmentRequestIdRef.current === requestId

    try {
      const nextAssignments = await hostApi.listAssignments()
      if (canApplyResult())
        setAssignments(nextAssignments)
    }
    catch (error) {
      if (canApplyResult())
        setListError(errorMessage(error))
    }
    finally {
      if (canApplyResult()) {
        setHasLoadedAssignments(true)
        setIsLoadingAssignments(false)
      }
    }
  }, [hostApi])

  const loadOptions = useCallback(async () => {
    try {
      const nextOptions = await hostApi.getOptions()
      if (!mountedRef.current)
        return
      setOptions(nextOptions)
      setOptionsError(null)
      setFormState(current => ({
        ...current,
        serverRef: current.serverRef || nextOptions.servers[0]?.id || '',
        soulReleaseRef: current.soulReleaseRef || nextOptions.soulReleases[0]?.releaseRef || '',
      }))
    }
    catch (error) {
      if (mountedRef.current)
        setOptionsError(errorMessage(error))
    }
  }, [hostApi])

  useEffect(() => {
    mountedRef.current = true
    void refreshAssignments()
    void loadOptions()
    return () => {
      mountedRef.current = false
      assignmentRequestIdRef.current += 1
    }
  }, [loadOptions, refreshAssignments])

  async function handleCreateAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreateError(null)
    setLastCreateResult(null)

    const input = {
      assignedEmail: formState.assignedEmail.trim(),
      serverRef: formState.serverRef.trim(),
      soulReleaseRef: formState.soulReleaseRef.trim(),
    }

    setIsCreating(true)
    try {
      const created = await hostApi.createAssignment(input)
      if (!mountedRef.current)
        return
      setLastCreateResult(created)
      setFormState(current => ({
        ...emptyFormState,
        serverRef: current.serverRef,
        soulReleaseRef: current.soulReleaseRef,
      }))
      await refreshAssignments()
    }
    catch (error) {
      if (mountedRef.current)
        setCreateError(errorMessage(error))
    }
    finally {
      if (mountedRef.current)
        setIsCreating(false)
    }
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <div className="grid min-h-svh grid-cols-1 lg:grid-cols-[14rem_minmax(0,1fr)_24rem]">
        <aside className="border-border bg-muted/30 flex flex-col gap-4 border-r p-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold">AIWorker Host</p>
            <p className="text-muted-foreground text-xs">Phase 2 control plane</p>
          </div>
          <nav aria-label="Host navigation" className="flex flex-col gap-1">
            {navItems.map(item => (
              <button
                key={item}
                type="button"
                aria-current={item === 'AI Workers' ? 'page' : undefined}
                className="data-[active=true]:bg-background data-[active=true]:text-foreground text-muted-foreground hover:bg-background/70 flex h-8 items-center rounded-md px-2 text-left text-xs font-medium"
                data-active={item === 'AI Workers'}
              >
                {item}
              </button>
            ))}
          </nav>
          <Separator />
          <div className="flex flex-col gap-2">
            <Badge variant="secondary">
              <BadgeLabel>Logto 未接入</BadgeLabel>
            </Badge>
            <Badge variant="secondary">
              <BadgeLabel>Worker Access Tunnel 未接入</BadgeLabel>
            </Badge>
          </div>
        </aside>

        <main className="flex min-w-0 flex-col gap-5 p-4 sm:p-6">
          <header className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold">AI Workers</h1>
              <p className="text-muted-foreground text-sm">
                管理员工 AI Worker 的开通、check-in 和可访问状态。
              </p>
            </div>
            <Button type="button" onClick={() => setLastCreateResult(null)}>
              开通 AI Worker
            </Button>
          </header>

          <section className="grid gap-3 sm:grid-cols-3" aria-label="Host readiness summary">
            <SummaryBlock label="Assignments" value={String(assignments.length)} />
            <SummaryBlock label="aissh servers" value={String(options?.servers.length ?? 0)} />
            <SummaryBlock label="Soul releases" value={String(options?.soulReleases.length ?? 0)} />
          </section>

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

          <section className="min-w-0 rounded-md border border-border bg-background" aria-label="AI Workers list">
            {!listError && isLoadingAssignments && !hasLoadedAssignments
              ? <p className="text-muted-foreground p-4 text-sm">正在加载开通清单...</p>
              : null}

            {!listError && hasLoadedAssignments && assignments.length === 0
              ? (
                  <Empty className="p-6">
                    <EmptyHeader>
                      <EmptyTitle>暂无开通记录</EmptyTitle>
                      <EmptyDescription>完成开通后，这里会显示员工 Worker 开通状态。</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )
              : null}

            {assignments.length > 0
              ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>员工</TableHead>
                        <TableHead>Server</TableHead>
                        <TableHead>Soul</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Next</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {assignments.map((assignment) => {
                        const workerUrl = assignment.status === 'ready' ? assignment.workbenchUrl : null

                        return (
                          <TableRow key={assignmentKey(assignment)}>
                            <TableCell>
                              <div className="min-w-0">
                                <p className="truncate font-medium">{assignment.assignedEmail}</p>
                                <p className="text-muted-foreground truncate">
                                  {assignment.workerId ?? 'Worker 待创建'}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>{assignment.serverRef}</TableCell>
                            <TableCell>{assignment.soulReleaseRef}</TableCell>
                            <TableCell>
                              <Badge variant={assignment.status === 'ready' ? 'default' : 'secondary'}>
                                <BadgeLabel>{statusLabel(assignment.status)}</BadgeLabel>
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">{nextStepLabel(assignment.status)}</span>
                                {workerUrl
                                  ? (
                                      <Button asChild size="sm" variant="outline">
                                        <a href={workerUrl}>打开 Worker</a>
                                      </Button>
                                    )
                                  : null}
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                )
              : null}
          </section>
        </main>

        <aside aria-label="Worker assignment drawer" className="border-border bg-muted/20 min-w-0 border-l">
          <ScrollArea className="h-svh">
            <div className="flex flex-col gap-5 p-4">
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold">开通 AI Worker</h2>
                <p className="text-muted-foreground text-sm">
                  给员工账号绑定 aissh server 和 Soul release。
                </p>
              </div>

              {optionsError
                ? (
                    <Alert variant="destructive">
                      <AlertDescription>{optionsError}</AlertDescription>
                    </Alert>
                  )
                : null}

              {options?.serverSourceError
                ? (
                    <Alert variant="destructive">
                      <AlertDescription>{options.serverSourceError}</AlertDescription>
                    </Alert>
                  )
                : null}

              <form className="flex flex-col gap-4" onSubmit={handleCreateAssignment}>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="assignedEmail">员工邮箱</FieldLabel>
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
                    <FieldDescription>必须是员工企业邮箱。</FieldDescription>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="serverRef">aissh server</FieldLabel>
                    {options && options.servers.length > 0
                      ? (
                          <NativeSelect
                            id="serverRef"
                            required
                            value={formState.serverRef}
                            onChange={(event) => {
                              setFormState(current => ({ ...current, serverRef: event.target.value }))
                            }}
                          >
                            {options.servers.map(server => (
                              <NativeSelectOption key={server.id} value={server.id}>
                                {server.name ? `${server.name} (${server.id})` : server.id}
                              </NativeSelectOption>
                            ))}
                          </NativeSelect>
                        )
                      : (
                          <Input
                            id="serverRef"
                            required
                            value={formState.serverRef}
                            onChange={(event) => {
                              setFormState(current => ({ ...current, serverRef: event.target.value }))
                            }}
                          />
                        )}
                    <FieldDescription>{selectedServerLabel(options, formState.serverRef)}</FieldDescription>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="soulReleaseRef">Soul release</FieldLabel>
                    {options && options.soulReleases.length > 0
                      ? (
                          <NativeSelect
                            id="soulReleaseRef"
                            required
                            value={formState.soulReleaseRef}
                            onChange={(event) => {
                              setFormState(current => ({ ...current, soulReleaseRef: event.target.value }))
                            }}
                          >
                            {options.soulReleases.map(soul => (
                              <NativeSelectOption key={soul.releaseRef} value={soul.releaseRef}>
                                {soul.name} ({soul.releaseRef})
                              </NativeSelectOption>
                            ))}
                          </NativeSelect>
                        )
                      : (
                          <Input
                            id="soulReleaseRef"
                            required
                            value={formState.soulReleaseRef}
                            onChange={(event) => {
                              setFormState(current => ({ ...current, soulReleaseRef: event.target.value }))
                            }}
                          />
                        )}
                    <FieldDescription>{selectedSoulLabel(options, formState.soulReleaseRef)}</FieldDescription>
                  </Field>
                </FieldGroup>

                <section className="rounded-md border border-border bg-background p-3" aria-label="Configuration passthrough summary">
                  <p className="text-sm font-medium">配置透传摘要</p>
                  <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
                    <p>配置随 Soul release 透传</p>
                    <p>Host 不在开通时编辑 raw config</p>
                    <p>Skills / entry file / MCP 由 descriptor 携带</p>
                  </div>
                </section>

                <Button type="submit" disabled={isCreating}>
                  {isCreating ? '创建中' : '创建开通'}
                </Button>
              </form>

              {createError
                ? (
                    <Alert variant="destructive">
                      <AlertDescription>{createError}</AlertDescription>
                    </Alert>
                  )
                : null}

              {lastCreateResult
                ? (
                    <section className="flex flex-col gap-3" aria-label="One-time provision commands">
                      <p className="text-sm font-medium">token 只显示一次</p>
                      <CommandBlock title="Provision command" command={lastCreateResult.provisionCommand} />
                      {lastCreateResult.aisshCommand
                        ? <CommandBlock title="aissh exec command" command={lastCreateResult.aisshCommand} />
                        : null}
                    </section>
                  )
                : null}

              <Separator />

              <section className="flex flex-col gap-3" aria-label="Phase 2 status gates">
                <h3 className="text-sm font-medium">状态闭环</h3>
                <StatusStep label="Assignment 已创建" active={Boolean(lastCreateResult) || assignments.length > 0} />
                <StatusStep label="等待执行 provision command" active={Boolean(lastCreateResult)} />
                <StatusStep label="Worker 已报到" active={assignments.some(assignment => isCheckedInOrBeyond(assignment.status))} />
                <StatusStep label="Worker Access Tunnel 未接入" active />
                <StatusStep label="Logto 未接入" active />
              </section>
            </div>
          </ScrollArea>
        </aside>
      </div>
    </div>
  )
}

function SummaryBlock({ label, value }: { label: string, value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  )
}

function CommandBlock({ command, title }: { command: string, title: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="text-xs font-medium">{title}</p>
      <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-2 text-xs text-foreground">
        {command}
      </pre>
    </div>
  )
}

function StatusStep({ active, label }: { active: boolean, label: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-background p-2">
      <span className="text-xs">{label}</span>
      <Badge variant={active ? 'secondary' : 'outline'}>
        <BadgeLabel>{active ? '当前' : '等待'}</BadgeLabel>
      </Badge>
    </div>
  )
}
