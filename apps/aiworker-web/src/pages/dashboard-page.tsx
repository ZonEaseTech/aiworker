import { FloppyDiskIcon, ShieldCheckIcon, SignOutIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { AssignmentTableCard } from '@/components/assignments/assignment-table-card'
import { AuditCard } from '@/components/audit/audit-card'
import { BoundaryAlert } from '@/components/boundary-alert'
import { PageHeader } from '@/components/page-header'
import { RemediationAlert } from '@/components/remediation-alert'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { clearAdminToken, readAdminTokenStorageState, saveAdminToken } from '@/lib/admin-api-client'
import { useAdminData } from '@/lib/admin-data-context'
import { adminRemediation } from '@/lib/admin-remediation'

export function DashboardPage() {
  const { bootstrap, data, loadError, reload } = useAdminData()
  const [tokenInput, setTokenInput] = useState('')
  const [tokenState, setTokenState] = useState(readAdminTokenStorageState)
  const tokenLocation = tokenState.location === 'local' ? '本地存储' : tokenState.location === 'session' ? '会话存储' : '未存储'
  const showSignIn = bootstrap.auth.loginRequired && !bootstrap.auth.authenticated
  const showSignOut = bootstrap.auth.via === 'session'

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
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="管理员总览"
        title="AIWorker 分发控制台"
        description="管理 Soul release、Paseo environment、provider profile 和 assignment handoff。员工侧工作区、session、日志与权限提示全部留在 Paseo。"
        actions={<StatusBadge tone="info">Bun + Vite</StatusBadge>}
      />
      <BoundaryAlert />
      <Card>
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>管理员引导</CardTitle>
            <CardDescription>仅用于 AIWorker 元数据的私有 Web control-plane。</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={bootstrap.source === 'control-plane' ? 'success' : 'warning'}>
              {loadError ? 'control-plane 不可用' : bootstrap.source === 'control-plane' ? '已连接 control-plane' : 'Fixture 预览'}
            </StatusBadge>
            <StatusBadge tone={bootstrap.adminTokenRequired ? tokenState.stored ? 'success' : 'warning' : 'info'}>
              {bootstrap.adminTokenRequired ? tokenState.stored ? 'token 就绪' : '需要 token' : '无需 token'}
            </StatusBadge>
            <StatusBadge tone={bootstrap.auth.mode === 'logto' ? bootstrap.auth.authenticated ? 'success' : 'warning' : bootstrap.auth.mode === 'local' ? 'info' : 'warning'}>
              {authModeLabel(bootstrap.auth.mode, bootstrap.auth.authenticated, bootstrap.auth.via)}
            </StatusBadge>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
          <FieldGroup>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>control-plane 目录</FieldTitle>
                <FieldDescription>{bootstrap.controlPlaneDirConfigured ? '已绑定 AIWORKER_CONTROL_PLANE_DIR，用于持久化审批、apply 与 pair。' : 'Fixture 模式下审批只保存在本页面。'}</FieldDescription>
              </FieldContent>
              <StatusBadge tone={bootstrap.controlPlaneDirConfigured ? 'success' : 'warning'}>
                {bootstrap.controlPlaneDirConfigured ? '已绑定' : 'Fixture'}
              </StatusBadge>
            </Field>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>Web 绑定</FieldTitle>
                <FieldDescription>
                  {bootstrap.host}
                  {' '}
                  ·
                  {bootstrap.remoteAccessEnabled ? ' 允许远程绑定' : ' 仅 loopback'}
                </FieldDescription>
              </FieldContent>
              <StatusBadge tone={bootstrap.remoteAccessEnabled ? 'warning' : 'success'}>
                {bootstrap.remoteAccessEnabled ? '远程' : 'Loopback'}
              </StatusBadge>
            </Field>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>管理员会话</FieldTitle>
                <FieldDescription>
                  {adminAuthDescription(bootstrap.auth)}
                </FieldDescription>
              </FieldContent>
              <StatusBadge tone={bootstrap.auth.authenticated ? 'success' : bootstrap.auth.loginRequired ? 'warning' : 'info'}>
                {bootstrap.auth.via === 'token' ? 'token 已授权' : bootstrap.auth.authenticated ? '已登录' : bootstrap.auth.loginRequired ? '需要登录' : '本地'}
              </StatusBadge>
            </Field>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>浏览器 token</FieldTitle>
                <FieldDescription>{tokenLocation}</FieldDescription>
              </FieldContent>
              <StatusBadge tone={tokenState.stored ? 'success' : bootstrap.adminTokenRequired ? 'warning' : 'info'}>
                {tokenState.stored ? '已存储' : '空'}
              </StatusBadge>
            </Field>
            {loadError ? <RemediationAlert remediation={loadError} /> : null}
            {!bootstrap.controlPlaneDirConfigured ? <RemediationAlert remediation={adminRemediation('control_plane_dir_required')} /> : null}
            {bootstrap.auth.remediationCode ? <RemediationAlert remediation={adminRemediation(bootstrap.auth.remediationCode)} /> : null}
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
                    退出登录
                  </a>
                </Button>
              )}
            </div>
            <Field>
              <FieldLabel htmlFor="admin-token">管理员 token</FieldLabel>
              <Input
                id="admin-token"
                autoComplete="off"
                onChange={event => setTokenInput(event.target.value)}
                placeholder="AIWORKER_WEB_ADMIN_TOKEN"
                type="password"
                value={tokenInput}
              />
              <FieldDescription>token 只保存在本浏览器存储，并作为 bearer 头用于 admin-data 读取与会改变状态的 Web API 调用。</FieldDescription>
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button disabled={!tokenInput.trim()} size="sm" onClick={() => saveToken(false)}>
                <ShieldCheckIcon data-icon="inline-start" weight="duotone" />
                本次会话使用
              </Button>
              <Button disabled={!tokenInput.trim()} size="sm" variant="outline" onClick={() => saveToken(true)}>
                <FloppyDiskIcon data-icon="inline-start" weight="duotone" />
                在本设备记住
              </Button>
              <Button disabled={!tokenState.stored} size="sm" variant="outline" onClick={forgetToken}>
                <SignOutIcon data-icon="inline-start" weight="duotone" />
                清除 token
              </Button>
            </div>
            <pre className="overflow-x-auto rounded-md border bg-muted/30 p-3 text-xs/relaxed">
              {`AIWORKER_CONTROL_PLANE_DIR=/path/to/control-plane \\
AIWORKER_WEB_ADMIN_TOKEN=<secret> \\
bun run dev`}
            </pre>
          </FieldGroup>
        </CardContent>
      </Card>
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {data.metrics.map(metric => (
          <Card key={metric.label}>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardDescription>{metric.label}</CardDescription>
                <CardTitle className="mt-2 text-2xl">{metric.value}</CardTitle>
              </div>
              <StatusBadge tone={metric.tone}>
                <metric.icon weight="duotone" />
              </StatusBadge>
            </CardHeader>
            <CardContent>
              <p className="text-xs/relaxed text-muted-foreground">{metric.helper}</p>
            </CardContent>
          </Card>
        ))}
      </section>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.45fr_0.9fr]">
        <AssignmentTableCard title="最近 assignments" assignments={data.assignments} />
        <AuditCard />
      </div>
    </div>
  )
}

function authModeLabel(mode: 'local' | 'locked' | 'logto' | 'misconfigured', authenticated: boolean, via?: 'session' | 'token'): string {
  if (via === 'token')
    return 'token 已授权'
  if (mode === 'logto')
    return authenticated ? 'Logto 已登录' : '需要 Logto'
  if (mode === 'misconfigured')
    return '鉴权配置有误'
  if (mode === 'locked')
    return '鉴权已锁定'
  return '本地引导'
}

function adminAuthDescription(auth: { loginRequired: boolean, userEmail?: string, via?: 'session' | 'token' }): string {
  if (auth.userEmail)
    return auth.userEmail
  if (auth.via === 'token')
    return '本次 control-plane 会话由浏览器管理员 token 授权。'
  if (auth.loginRequired)
    return '使用浏览器管理界面前请先用 Logto 登录。'
  return '本地引导模式；远程暴露本应用前请先启用 Logto。'
}
