import type { AssignmentSummary, CockpitFocusBucket, CockpitRow } from '@/lib/admin-data'
import { ArrowRightIcon, CheckCircleIcon, FloppyDiskIcon, ShieldCheckIcon, SignOutIcon } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'

import { AssignmentDetailSheet } from '@/components/assignment-detail-sheet'
import { CockpitRowAction } from '@/components/cockpit/cockpit-row-action'
import { ProvisioningWizard } from '@/components/forms/provisioning-wizard'
import { PageHeader } from '@/components/page-header'
import { RemediationAlert } from '@/components/remediation-alert'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { clearAdminToken, readAdminTokenStorageState, saveAdminToken } from '@/lib/admin-api-client'
import { buildCockpitFocusCounts, buildCockpitRows } from '@/lib/admin-data'
import { useAdminData } from '@/lib/admin-data-context'
import { adminRemediation } from '@/lib/admin-remediation'

type FocusFilter = 'all' | CockpitFocusBucket

interface FocusPill {
  key: FocusFilter
  label: string
  count: number
  tone: 'default' | 'secondary' | 'success' | 'warning' | 'info' | 'destructive' | 'outline'
}

export function DashboardPage() {
  const { bootstrap, data, loadError, reload } = useAdminData()
  const [tokenInput, setTokenInput] = useState('')
  const [tokenState, setTokenState] = useState(readAdminTokenStorageState)
  const [focusFilter, setFocusFilter] = useState<FocusFilter>('all')
  const [query, setQuery] = useState('')
  const [detailAssignment, setDetailAssignment] = useState<AssignmentSummary | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const tokenLocation = tokenState.location === 'local' ? 'local storage' : tokenState.location === 'session' ? 'session storage' : 'not stored'
  const showSignIn = bootstrap.auth.loginRequired && !bootstrap.auth.authenticated
  const showSignOut = bootstrap.auth.via === 'session'
  const liveDataUnavailable = Boolean(loadError)

  const rows = useMemo(() => (liveDataUnavailable ? [] : buildCockpitRows(data)), [data, liveDataUnavailable])
  const counts = useMemo(() => buildCockpitFocusCounts(rows), [rows])
  const pills = useMemo<FocusPill[]>(() => ([
    { key: 'all', label: '全部', count: counts.total, tone: 'outline' },
    { key: 'needs-action', label: '需我处理', count: counts.needsProvision + counts.needsPairing + counts.failing, tone: 'destructive' },
    { key: 'in-progress', label: '进行中', count: counts.inProgress, tone: 'info' },
    { key: 'done', label: '已开通', count: counts.done, tone: 'success' },
    { key: 'inactive', label: '已停用', count: counts.inactive, tone: 'secondary' },
  ]), [counts])

  const visibleRows = useMemo(() => filterCockpitRows(rows, focusFilter, query), [rows, focusFilter, query])

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

  function openDetail(assignment: AssignmentSummary) {
    setDetailAssignment(assignment)
    setDetailOpen(true)
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="操作台"
        title="员工开通操作台"
        description="这里以“员工 × 目标机”为主线：一眼看到谁需要处理，就地开通、发入口或重试。员工真正使用 AIWorker 在 Paseo 客户端里完成。"
        actions={liveDataUnavailable ? undefined : <ProvisioningWizard />}
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
            <Card>
              <CardHeader>
                <CardTitle>需我处理</CardTitle>
                <CardDescription>失败与待办已置顶排序；点分组只看某一类，用搜索按员工邮箱或能力名过滤。</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  {pills.map(pill => (
                    <button
                      key={pill.key}
                      type="button"
                      onClick={() => setFocusFilter(current => current === pill.key ? 'all' : pill.key)}
                      aria-pressed={focusFilter === pill.key}
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${focusFilter === pill.key ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <span>{pill.label}</span>
                        <StatusBadge tone={pill.count ? pill.tone : 'outline'}>{pill.count}</StatusBadge>
                      </span>
                    </button>
                  ))}
                </div>
                <Field>
                  <FieldLabel htmlFor="cockpit-search">搜索</FieldLabel>
                  <Input
                    id="cockpit-search"
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder="员工邮箱 / 能力名，例如 alice@example.com 或 AIWorker Freeform"
                    aria-label="按员工邮箱或能力名搜索"
                  />
                </Field>
              </CardContent>
            </Card>
          )
        : null}

      {!liveDataUnavailable
        ? (
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle>员工开通列表</CardTitle>
                    <CardDescription>每行是一位员工在一台目标机上的开通；行内动作随状态变化。</CardDescription>
                  </div>
                  <StatusBadge tone={visibleRows.length ? 'info' : 'outline'}>
                    {visibleRows.length}
                    {' '}
                    条
                  </StatusBadge>
                </div>
              </CardHeader>
              <CardContent>
                {visibleRows.length
                  ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-56">员工</TableHead>
                            <TableHead>能力 Soul</TableHead>
                            <TableHead>目标机 Environment</TableHead>
                            <TableHead className="w-24">状态</TableHead>
                            <TableHead className="w-40 text-right">操作</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {visibleRows.map(row => (
                            <CockpitTableRow key={row.assignment.id} row={row} onView={openDetail} />
                          ))}
                        </TableBody>
                      </Table>
                    )
                  : (
                      <div className="rounded-md border bg-muted/20 p-6 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <CheckCircleIcon weight="duotone" />
                          <p className="text-sm font-medium">
                            {rows.length ? '没有符合筛选的员工开通' : '还没有员工开通记录'}
                          </p>
                        </div>
                        <p className="mt-2 text-xs/relaxed text-muted-foreground">
                          {rows.length
                            ? '调整分组或清空搜索，或从右上角“+ 新开通”给新员工开通。'
                            : '从右上角“+ 新开通”给第一位员工开通 AIWorker：选员工、选能力，机器和账号会智能带出。'}
                        </p>
                      </div>
                    )}
              </CardContent>
            </Card>
          )
        : null}

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

      <AssignmentDetailSheet assignment={detailAssignment} open={detailOpen} onOpenChange={setDetailOpen} />
    </div>
  )
}

