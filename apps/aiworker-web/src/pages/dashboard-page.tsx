import type { AdminConsoleData, AssignmentSummary, Tone } from '@/lib/admin-data'
import { ArrowRightIcon, CheckCircleIcon, FloppyDiskIcon, ShieldCheckIcon, SignOutIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/page-header'
import { RemediationAlert } from '@/components/remediation-alert'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { clearAdminToken, readAdminTokenStorageState, saveAdminToken } from '@/lib/admin-api-client'
import { getEnvironment, getSoulRelease, statusMeta } from '@/lib/admin-data'
import { useAdminData } from '@/lib/admin-data-context'
import { adminRemediation } from '@/lib/admin-remediation'

export function DashboardPage() {
  const { bootstrap, data, loadError, reload } = useAdminData()
  const [tokenInput, setTokenInput] = useState('')
  const [tokenState, setTokenState] = useState(readAdminTokenStorageState)
  const tokenLocation = tokenState.location === 'local' ? 'local storage' : tokenState.location === 'session' ? 'session storage' : 'not stored'
  const showSignIn = bootstrap.auth.loginRequired && !bootstrap.auth.authenticated
  const showSignOut = bootstrap.auth.via === 'session'
  const focus = buildDashboardFocus(data)
  const liveDataUnavailable = Boolean(loadError)
  const taskQueue = liveDataUnavailable ? [] : buildDashboardTaskQueue(data)
  const primaryTask = taskQueue[0]

  function saveToken(persist: boolean) {
    setTokenState(saveAdminToken(tokenInput, persist))
    setTokenInput('')
    void reload()
  }

  function forgetToken() {
    setTokenState(clearAdminToken())
    setTokenInput('')
    void reload()
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="总览"
        title={liveDataUnavailable ? '先恢复管理数据' : primaryTask ? '先处理这一件事' : '今天没有必须处理的开通'}
        description={liveDataUnavailable
          ? '当前页面不能确认最新员工开通状态。先刷新数据；如果仍失败，把页面交给技术支持。'
          : primaryTask
            ? '首页只给出一个优先动作。处理完成后回到这里继续下一位员工。'
            : '员工开通没有阻塞项。需要给新员工开通时，从这里开始。'}
        actions={<StatusBadge tone={liveDataUnavailable ? 'destructive' : focus.primaryTone}>{liveDataUnavailable ? '数据不可用' : focus.primaryLabel}</StatusBadge>}
      />

      {loadError
        ? (
            <Card className="border-destructive/40">
              <CardHeader>
                <CardTitle>当前不要继续处理员工开通</CardTitle>
                <CardDescription>数据读取失败时，员工列表已暂停显示，避免按过期状态操作。</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border border-destructive/20 bg-destructive/5 p-4">
                  <p className="text-sm font-medium text-destructive">页面暂时拿不到最新员工开通数据。</p>
                  <p className="mt-2 text-sm/relaxed text-muted-foreground">
                    请先刷新数据或登录管理员账号；如果仍失败，展开底部技术支持信息交给技术支持。
                  </p>
                </div>
              </CardContent>
              <CardFooter className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void reload()}>
                  <ArrowRightIcon data-icon="inline-start" weight="duotone" />
                  刷新数据
                </Button>
                {showSignIn
                  ? (
                      <Button asChild size="sm" variant="outline">
                        <a href={bootstrap.auth.loginUrl}>
                          <ShieldCheckIcon data-icon="inline-start" weight="duotone" />
                          登录管理员账号
                        </a>
                      </Button>
                    )
                  : null}
              </CardFooter>
            </Card>
          )
        : null}

      {!liveDataUnavailable
        ? (
            <Card className="border-primary/30">
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle>{primaryTask ? primaryTask.title : '没有卡住的员工'}</CardTitle>
                    <CardDescription>{primaryTask ? primaryTask.reason : '所有员工开通都没有需要立即处理的事项。'}</CardDescription>
                  </div>
                  <CardAction>
                    <StatusBadge tone={primaryTask ? primaryTask.tone : 'success'}>{primaryTask ? primaryTask.statusLabel : '正常'}</StatusBadge>
                  </CardAction>
                </div>
              </CardHeader>
              <CardContent>
                {primaryTask
                  ? <DashboardTaskCard data={data} task={primaryTask} prominent />
                  : (
                      <div className="rounded-md border bg-muted/20 p-4">
                        <div className="flex items-center gap-2">
                          <CheckCircleIcon weight="duotone" />
                          <p className="text-sm font-medium">当前没有需要管理员处理的员工</p>
                        </div>
                        <p className="mt-2 text-xs/relaxed text-muted-foreground">可以为新员工开通 AIWorker，或查看全部员工状态。</p>
                      </div>
                    )}
              </CardContent>
              <CardFooter className="flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link to="/provisioning">
                    <ArrowRightIcon data-icon="inline-start" weight="duotone" />
                    {primaryTask ? primaryTask.actionLabel : '为新员工开通'}
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to="/assignments">
                    查看全部员工
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          )
        : null}

      <div className={`grid grid-cols-1 gap-4 ${liveDataUnavailable ? '' : 'xl:grid-cols-[1.25fr_0.75fr]'}`}>
        {!liveDataUnavailable
          ? (
              <Card>
                <CardHeader>
                  <CardTitle>接下来处理</CardTitle>
                  <CardDescription>{taskQueue.length ? '按顺序处理，不需要先看日志或技术配置。' : '没有待处理员工。'}</CardDescription>
                  <CardAction>
                    <StatusBadge tone={taskQueue.length ? 'warning' : 'success'}>
                      {taskQueue.length}
                      {' '}
                      件
                    </StatusBadge>
                  </CardAction>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {taskQueue.length
                    ? taskQueue.map(task => <DashboardTaskCard key={task.assignment.id} data={data} task={task} />)
                    : (
                        <div className="rounded-md border bg-muted/20 p-4">
                          <div className="flex items-center gap-2">
                            <CheckCircleIcon weight="duotone" />
                            <p className="text-sm font-medium">今天没有必须处理的开通</p>
                          </div>
                          <p className="mt-2 text-xs/relaxed text-muted-foreground">有新员工要开通时，从首页的开通按钮开始。</p>
                        </div>
                      )}
                </CardContent>
              </Card>
            )
          : null}
        <Card>
          <CardHeader>
            <CardTitle>页面说明</CardTitle>
            <CardDescription>这里不处理员工对话、权限和使用过程。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <FieldGroup>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>员工在哪里使用</FieldTitle>
                  <FieldDescription>Paseo 客户端。</FieldDescription>
                </FieldContent>
                <StatusBadge tone="info">Paseo</StatusBadge>
              </Field>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>管理员要做什么</FieldTitle>
                  <FieldDescription>确认员工、设备和能力，然后发送入口。</FieldDescription>
                </FieldContent>
                <StatusBadge tone="success">开通</StatusBadge>
              </Field>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>后台账号状态</FieldTitle>
                  <FieldDescription>{focus.providerHealth}</FieldDescription>
                </FieldContent>
                <StatusBadge tone={focus.providerTone}>{focus.providerLabel}</StatusBadge>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
      </div>
      <details className="rounded-lg border bg-card p-4">
        <summary className="cursor-pointer text-sm font-medium">技术支持和系统状态</summary>
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
          <FieldGroup>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>真实数据连接</FieldTitle>
                <FieldDescription>{loadError ? '真实数据暂不可用。' : bootstrap.source === 'control-plane' ? '正在读取真实员工开通数据。' : '演示数据，操作不会保存。'}</FieldDescription>
              </FieldContent>
              <StatusBadge tone={bootstrap.source === 'control-plane' && !loadError ? 'success' : 'warning'}>
                {loadError ? '不可用' : bootstrap.source === 'control-plane' ? '真实数据' : '演示'}
              </StatusBadge>
            </Field>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>管理员权限</FieldTitle>
                <FieldDescription>{adminAuthDescription(bootstrap.auth)}</FieldDescription>
              </FieldContent>
              <StatusBadge tone={bootstrap.auth.authenticated ? 'success' : bootstrap.auth.loginRequired ? 'warning' : 'info'}>
                {bootstrap.auth.via === 'token' ? '口令已授权' : bootstrap.auth.authenticated ? '已登录' : bootstrap.auth.loginRequired ? '需登录' : '本机'}
              </StatusBadge>
            </Field>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>访问方式</FieldTitle>
                <FieldDescription>
                  {bootstrap.host}
                  {' '}
                  ·
                  {bootstrap.remoteAccessEnabled ? ' 可远程访问' : ' 仅本机访问'}
                </FieldDescription>
              </FieldContent>
              <StatusBadge tone={bootstrap.remoteAccessEnabled ? 'warning' : 'success'}>
                {bootstrap.remoteAccessEnabled ? '远程' : '本机'}
              </StatusBadge>
            </Field>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>浏览器口令</FieldTitle>
                <FieldDescription>{tokenLocation}</FieldDescription>
              </FieldContent>
              <StatusBadge tone={tokenState.stored ? 'success' : bootstrap.adminTokenRequired ? 'warning' : 'info'}>
                {tokenState.stored ? '已保存' : '未填写'}
              </StatusBadge>
            </Field>
            {loadError ? <RemediationAlert remediation={loadError} /> : null}
            {!loadError && !bootstrap.controlPlaneDirConfigured ? <RemediationAlert remediation={adminRemediation('control_plane_dir_required')} /> : null}
            {!loadError && bootstrap.auth.remediationCode ? <RemediationAlert remediation={adminRemediation(bootstrap.auth.remediationCode)} /> : null}
            {bootstrap.adminTokenRequired && !tokenState.stored ? <RemediationAlert remediation={adminRemediation('admin_token_required')} /> : null}
          </FieldGroup>
          <FieldGroup>
            <div className="flex flex-wrap gap-2">
              {showSignIn && (
                <Button asChild size="sm">
                  <a href={bootstrap.auth.loginUrl}>
                    <ShieldCheckIcon data-icon="inline-start" weight="duotone" />
                    登录
                  </a>
                </Button>
              )}
              {showSignOut && (
                <Button asChild size="sm" variant="outline">
                  <a href={bootstrap.auth.logoutUrl}>
                    <SignOutIcon data-icon="inline-start" weight="duotone" />
                    退出
                  </a>
                </Button>
              )}
            </div>
            <Field>
              <FieldLabel htmlFor="admin-token">管理员口令</FieldLabel>
              <Input
                id="admin-token"
                autoComplete="off"
                onChange={event => setTokenInput(event.target.value)}
                placeholder="AIWORKER_WEB_ADMIN_TOKEN"
                type="password"
                value={tokenInput}
              />
              <FieldDescription>口令只保存在当前浏览器，用于读取和保存管理员操作。</FieldDescription>
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button disabled={!tokenInput.trim()} size="sm" onClick={() => saveToken(false)}>
                <ShieldCheckIcon data-icon="inline-start" weight="duotone" />
                本次使用
              </Button>
              <Button disabled={!tokenInput.trim()} size="sm" variant="outline" onClick={() => saveToken(true)}>
                <FloppyDiskIcon data-icon="inline-start" weight="duotone" />
                记住这台设备
              </Button>
              <Button disabled={!tokenState.stored} size="sm" variant="outline" onClick={forgetToken}>
                <SignOutIcon data-icon="inline-start" weight="duotone" />
                清除口令
              </Button>
            </div>
            <details className="rounded-md border bg-muted/20 p-3">
              <summary className="cursor-pointer text-xs font-medium">给技术支持查看启动变量</summary>
              <pre className="mt-3 overflow-x-auto text-xs/relaxed">
                {`AIWORKER_CONTROL_PLANE_DIR=/path/to/control-plane \\
AIWORKER_WEB_ADMIN_TOKEN=<secret> \\
bun run dev`}
              </pre>
            </details>
          </FieldGroup>
        </div>
      </details>
    </div>
  )
}

