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

import {
  Activity03Icon,
  Add01Icon,
  CheckmarkCircle02Icon,
  CloudServerIcon,
  Login03Icon,
  Logout01Icon,
  RoboticIcon,
  ServerStack01Icon,
  Settings02Icon,
  SparklesIcon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Alert, AlertDescription } from '@zonease/aiworker-ui/components/alert'
import { Avatar, AvatarFallback } from '@zonease/aiworker-ui/components/avatar'
import { Badge, BadgeLabel } from '@zonease/aiworker-ui/components/badge'
import { Button } from '@zonease/aiworker-ui/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@zonease/aiworker-ui/components/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@zonease/aiworker-ui/components/empty'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@zonease/aiworker-ui/components/field'
import { Input } from '@zonease/aiworker-ui/components/input'
import { NativeSelect, NativeSelectOption } from '@zonease/aiworker-ui/components/native-select'
import { Separator } from '@zonease/aiworker-ui/components/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@zonease/aiworker-ui/components/sheet'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@zonease/aiworker-ui/components/sidebar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@zonease/aiworker-ui/components/table'
import { TooltipProvider } from '@zonease/aiworker-ui/components/tooltip'
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
  icon: typeof UserGroupIcon
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
  { icon: UserGroupIcon, key: 'AI Workers', todo: false },
  { icon: SparklesIcon, key: 'Souls', todo: false },
  { icon: Activity03Icon, key: 'Activity', todo: true },
  { icon: Settings02Icon, key: 'Settings', todo: true },
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

