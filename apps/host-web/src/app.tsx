import type { FormEvent } from 'react'
import type {
  AssignmentStatus,
  CreateHostAssignmentResult,
  HostApiClient,
  HostAssignmentSummary,
  HostOperator,
  HostOptionsSummary,
  HostProvisioningTargetOption,
  HostSoulReleaseOption,
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

import { createHostApiClient, HostApiError } from './host-api'

export type { AssignmentStatus, HostAssignmentSummary, HostOperator, HostOptionsSummary } from './host-api'

export interface HostControlPlaneProps {
  api?: HostApiClient
  /**
   * Live status poll interval (ms). Provisioning → ready transitions happen
   * out-of-band (worker check-in, access tunnel), so production polls. Defaults
   * to off (0) so unit tests stay deterministic; `main.tsx` enables it.
   */
  pollIntervalMs?: number
}

type NavKey = 'AI Workers' | 'Souls' | 'Activity' | 'Settings'

interface NavItem {
  key: NavKey
  /** Honestly mark sections that have no backend yet so the nav never lies. */
  todo: boolean
}

interface AssignmentFormState {
  adapterRuntimeControlBaseUrl: string
  assignedEmail: string
  provisioningTargetId: string
  soulReleaseRef: string
}

interface UiError {
  kind: 'forbidden' | 'generic' | 'relogin'
  message: string
}

const emptyFormState: AssignmentFormState = {
  adapterRuntimeControlBaseUrl: '',
  assignedEmail: '',
  provisioningTargetId: '',
  soulReleaseRef: '',
}

const navItems: NavItem[] = [
  { key: 'AI Workers', todo: false },
  { key: 'Souls', todo: false },
  { key: 'Activity', todo: true },
  { key: 'Settings', todo: true },
]

const LOGIN_URL = '/auth/login?returnTo=/host'
const LOGOUT_URL = '/auth/logout'

// Lifecycle progress order; non-progress states (needs_attention/revoked/
// archived/draft) rank 0 so they never light up a forward step.
const STATUS_RANK: Record<string, number> = {
  access_ready: 3,
  checked_in: 2,
  provisioning: 1,
  ready: 4,
}

function statusLabel(status: AssignmentStatus | string) {
  switch (status) {
    case 'ready':
      return '可访问'
    case 'access_ready':
    case 'checked_in':
      return '连接中'
    case 'provisioning':
      return '开通中'
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

// Map raw API failures to operator-facing states. 401/403 are real control-plane
// conditions (expired operator / missing admin role), not generic errors.
function toUiError(error: unknown): UiError {
  if (error instanceof HostApiError) {
    if (error.status === 401)
      return { kind: 'relogin', message: '登录已过期，请重新登录。' }
    if (error.status === 403)
      return { kind: 'forbidden', message: '需要 Host 管理员账号才能访问。' }
  }
  return { kind: 'generic', message: errorMessage(error) }
}

function assignmentKey(assignment: HostAssignmentSummary): string {
  return assignment.assignmentId ?? `${assignment.assignedEmail}-${assignment.soulReleaseRef}`
}

function targetLabel(target: HostProvisioningTargetOption): string {
  return `${target.displayName} · ${target.adapterType} · ${target.maturity}`
}

function selectedTarget(options: HostOptionsSummary | null, targetId: string): HostProvisioningTargetOption | null {
  return options?.provisioningTargets.find(item => item.id === targetId || item.ref === targetId) ?? null
}

function selectedTargetDescription(options: HostOptionsSummary | null, targetId: string): string {
  const target = selectedTarget(options, targetId)
  if (!target)
    return targetId || '未选择'
  return target.description ? `${targetLabel(target)} · ${target.description}` : targetLabel(target)
}

function selectedSoulLabel(options: HostOptionsSummary | null, soulReleaseRef: string): string {
  const soul = options?.soulReleases.find(item => item.releaseRef === soulReleaseRef)
  if (!soul)
    return soulReleaseRef || '未选择'
  return `${soul.name} (${soul.releaseRef})`
}

function anyAssignmentAtLeast(assignments: HostAssignmentSummary[], status: AssignmentStatus): boolean {
  const threshold = STATUS_RANK[status] ?? 0
  return assignments.some(assignment => (STATUS_RANK[assignment.status] ?? 0) >= threshold)
}

export function HostControlPlane({ api, pollIntervalMs = 0 }: HostControlPlaneProps = {}) {
  const hostApi = useMemo(() => api ?? createHostApiClient(), [api])
  const assignmentRequestIdRef = useRef(0)
  const mountedRef = useRef(false)
  const emailInputRef = useRef<HTMLInputElement>(null)
  const [activeNav, setActiveNav] = useState<NavKey>('AI Workers')
  const [assignments, setAssignments] = useState<HostAssignmentSummary[]>([])
  const [formState, setFormState] = useState<AssignmentFormState>(emptyFormState)
  const [hasLoadedAssignments, setHasLoadedAssignments] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false)
  const [createError, setCreateError] = useState<null | UiError>(null)
  const [listError, setListError] = useState<null | UiError>(null)
  const [options, setOptions] = useState<HostOptionsSummary | null>(null)
  const [optionsError, setOptionsError] = useState<null | UiError>(null)
  const [operator, setOperator] = useState<HostOperator | null>(null)
  const [operatorLoaded, setOperatorLoaded] = useState(false)
  const [lastCreateResult, setLastCreateResult] = useState<CreateHostAssignmentResult | null>(null)
  const currentTarget = selectedTarget(options, formState.provisioningTargetId)

  const refreshAssignments = useCallback(async (opts: { silent?: boolean } = {}) => {
    const requestId = assignmentRequestIdRef.current + 1
    assignmentRequestIdRef.current = requestId
    // Only foreground loads touch the spinner/error up front. A silent poll must
    // NOT clear a standing error banner (e.g. a 401 re-login prompt) — otherwise
    // the next tick wipes it and a silent failure never restores it.
    if (mountedRef.current && !opts.silent) {
      setIsLoadingAssignments(true)
      setListError(null)
    }

    const canApplyResult = () => mountedRef.current && assignmentRequestIdRef.current === requestId

    try {
      const nextAssignments = await hostApi.listAssignments()
      if (canApplyResult()) {
        setAssignments(nextAssignments)
        // Success clears any standing error banner (incl. recovering from a 401),
        // for background polls and foreground loads alike.
        setListError(null)
        setHasLoadedAssignments(true)
      }
    }
    catch (error) {
      // Background polls keep the last good view and the standing banner; only
      // foreground loads surface a fresh error.
      if (canApplyResult() && !opts.silent)
        setListError(toUiError(error))
    }
    finally {
      // The foreground call owns the spinner and always clears it, even if a
      // silent poll superseded its requestId — otherwise 刷新 soft-locks.
      if (mountedRef.current && !opts.silent)
        setIsLoadingAssignments(false)
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
        provisioningTargetId: current.provisioningTargetId || nextOptions.provisioningTargets[0]?.id || '',
        soulReleaseRef: current.soulReleaseRef || nextOptions.soulReleases[0]?.releaseRef || '',
      }))
    }
    catch (error) {
      if (mountedRef.current)
        setOptionsError(toUiError(error))
    }
  }, [hostApi])

  const loadOperator = useCallback(async () => {
    try {
      const nextOperator = await hostApi.getOperator()
      if (mountedRef.current)
        setOperator(nextOperator)
    }
    catch {
      if (mountedRef.current)
        setOperator(null)
    }
    finally {
      if (mountedRef.current)
        setOperatorLoaded(true)
    }
  }, [hostApi])

  useEffect(() => {
    mountedRef.current = true
    void refreshAssignments()
    void loadOptions()
    void loadOperator()
    return () => {
      mountedRef.current = false
      assignmentRequestIdRef.current += 1
    }
  }, [loadOptions, loadOperator, refreshAssignments])

  useEffect(() => {
    if (!(pollIntervalMs > 0))
      return
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden)
        return
      void refreshAssignments({ silent: true })
    }, pollIntervalMs)
    return () => clearInterval(id)
  }, [pollIntervalMs, refreshAssignments])

  async function handleCreateAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreateError(null)
    setLastCreateResult(null)

    const target = selectedTarget(options, formState.provisioningTargetId)
    if (!target) {
      setCreateError({ kind: 'generic', message: '请选择 provisioning target' })
      return
    }

    const input = {
      ...(target.adapterType === 'aissh' && formState.adapterRuntimeControlBaseUrl.trim()
        ? { adapterRuntimeControlBaseUrl: formState.adapterRuntimeControlBaseUrl.trim() }
        : {}),
      assignedEmail: formState.assignedEmail.trim(),
      provisioningTarget: {
        adapterType: target.adapterType,
        maturity: target.maturity,
        ref: target.ref,
      },
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
        provisioningTargetId: current.provisioningTargetId,
        soulReleaseRef: current.soulReleaseRef,
      }))
      await refreshAssignments()
    }
    catch (error) {
      if (mountedRef.current)
        setCreateError(toUiError(error))
    }
    finally {
      if (mountedRef.current)
        setIsCreating(false)
    }
  }

  function focusAssignmentForm() {
    // The button only renders inside the AI Workers view, so the drawer form is
    // already mounted and the email input can take focus synchronously.
    setLastCreateResult(null)
    emailInputRef.current?.focus()
  }

  const onlineCount = assignments.filter(assignment => assignment.status === 'ready').length
  const connectingCount = assignments.filter(assignment => assignment.status === 'checked_in' || assignment.status === 'access_ready').length

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
                key={item.key}
                type="button"
                aria-current={item.key === activeNav ? 'page' : undefined}
                onClick={() => setActiveNav(item.key)}
                className="data-[active=true]:bg-background data-[active=true]:text-foreground text-muted-foreground hover:bg-background/70 flex h-8 items-center justify-between gap-2 rounded-md px-2 text-left text-xs font-medium"
                data-active={item.key === activeNav}
              >
                <span className="truncate">{item.key}</span>
                {item.todo
                  ? (
                      <Badge variant="outline">
                        <BadgeLabel>规划中</BadgeLabel>
                      </Badge>
                    )
                  : null}
              </button>
            ))}
          </nav>
          <Separator />
          <SidebarOperator operator={operator} operatorLoaded={operatorLoaded} />
          <WorkerAccessSummary online={onlineCount} connecting={connectingCount} />
        </aside>

        {activeNav === 'AI Workers'
          ? (
              <>
                <main className="flex min-w-0 flex-col gap-5 p-4 sm:p-6">
                  <header className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h1 className="text-2xl font-semibold">AI Workers</h1>
                      <p className="text-muted-foreground text-sm">
                        管理员工 AI Worker 的开通、check-in 和可访问状态。
                      </p>
                    </div>
                    <Button type="button" onClick={focusAssignmentForm}>
                      开通 AI Worker
                    </Button>
                  </header>

                  <section className="grid gap-3 sm:grid-cols-3" aria-label="Host readiness summary">
                    <SummaryBlock label="Assignments" value={String(assignments.length)} />
                    <SummaryBlock label="Provisioning targets" value={String(options?.provisioningTargets.length ?? 0)} />
                    <SummaryBlock label="Soul releases" value={String(options?.soulReleases.length ?? 0)} />
                  </section>

                  {listError
                    ? (
                        <Alert variant="destructive">
                          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <span>{listError.message}</span>
                            {listError.kind === 'relogin'
                              ? (
                                  <Button asChild size="sm" variant="outline">
                                    <a href={LOGIN_URL}>重新登录</a>
                                  </Button>
                                )
                              : (
                                  <Button type="button" size="sm" variant="outline" disabled={isLoadingAssignments} onClick={() => void refreshAssignments()}>
                                    重试
                                  </Button>
                                )}
                          </AlertDescription>
                        </Alert>
                      )
                    : null}

                  <section className="min-w-0 rounded-md border border-border bg-background" aria-label="AI Workers list">
                    <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
                      <p className="text-muted-foreground text-xs">开通清单实时刷新</p>
                      <Button type="button" size="sm" variant="outline" disabled={isLoadingAssignments} onClick={() => void refreshAssignments()}>
                        {isLoadingAssignments ? '刷新中' : '刷新'}
                      </Button>
                    </div>

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
                                <TableHead>Target</TableHead>
                                <TableHead>Soul</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Next</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {assignments.map((assignment) => {
                                const workerUrl = assignment.status === 'ready' && assignment.workerId
                                  ? `/workers/${encodeURIComponent(assignment.workerId)}`
                                  : null

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
                                    <TableCell>{assignment.provisioningTargetRef ?? assignment.serverRef}</TableCell>
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
                          给员工账号绑定开通目标和 Soul release。
                        </p>
                      </div>

                      {optionsError
                        ? (
                            <Alert variant="destructive">
                              <AlertDescription className="flex flex-col gap-2">
                                <span>{optionsError.message}</span>
                                {optionsError.kind === 'relogin'
                                  ? <a className="text-xs underline" href={LOGIN_URL}>重新登录</a>
                                  : null}
                              </AlertDescription>
                            </Alert>
                          )
                        : null}

                      {options?.provisioningTargetSourceError
                        ? (
                            <Alert variant="destructive">
                              <AlertDescription>{options.provisioningTargetSourceError}</AlertDescription>
                            </Alert>
                          )
                        : null}

                      {options?.soulSourceErrors && options.soulSourceErrors.length > 0
                        ? (
                            <Alert variant="destructive">
                              <AlertDescription className="flex flex-col gap-1">
                                <span>部分 Soul release 无法读取：</span>
                                {options.soulSourceErrors.map(message => (
                                  <span key={message} className="text-xs">{message}</span>
                                ))}
                              </AlertDescription>
                            </Alert>
                          )
                        : null}

                      <form className="flex flex-col gap-4" onSubmit={handleCreateAssignment}>
                        <FieldGroup>
                          <Field>
                            <FieldLabel htmlFor="assignedEmail">员工邮箱</FieldLabel>
                            <Input
                              id="assignedEmail"
                              ref={emailInputRef}
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
                            <FieldLabel htmlFor="provisioningTargetId">provisioning target</FieldLabel>
                            {options && options.provisioningTargets.length > 0
                              ? (
                                  <NativeSelect
                                    id="provisioningTargetId"
                                    required
                                    value={formState.provisioningTargetId}
                                    onChange={(event) => {
                                      setFormState(current => ({ ...current, provisioningTargetId: event.target.value }))
                                    }}
                                  >
                                    {options.provisioningTargets.map(target => (
                                      <NativeSelectOption key={target.id} value={target.id}>
                                        {targetLabel(target)}
                                      </NativeSelectOption>
                                    ))}
                                  </NativeSelect>
                                )
                              : (
                                  <Input
                                    id="provisioningTargetId"
                                    required
                                    value={formState.provisioningTargetId}
                                    onChange={(event) => {
                                      setFormState(current => ({ ...current, provisioningTargetId: event.target.value }))
                                    }}
                                  />
                                )}
                            <FieldDescription>{selectedTargetDescription(options, formState.provisioningTargetId)}</FieldDescription>
                            {options && options.provisioningTargets.length > 0
                              ? (
                                  <div className="flex flex-wrap gap-1" aria-label="target maturity summaries">
                                    {options.provisioningTargets.map(target => (
                                      <Badge key={target.id} variant="outline">
                                        <BadgeLabel>
                                          {target.adapterType}
                                          {' '}
                                          ·
                                          {' '}
                                          {target.maturity}
                                        </BadgeLabel>
                                      </Badge>
                                    ))}
                                  </div>
                                )
                              : null}
                            {currentTarget && currentTarget.maturity !== 'production'
                              ? <FieldDescription>此目标用于测试开通链路，不建议作为员工长期生产 Worker。</FieldDescription>
                              : null}
                          </Field>

                          {currentTarget?.adapterType === 'aissh'
                            ? (
                                <Field>
                                  <FieldLabel htmlFor="adapterRuntimeControlBaseUrl">Worker callback URL</FieldLabel>
                                  <Input
                                    id="adapterRuntimeControlBaseUrl"
                                    value={formState.adapterRuntimeControlBaseUrl}
                                    onChange={(event) => {
                                      setFormState(current => ({ ...current, adapterRuntimeControlBaseUrl: event.target.value }))
                                    }}
                                  />
                                  <FieldDescription>远程 aissh 目标必须能访问这个 Host API URL；不能使用本机 localhost。</FieldDescription>
                                </Field>
                              )
                            : null}

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
                                        {soul.name}
                                        {' '}
                                        (
                                        {soul.releaseRef}
                                        )
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
                              <AlertDescription>{createError.message}</AlertDescription>
                            </Alert>
                          )
                        : null}

                      {lastCreateResult
                        ? (
                            <section className="flex flex-col gap-3" aria-label="One-time provision commands">
                              <p className="text-sm font-medium">token 只显示一次</p>
                              {lastCreateResult.provisionToken
                                ? <CommandBlock title="Provision token" command={lastCreateResult.provisionToken} />
                                : null}
                              <CommandBlock title="Provision command" command={redactCommand(lastCreateResult.provisionCommand, lastCreateResult.provisionToken)} />
                              {lastCreateResult.deliveryReceipt?.command
                                ? <CommandBlock title="Delivery command" command={redactCommand(lastCreateResult.deliveryReceipt.command, lastCreateResult.provisionToken)} />
                                : null}
                            </section>
                          )
                        : null}

                      <Separator />

                      <section className="flex flex-col gap-3" aria-label="Phase 2 status gates">
                        <h3 className="text-sm font-medium">状态闭环</h3>
                        <StatusStep label="Assignment 已创建" active={Boolean(lastCreateResult) || assignments.length > 0} />
                        <StatusStep label="等待执行 provision command" active={Boolean(lastCreateResult) || assignments.some(assignment => assignment.status === 'provisioning')} />
                        <StatusStep label="Worker 已报到" active={anyAssignmentAtLeast(assignments, 'checked_in')} />
                        <StatusStep label="Worker Access 已建立" active={anyAssignmentAtLeast(assignments, 'access_ready')} />
                        <StatusStep label="Worker 可访问" active={anyAssignmentAtLeast(assignments, 'ready')} />
                      </section>
                    </div>
                  </ScrollArea>
                </aside>
              </>
            )
          : activeNav === 'Souls'
            ? <SoulsPanel options={options} optionsError={optionsError} />
            : <RoadmapPanel section={activeNav} />}
      </div>
    </div>
  )
}