function CockpitTableRow({ row, onView }: { row: CockpitRow, onView: (assignment: AssignmentSummary) => void }) {
  const { assignment } = row
  const attention = assignment.status === 'needs_attention'
  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{assignment.assignedEmail}</div>
        <div className="text-[0.625rem] text-muted-foreground">{assignment.team}</div>
      </TableCell>
      <TableCell>
        <div className="max-w-[16rem] truncate text-xs">{row.soulDisplayName}</div>
      </TableCell>
      <TableCell>
        <div className="max-w-[16rem] truncate text-xs">{row.environmentLabel}</div>
      </TableCell>
      <TableCell>
        <StatusBadge tone={row.statusTone}>{row.statusLabel}</StatusBadge>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex flex-col items-end gap-1">
          <CockpitRowAction row={row} onView={onView} />
          {attention
            ? <p className="max-w-[14rem] text-[0.625rem]/relaxed text-destructive">{failureReason(row)}</p>
            : null}
        </div>
      </TableCell>
    </TableRow>
  )
}

function failureReason(row: CockpitRow): string {
  const blocking = row.gate.blockingChecks[0]
  if (blocking)
    return blocking.detail
  return row.assignment.nextStep
}

function filterCockpitRows(rows: CockpitRow[], focus: FocusFilter, query: string): CockpitRow[] {
  const normalized = query.trim().toLowerCase()
  return rows.filter((row) => {
    if (focus !== 'all' && row.focusBucket !== focus)
      return false
    if (!normalized)
      return true
    return row.assignment.assignedEmail.toLowerCase().includes(normalized)
      || row.soulDisplayName.toLowerCase().includes(normalized)
  })
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