function adminAuthDescription(auth: { loginRequired: boolean, userEmail?: string, via?: 'session' | 'token' }): string {
  if (auth.userEmail)
    return auth.userEmail
  if (auth.via === 'token')
    return '已使用浏览器口令授权。'
  if (auth.loginRequired)
    return '请先登录管理员账号。'
  return '本机演示模式；远程使用前请启用正式登录。'
}

interface DashboardTask {
  actionLabel: string
  assignment: AssignmentSummary
  reason: string
  statusLabel: string
  title: string
  tone: Tone
}

function buildDashboardFocus(data: AdminConsoleData): {
  assignment?: AssignmentSummary
  description: string
  primaryLabel: string
  primaryTone: Tone
  providerHealth: string
  providerLabel: string
  providerTone: Tone
  title: string
} {
  const blocked = data.assignments.find(assignment => assignment.status === 'needs_attention')
  const handoffReady = data.assignments.find(assignment => assignment.status === 'handoff_ready')
  const inProgress = data.assignments.find(assignment => ['draft', 'provisioning', 'workspace_projected'].includes(assignment.status))
  const pendingApprovals = data.approvals.filter(approval => approval.status === 'pending').length
  const providerNeedsAttention = data.providerProfiles.filter(provider => provider.status !== 'ready').length
  const assignment = blocked ?? handoffReady ?? inProgress

  return {
    assignment,
    description: assignment
      ? assignment.nextStep
      : pendingApprovals
        ? `${pendingApprovals} 个确认项仍在队列中，先处理员工开通。`
        : '所有员工开通都没有阻塞项。',
    primaryLabel: blocked ? '需处理' : handoffReady ? '待发送' : pendingApprovals ? '待确认' : '正常',
    primaryTone: blocked ? 'destructive' : handoffReady || pendingApprovals ? 'warning' : 'success',
    providerHealth: providerNeedsAttention ? `${providerNeedsAttention} 个后台账号需要技术支持确认` : '后台账号状态正常',
    providerLabel: providerNeedsAttention ? '需确认' : '正常',
    providerTone: providerNeedsAttention ? 'warning' : 'success',
    title: blocked ? '先处理卡住的员工' : handoffReady ? '先发送员工入口' : pendingApprovals ? '先确认开通内容' : '员工开通状态正常',
  }
}