function SidebarOperator({ operator, operatorLoaded }: { operator: HostOperator | null, operatorLoaded: boolean }) {
  return (
    <div className="flex flex-col gap-2" aria-label="Host operator identity">
      {operator
        ? (
            <>
              <div className="min-w-0 rounded-md border border-border bg-background p-2">
                <p className="text-muted-foreground text-xs">已登录</p>
                <p className="truncate text-xs font-medium">{operator.email}</p>
                {operator.roles.includes('host:admin')
                  ? (
                      <Badge variant="secondary">
                        <BadgeLabel>Host 管理员</BadgeLabel>
                      </Badge>
                    )
                  : (
                      <Badge variant="outline">
                        <BadgeLabel>非管理员</BadgeLabel>
                      </Badge>
                    )}
              </div>
              <form method="post" action={LOGOUT_URL}>
                <Button type="submit" size="sm" variant="outline" className="w-full">
                  退出登录
                </Button>
              </form>
            </>
          )
        : operatorLoaded
          ? (
              <div className="flex flex-col gap-2 rounded-md border border-border bg-background p-2">
                <p className="text-muted-foreground text-xs">未登录</p>
                <Button asChild size="sm" variant="outline" className="w-full">
                  <a href={LOGIN_URL}>登录</a>
                </Button>
              </div>
            )
          : <p className="text-muted-foreground text-xs">正在确认登录状态...</p>}
    </div>
  )
}