function maturityLabel(target: HostProvisioningTargetOption): string {
  return `${target.adapterType} · ${target.maturity}`
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
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<null | UiError>(null)
  const [listError, setListError] = useState<null | UiError>(null)
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false)
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

  function openCreateSheet() {
    setCreateError(null)
    setLastCreateResult(null)
    setIsCreateOpen(true)
  }

  // While the one-time provision token is on screen, an accidental ESC/overlay
  // click would close the sheet and lose a secret that is shown exactly once —
  // so only the explicit 完成 button may dismiss the success state.
  function handleCreateOpenChange(next: boolean) {
    if (!next && lastCreateResult)
      return
    setIsCreateOpen(next)
    if (!next)
      setCreateError(null)
  }

  function finishCreate() {
    setLastCreateResult(null)
    setCreateError(null)
    setIsCreateOpen(false)
  }

  function selectNav(next: NavKey) {
    setActiveNav(next)
    // The provisioning sheet only belongs to AI Workers; close it on nav away so
    // it never floats over an unrelated section.
    if (next !== 'AI Workers')
      handleCreateOpenChange(false)
  }

  const onlineCount = assignments.filter(assignment => assignment.status === 'ready').length
  const connectingCount = assignments.filter(assignment => assignment.status === 'checked_in' || assignment.status === 'access_ready').length

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <div className="flex items-center gap-2 px-1 py-1.5">
              <div className="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-md">
                <HugeiconsIcon icon={RoboticIcon} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className="grid min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate text-sm font-semibold">AIWorker Host</span>
                <span className="text-muted-foreground truncate text-xs">Phase 2 control plane</span>
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <nav aria-label="Host navigation">
                <SidebarMenu>
                  {navItems.map(item => (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton
                        isActive={item.key === activeNav}
                        tooltip={item.key}
                        onClick={() => selectNav(item.key)}
                      >
                        <HugeiconsIcon icon={item.icon} strokeWidth={2} aria-hidden="true" />
                        <span>{item.key}</span>
                        {item.todo
                          ? (
                              <Badge variant="outline" className="ml-auto">
                                <BadgeLabel>规划中</BadgeLabel>
                              </Badge>
                            )
                          : null}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </nav>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter>
            <SidebarOperator operator={operator} operatorLoaded={operatorLoaded} />
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>

        <SidebarInset>
          <header className="bg-background/95 supports-backdrop-filter:bg-background/60 sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border px-4 backdrop-blur">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-1 h-4" />
            <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">{activeNav}</h1>
            {activeNav === 'AI Workers'
              ? (
                  <Button type="button" size="sm" onClick={openCreateSheet}>
                    <HugeiconsIcon icon={Add01Icon} strokeWidth={2} aria-hidden="true" />
                    开通 AI Worker
                  </Button>
                )
              : null}
          </header>

          <div className="flex min-w-0 flex-1 flex-col gap-6 p-4 sm:p-6">
            {activeNav === 'AI Workers'
              ? (
                  <AiWorkersPanel
                    assignments={assignments}
                    options={options}
                    optionsError={optionsError}
                    online={onlineCount}
                    connecting={connectingCount}
                    hasLoadedAssignments={hasLoadedAssignments}
                    isLoadingAssignments={isLoadingAssignments}
                    listError={listError}
                    onRefresh={() => void refreshAssignments()}
                    onOpenCreate={openCreateSheet}
                  />
                )
              : activeNav === 'Souls'
                ? <SoulsPanel options={options} optionsError={optionsError} />
                : <RoadmapPanel section={activeNav} />}
          </div>
        </SidebarInset>

        <Sheet open={isCreateOpen} onOpenChange={handleCreateOpenChange}>
          <SheetContent
            side="right"
            className="w-full gap-0 p-0 sm:max-w-md"
            showCloseButton={!lastCreateResult}
            onEscapeKeyDown={(event) => {
              if (lastCreateResult)
                event.preventDefault()
            }}
            onInteractOutside={(event) => {
              if (lastCreateResult)
                event.preventDefault()
            }}
            onOpenAutoFocus={(event) => {
              event.preventDefault()
              emailInputRef.current?.focus()
            }}
          >
            <SheetHeader className="border-b border-border p-6">
              <SheetTitle>开通 AI Worker</SheetTitle>
              <SheetDescription>给员工账号绑定开通目标和 Soul release，按提示一步步完成。</SheetDescription>
            </SheetHeader>

            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
              {lastCreateResult
                ? (
                    // Success is a terminal state: replace the form entirely so a
                    // stray submit can never overwrite the one-time token. 再开通一个
                    // clears the result and brings the form back.
                    <CreateSuccess result={lastCreateResult} onDone={finishCreate} onReset={openCreateSheet} />
                  )
                : (
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
                            placeholder="employee@company.com"
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
                          {currentTarget
                            ? (
                                <div className="flex flex-wrap items-center gap-2" aria-label="selected target maturity">
                                  <Badge variant={currentTarget.maturity === 'production' ? 'secondary' : 'outline'}>
                                    <BadgeLabel>{maturityLabel(currentTarget)}</BadgeLabel>
                                  </Badge>
                                  {currentTarget.maturity !== 'production'
                                    ? <span className="text-muted-foreground text-xs">用于测试开通链路，不建议作为员工长期生产 Worker。</span>
                                    : null}
                                </div>
                              )
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

                      <p className="text-muted-foreground text-xs">
                        配置随 Soul release 透传，Host 不在开通时编辑 raw config；skills / entry file / MCP 由 descriptor 携带。
                      </p>

                      <Button type="submit" disabled={isCreating}>
                        {isCreating ? '创建中' : '创建开通'}
                      </Button>

                      {createError
                        ? (
                            <Alert variant="destructive">
                              <AlertDescription>{createError.message}</AlertDescription>
                            </Alert>
                          )
                        : null}
                    </form>
                  )}
            </div>
          </SheetContent>
        </Sheet>
      </SidebarProvider>
    </TooltipProvider>
  )
}

interface AiWorkersPanelProps {
  assignments: HostAssignmentSummary[]
  connecting: number
  hasLoadedAssignments: boolean
  isLoadingAssignments: boolean
  listError: UiError | null
  onOpenCreate: () => void
  onRefresh: () => void
  online: number
  options: HostOptionsSummary | null
  optionsError: UiError | null
}

function AiWorkersPanel({
  assignments,
  connecting,
  hasLoadedAssignments,
  isLoadingAssignments,
  listError,
  onOpenCreate,
  onRefresh,
  online,
  options,
  optionsError,
}: AiWorkersPanelProps) {
  return (
    <>
      <p className="text-muted-foreground text-sm">
        管理员工 AI Worker 的开通、check-in 和可访问状态。
      </p>

      {optionsError
        ? (
            <Alert variant="destructive">
              <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span>{optionsError.message}</span>
                {optionsError.kind === 'relogin'
                  ? (
                      <Button asChild size="sm" variant="outline">
                        <a href={LOGIN_URL}>重新登录</a>
                      </Button>
                    )
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

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Host readiness summary">
        <WorkerAccessCard online={online} connecting={connecting} />
        <StatCard icon={UserGroupIcon} label="Assignments" value={String(assignments.length)} />
        <StatCard icon={CloudServerIcon} label="Provisioning targets" value={String(options?.provisioningTargets.length ?? 0)} />
        <StatCard icon={SparklesIcon} label="Soul releases" value={String(options?.soulReleases.length ?? 0)} />
      </section>

      {assignments.length > 0
        ? <FleetPipeline assignments={assignments} />
        : null}

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
                      <Button type="button" size="sm" variant="outline" disabled={isLoadingAssignments} onClick={onRefresh}>
                        重试
                      </Button>
                    )}
              </AlertDescription>
            </Alert>
          )
        : null}

      <section className="min-w-0 rounded-lg border border-border bg-card" aria-label="AI Workers list">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <p className="text-muted-foreground text-xs">开通清单实时刷新</p>
          <Button type="button" size="sm" variant="outline" disabled={isLoadingAssignments} onClick={onRefresh}>
            <HugeiconsIcon icon={ServerStack01Icon} strokeWidth={2} aria-hidden="true" />
            {isLoadingAssignments ? '刷新中' : '刷新'}
          </Button>
        </div>

        {!listError && isLoadingAssignments && !hasLoadedAssignments
          ? <p className="text-muted-foreground p-4 text-sm">正在加载开通清单...</p>
          : null}

        {!listError && hasLoadedAssignments && assignments.length === 0
          ? (
              <Empty className="gap-3 p-8">
                <EmptyHeader>
                  <EmptyTitle>暂无开通记录</EmptyTitle>
                  <EmptyDescription>给第一位员工开通 AI Worker，完成后这里会实时显示开通状态。</EmptyDescription>
                </EmptyHeader>
                <Button type="button" size="sm" onClick={onOpenCreate}>
                  <HugeiconsIcon icon={Add01Icon} strokeWidth={2} aria-hidden="true" />
                  开通 AI Worker
                </Button>
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
    </>
  )
}

function SidebarOperator({ operator, operatorLoaded }: { operator: HostOperator | null, operatorLoaded: boolean }) {
  if (operator) {
    const initial = operator.email.slice(0, 1).toUpperCase()
    const isAdmin = operator.roles.includes('host:admin')
    return (
      <div
        // Expanded: avatar · identity · logout in a row. Collapsed to the icon
        // rail: switch to a centered vertical stack so the logout control stays
        // reachable (P2-1) instead of being hidden. We deliberately avoid the
        // canonical avatar DropdownMenu — its radix popover is fragile under the
        // happy-dom unit tests — and just stack the icon button under the avatar.
        className="flex items-center gap-2 rounded-md border border-border bg-background p-2 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-1 group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:p-0"
        aria-label="Host operator identity"
      >
        <Avatar className="size-7 rounded-md">
          <AvatarFallback className="rounded-md text-xs">{initial}</AvatarFallback>
        </Avatar>
        <div className="grid min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:hidden">
          <span className="truncate text-xs font-medium">{operator.email}</span>
          <span className="text-muted-foreground truncate text-xs">{isAdmin ? 'Host 管理员' : '非管理员'}</span>
        </div>
        <form method="post" action={LOGOUT_URL}>
          <Button type="submit" size="icon-sm" variant="ghost" aria-label="退出登录" title="退出登录">
            <HugeiconsIcon icon={Logout01Icon} strokeWidth={2} aria-hidden="true" />
          </Button>
        </form>
      </div>
    )
  }

  if (!operatorLoaded)
    return <p className="text-muted-foreground px-2 text-xs group-data-[collapsible=icon]:hidden">正在确认登录状态...</p>

  return (
    <Button asChild size="sm" variant="outline" className="w-full">
      <a href={LOGIN_URL}>
        <HugeiconsIcon icon={Login03Icon} strokeWidth={2} aria-hidden="true" />
        <span className="group-data-[collapsible=icon]:hidden">登录</span>
      </a>
    </Button>
  )
}

function WorkerAccessCard({ connecting, online }: { connecting: number, online: number }) {
  // Headline metric is the online count (matching the big-number StatCards on the
  // same row); 连接中 is the secondary, muted sub-line so the row reads uniformly
  // instead of mixing status chips with counts.
  return (
    <Card size="sm" aria-label="Worker access summary">
      <CardHeader>
        <CardTitle className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
          <HugeiconsIcon icon={ServerStack01Icon} strokeWidth={2} aria-hidden="true" />
          Worker Access · 在线
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{online}</p>
        <p className="text-muted-foreground text-xs tabular-nums">
          连接中
          {' '}
          {connecting}
        </p>
      </CardContent>
    </Card>
  )
}

function StatCard({ icon, label, value }: { icon: typeof UserGroupIcon, label: string, value: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
          <HugeiconsIcon icon={icon} strokeWidth={2} aria-hidden="true" />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}

function FleetPipeline({ assignments }: { assignments: HostAssignmentSummary[] }) {
  const steps = [
    { done: assignments.length > 0, label: 'Assignment 已创建' },
    { done: assignments.some(assignment => assignment.status === 'provisioning') || anyAssignmentAtLeast(assignments, 'checked_in'), label: '等待执行 provision command' },
    { done: anyAssignmentAtLeast(assignments, 'checked_in'), label: 'Worker 已报到' },
    { done: anyAssignmentAtLeast(assignments, 'access_ready'), label: 'Worker Access 已建立' },
    { done: anyAssignmentAtLeast(assignments, 'ready'), label: 'Worker 可访问' },
  ]

  return (
    <section className="rounded-lg border border-border bg-card p-4" aria-label="整体开通进度">
      <p className="text-sm font-medium">整体开通进度</p>
      <p className="text-muted-foreground text-xs">跨全部开通的整体阶段，任一 Worker 到达即点亮。</p>
      <ol className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-0">
        {steps.map((step, index) => (
          <li key={step.label} className="flex flex-1 items-start gap-2 sm:flex-col sm:items-center sm:text-center">
            <div className="flex items-center gap-2 sm:w-full sm:flex-col sm:gap-0">
              <span
                className={
                  step.done
                    ? 'bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-full'
                    : 'border-border text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full border'
                }
              >
                {step.done
                  ? <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} className="size-4" aria-hidden="true" />
                  : <span className="text-xs">{index + 1}</span>}
              </span>
            </div>
            <span className={step.done ? 'text-xs font-medium' : 'text-muted-foreground text-xs'}>{step.label}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function CreateSuccess({ onDone, onReset, result }: { onDone: () => void, onReset: () => void, result: CreateHostAssignmentResult }) {
  return (
    <section className="border-primary/30 bg-primary/5 flex flex-col gap-3 rounded-lg border p-4" aria-label="One-time provision commands">
      <div className="flex flex-col gap-1">
        <p className="flex items-center gap-2 text-sm font-medium">
          <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} className="text-primary size-4" aria-hidden="true" />
          开通已创建
        </p>
        <p className="text-muted-foreground text-xs">
          token 只显示一次，请立即复制并在目标机器执行。Worker 报到后开通状态会自动更新。
        </p>
      </div>

      {result.provisionToken
        ? <CommandBlock title="Provision token" command={result.provisionToken} highlight />
        : null}
      <CommandBlock title="Provision command" command={redactCommand(result.provisionCommand, result.provisionToken)} />
      {result.deliveryReceipt?.command
        ? <CommandBlock title="Delivery command" command={redactCommand(result.deliveryReceipt.command, result.provisionToken)} />
        : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={onDone}>完成</Button>
        <Button type="button" size="sm" variant="outline" onClick={onReset}>再开通一个</Button>
      </div>
    </section>
  )
}

function SoulsPanel({ options, optionsError }: { options: HostOptionsSummary | null, optionsError: UiError | null }) {
  const soulReleases: HostSoulReleaseOption[] = options?.soulReleases ?? []
  return (
    <div className="flex min-w-0 flex-col gap-5" aria-label="Souls panel">
      <p className="text-muted-foreground text-sm">
        Host registry 里已发布、可分发的 Soul release（descriptor-only）。用 aiworker-host soul publish 发布。
      </p>

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

      <section className="min-w-0 rounded-lg border border-border bg-card" aria-label="Soul releases list">
        {soulReleases.length === 0
          ? (
              <Empty className="p-8">
                <EmptyHeader>
                  <EmptyTitle>暂无 Soul release</EmptyTitle>
                  <EmptyDescription>用 aiworker-host soul publish 发布一个 Soul 后，这里会显示可分发的 release。</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )
          : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>名称</TableHead>
                    <TableHead>Release</TableHead>
                    <TableHead>版本</TableHead>
                    <TableHead>来源</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {soulReleases.map(soul => (
                    <TableRow key={soul.releaseRef}>
                      <TableCell className="font-medium">{soul.name}</TableCell>
                      <TableCell>{soul.releaseRef}</TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">
                        v
                        {soul.version}
                      </TableCell>
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
    </div>
  )
}

function RoadmapPanel({ section }: { section: NavKey }) {
  const description = section === 'Activity'
    ? '开通与访问审计流水线尚未接入，规划中。'
    : 'Host 设置（权限、connector 授权）尚未接入，规划中。'
  return (
    <div className="flex min-w-0 flex-col gap-5" aria-label={`${section} panel`}>
      <p className="text-muted-foreground text-sm">{description}</p>
      <Empty className="p-8">
        <EmptyHeader>
          <EmptyTitle>规划中</EmptyTitle>
          <EmptyDescription>此功能尚未接入后端，是后续阶段的 TODO。</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  )
}

function CommandBlock({ command, highlight = false, title }: { command: string, highlight?: boolean, title: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied)
      return
    const id = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(id)
  }, [copied])

  async function copyCommand() {
    if (typeof navigator === 'undefined' || !navigator.clipboard)
      return
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
    }
    catch {
      setCopied(false)
    }
  }

  return (
    <div
      className={highlight
        ? 'border-primary/40 overflow-hidden rounded-md border bg-background'
        : 'overflow-hidden rounded-md border border-border bg-background'}
      aria-label={`command ${title}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <p className="text-xs font-medium">{title}</p>
          {highlight
            ? (
                <Badge variant="secondary">
                  <BadgeLabel>只此一次</BadgeLabel>
                </Badge>
              )
            : null}
        </div>
        <Button type="button" size="sm" variant={highlight ? 'secondary' : 'ghost'} aria-label={`复制 ${title}`} onClick={copyCommand}>
          {copied ? '已复制' : '复制'}
        </Button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs text-foreground">
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