function buildDashboardTaskQueue(data: AdminConsoleData): DashboardTask[] {
  return data.assignments
    .filter(assignment => assignment.status !== 'ready')
    .sort((left, right) => dashboardTaskPriority(left) - dashboardTaskPriority(right))
    .map((assignment) => {
      const status = statusMeta[assignment.status]
      if (assignment.status === 'needs_attention') {
        return {
          actionLabel: '处理员工入口',
          assignment,
          reason: assignment.nextStep,
          statusLabel: status.label,
          title: `处理 ${assignment.assignedEmail} 的入口问题`,
          tone: status.tone,
        }
      }
      if (assignment.status === 'handoff_ready') {
        return {
          actionLabel: '发送员工入口',
          assignment,
          reason: assignment.nextStep,
          statusLabel: status.label,
          title: `发送 ${assignment.assignedEmail} 的使用入口`,
          tone: status.tone,
        }
      }
      if (assignment.status === 'workspace_projected') {
        return {
          actionLabel: '确认设备并发送入口',
          assignment,
          reason: assignment.nextStep,
          statusLabel: status.label,
          title: `确认 ${assignment.assignedEmail} 的设备`,
          tone: status.tone,
        }
      }
      return {
        actionLabel: '确认开通内容',
        assignment,
        reason: assignment.nextStep,
        statusLabel: status.label,
        title: `确认 ${assignment.assignedEmail} 的开通内容`,
        tone: status.tone,
      }
    })
}