function WorkerAccessSummary({ connecting, online }: { connecting: number, online: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-background p-2" aria-label="Worker access summary">
      <p className="text-muted-foreground text-xs">Worker Access</p>
      <div className="flex flex-wrap gap-1">
        <Badge variant={online > 0 ? 'default' : 'secondary'}>
          <BadgeLabel>
            在线
            {' '}
            {online}
          </BadgeLabel>
        </Badge>
        <Badge variant="outline">
          <BadgeLabel>
            连接中
            {' '}
            {connecting}
          </BadgeLabel>
        </Badge>
      </div>
    </div>
  )
}

function SoulsPanel({ options, optionsError }: { options: HostOptionsSummary | null, optionsError: UiError | null }) {
  const soulReleases: HostSoulReleaseOption[] = options?.soulReleases ?? []
  return (
    <main className="flex min-w-0 flex-col gap-5 p-4 sm:p-6 lg:col-span-2" aria-label="Souls panel">
      <header className="min-w-0">
        <h1 className="text-2xl font-semibold">Souls</h1>
        <p className="text-muted-foreground text-sm">
          Host 可分发的官方 Soul release（descriptor-only）。
        </p>
      </header>

      {optionsError
        ? (
            <Alert variant="destructive">
              <AlertDescription>{optionsError.message}</AlertDescription>
            </Alert>
          )
        : null}

      {options?.soulSourceErrors && options.soulSourceErrors.length > 0
        ? (
            <Alert variant="destructive">
              <AlertDescription className="flex flex-col gap-1">
                <span>部分 Soul release 无法读取：</span>
                {options.soulSourceErrors.map(message => (
                  <span key={message} className="text-xs">{message}</span>
                ))}
              </AlertDescription>
            </Alert>
          )
        : null}

      <section className="min-w-0 rounded-md border border-border bg-background" aria-label="Soul releases list">
        {soulReleases.length === 0
          ? (
              <Empty className="p-6">
                <EmptyHeader>
                  <EmptyTitle>暂无 Soul release</EmptyTitle>
                  <EmptyDescription>构建官方 Soul 后，这里会显示可分发的 descriptor。</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )
          : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>名称</TableHead>
                    <TableHead>Release</TableHead>
                    <TableHead>Descriptor</TableHead>
                    <TableHead>来源</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {soulReleases.map(soul => (
                    <TableRow key={soul.releaseRef}>
                      <TableCell className="font-medium">{soul.name}</TableCell>
                      <TableCell>{soul.releaseRef}</TableCell>
                      <TableCell className="text-muted-foreground">{soul.descriptorPath}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          <BadgeLabel>{soul.source}</BadgeLabel>
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
      </section>
    </main>
  )
}

function RoadmapPanel({ section }: { section: NavKey }) {
  const description = section === 'Activity'
    ? '开通与访问审计流水线尚未接入，规划中。'
    : 'Host 设置（权限、connector 授权）尚未接入，规划中。'
  return (
    <main className="flex min-w-0 flex-col gap-5 p-4 sm:p-6 lg:col-span-2" aria-label={`${section} panel`}>
      <header className="min-w-0">
        <h1 className="text-2xl font-semibold">{section}</h1>
        <p className="text-muted-foreground text-sm">{description}</p>
      </header>
      <Empty className="p-6">
        <EmptyHeader>
          <EmptyTitle>规划中</EmptyTitle>
          <EmptyDescription>此功能尚未接入后端，是后续阶段的 TODO。</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </main>
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

function redactCommand(command: string, provisionToken?: string): string {
  if (!provisionToken)
    return command
  return command.split(provisionToken).join('[REDACTED]')
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
