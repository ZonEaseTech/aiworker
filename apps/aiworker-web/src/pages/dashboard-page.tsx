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
  const tokenLocation = tokenState.location === 'local' ? 'local storage' : tokenState.location === 'session' ? 'session storage' : 'not stored'
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
        eyebrow="Manager overview"
        title="AIWorker 分发控制台"
        description="管理 Soul release、Paseo environment、provider profile 和 assignment handoff。员工侧工作区、session、日志与权限提示全部留在 Paseo。"
        actions={<StatusBadge tone="info">Bun + Vite</StatusBadge>}
      />
      <BoundaryAlert />
      <Card>
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Admin bootstrap</CardTitle>
            <CardDescription>Private Web control plane for AIWorker metadata only.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={bootstrap.source === 'control-plane' ? 'success' : 'warning'}>
              {loadError ? 'Control-plane unavailable' : bootstrap.source === 'control-plane' ? 'Live control-plane' : 'Fixture preview'}
            </StatusBadge>
            <StatusBadge tone={bootstrap.adminTokenRequired ? tokenState.stored ? 'success' : 'warning' : 'info'}>
              {bootstrap.adminTokenRequired ? tokenState.stored ? 'Token ready' : 'Token needed' : 'No token required'}
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
                <FieldTitle>Control-plane directory</FieldTitle>
                <FieldDescription>{bootstrap.controlPlaneDirConfigured ? 'AIWORKER_CONTROL_PLANE_DIR is bound for persisted approvals, apply, and pair.' : 'Fixture mode keeps approvals in this page only.'}</FieldDescription>
              </FieldContent>
              <StatusBadge tone={bootstrap.controlPlaneDirConfigured ? 'success' : 'warning'}>
                {bootstrap.controlPlaneDirConfigured ? 'Bound' : 'Fixture'}
              </StatusBadge>
            </Field>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>Web binding</FieldTitle>
                <FieldDescription>
                  {bootstrap.host}
                  {' '}
                  ·
                  {bootstrap.remoteAccessEnabled ? ' remote binding allowed' : ' loopback only'}
                </FieldDescription>
              </FieldContent>
              <StatusBadge tone={bootstrap.remoteAccessEnabled ? 'warning' : 'success'}>
                {bootstrap.remoteAccessEnabled ? 'Remote' : 'Loopback'}
              </StatusBadge>
            </Field>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>Administrator session</FieldTitle>
                <FieldDescription>
                  {adminAuthDescription(bootstrap.auth)}
                </FieldDescription>
              </FieldContent>
              <StatusBadge tone={bootstrap.auth.authenticated ? 'success' : bootstrap.auth.loginRequired ? 'warning' : 'info'}>
                {bootstrap.auth.via === 'token' ? 'Token authorized' : bootstrap.auth.authenticated ? 'Signed in' : bootstrap.auth.loginRequired ? 'Sign-in required' : 'Local'}
              </StatusBadge>
            </Field>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>Browser token</FieldTitle>
                <FieldDescription>{tokenLocation}</FieldDescription>
              </FieldContent>
              <StatusBadge tone={tokenState.stored ? 'success' : bootstrap.adminTokenRequired ? 'warning' : 'info'}>
                {tokenState.stored ? 'Stored' : 'Empty'}
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
                    Sign in
                  </a>
                </Button>
              )}
              {showSignOut && (
                <Button asChild size="sm" variant="outline">
                  <a href={bootstrap.auth.logoutUrl}>
                    <SignOutIcon data-icon="inline-start" weight="duotone" />
                    Sign out
                  </a>
                </Button>
              )}
            </div>
            <Field>
              <FieldLabel htmlFor="admin-token">Admin token</FieldLabel>
              <Input
                id="admin-token"
                autoComplete="off"
                onChange={event => setTokenInput(event.target.value)}
                placeholder="AIWORKER_WEB_ADMIN_TOKEN"
                type="password"
                value={tokenInput}
              />
              <FieldDescription>The token stays in this browser storage and is sent as a bearer header for admin-data reads and state-changing Web API calls.</FieldDescription>
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button disabled={!tokenInput.trim()} size="sm" onClick={() => saveToken(false)}>
                <ShieldCheckIcon data-icon="inline-start" weight="duotone" />
                Use for session
              </Button>
              <Button disabled={!tokenInput.trim()} size="sm" variant="outline" onClick={() => saveToken(true)}>
                <FloppyDiskIcon data-icon="inline-start" weight="duotone" />
                Remember on this device
              </Button>
              <Button disabled={!tokenState.stored} size="sm" variant="outline" onClick={forgetToken}>
                <SignOutIcon data-icon="inline-start" weight="duotone" />
                Clear token
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
    return 'Token authorized'
  if (mode === 'logto')
    return authenticated ? 'Logto signed in' : 'Logto required'
  if (mode === 'misconfigured')
    return 'Auth misconfigured'
  if (mode === 'locked')
    return 'Auth locked'
  return 'Local bootstrap'
}

function adminAuthDescription(auth: { loginRequired: boolean, userEmail?: string, via?: 'session' | 'token' }): string {
  if (auth.userEmail)
    return auth.userEmail
  if (auth.via === 'token')
    return 'Authorized by the browser admin token for this control-plane session.'
  if (auth.loginRequired)
    return 'Sign in with Logto before using the browser admin surface.'
  return 'Local bootstrap mode; use Logto before exposing this app remotely.'
}