function dashboardTaskPriority(assignment: AssignmentSummary): number {
  if (assignment.status === 'needs_attention')
    return 0
  if (assignment.status === 'handoff_ready')
    return 1
  if (assignment.status === 'workspace_projected')
    return 2
  if (assignment.status === 'provisioning')
    return 3
  return 4
}

function DashboardTaskCard({ data, prominent = false, task }: { data: AdminConsoleData, prominent?: boolean, task: DashboardTask }) {
  const { assignment } = task
  const soul = getSoulRelease(assignment.soulReleaseId, data)
  const environment = getEnvironment(assignment.environmentId, data)

  return (
    <div className={`rounded-md border bg-muted/20 p-4 ${prominent ? 'ring-1 ring-primary/20' : ''}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium">{task.title}</p>
          <p className="mt-1 text-xs/relaxed text-muted-foreground">
            {assignment.assignedEmail}
            {' '}
            ·
            {' '}
            {assignment.team}
          </p>
        </div>
        <StatusBadge tone={task.tone}>{task.statusLabel}</StatusBadge>
      </div>
      <p className="mt-3 text-xs/relaxed text-foreground">{task.reason}</p>
      <div className="mt-3 grid grid-cols-1 gap-2 text-xs/relaxed md:grid-cols-3">
        <div>
          <p className="text-muted-foreground">能力</p>
          <p className="truncate font-medium">{soul.displayName}</p>
        </div>
        <div>
          <p className="text-muted-foreground">设备</p>
          <p className="truncate font-medium">
            {environment.ownerEmail === assignment.assignedEmail ? '员工本人设备' : `${environment.ownerEmail} 代管设备`}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">更新时间</p>
          <p className="truncate font-medium">{assignment.updatedAt}</p>
        </div>
      </div>
      {prominent
        ? (
            <Button asChild className="mt-4" size="sm">
              <Link to="/provisioning">
                <ArrowRightIcon data-icon="inline-start" weight="duotone" />
                {task.actionLabel}
              </Link>
            </Button>
          )
        : null}
    </div>
  )
}
