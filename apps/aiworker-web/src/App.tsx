import type { AssignmentStatus, AssignmentSummary } from '@/lib/admin-data'
import { EyeIcon, PlayCircleIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'

import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AppSidebar } from '@/components/app-sidebar'
import { AssignmentDetailSheet } from '@/components/assignment-detail-sheet'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  adminConsoleData,
  environmentStatusMeta,
  getEnvironment,
  getProviderProfile,
  getSoulRelease,
  providerStatusMeta,
  releaseStatusMeta,
  statusMeta,
} from '@/lib/admin-data'

const assignmentStatusOptions: Array<AssignmentStatus | 'all'> = [
  'all',
  'draft',
  'provisioning',
  'workspace_projected',
  'handoff_ready',
  'ready',
  'needs_attention',
]

const {
  assignments,
  environments,
  metrics,
  providerProfiles,
  recentAuditEvents,
  soulReleases,
} = adminConsoleData

export function App() {
  return (
    <BrowserRouter>
      <TooltipProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:hidden">
              <SidebarTrigger />
              <span className="text-sm font-semibold">AIWorker</span>
            </header>
            <main className="min-w-0 flex-1 p-4 md:p-6">
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/assignments" element={<AssignmentsPage />} />
                <Route path="/provisioning" element={<ProvisioningPage />} />
                <Route path="/souls" element={<SoulsPage />} />
                <Route path="/environments" element={<EnvironmentsPage />} />
                <Route path="/audit" element={<AuditPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </BrowserRouter>
  )
}

function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Manager overview"
        title="AIWorker 分发控制台"
        description="管理 Soul release、Paseo environment、provider profile 和 assignment handoff。员工侧工作区、session、日志与权限提示全部留在 Paseo。"
        actions={<StatusBadge tone="info">Bun + Vite</StatusBadge>}
      />
      <BoundaryAlert />
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map(metric => (
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
        <AssignmentTableCard title="最近 assignments" assignments={assignments} />
        <AuditCard />
      </div>
    </div>
  )
}

function AssignmentsPage() {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<AssignmentStatus | 'all'>('all')
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return assignments.filter((assignment) => {
      if (status !== 'all' && assignment.status !== status) {
        return false
      }

      if (!normalized) {
        return true
      }

      return [
        assignment.assignedEmail,
        assignment.team,
        assignment.workspaceRef,
        getSoulRelease(assignment.soulReleaseId).displayName,
        getEnvironment(assignment.environmentId).targetRef,
      ].some(value => value.toLowerCase().includes(normalized))
    })
  }, [query, status])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Assignments"
        title="员工 workspace 分配"
        description="查看 assignment lifecycle、workspace ref、provider profile 和 redacted handoff。这里只管理元数据，不进入 Paseo workspace。"
      />
      <Card>
        <CardHeader>
          <CardTitle>筛选</CardTitle>
          <CardDescription>按员工、团队、workspace、Soul 或 target 搜索。</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px]">
            <Field>
              <FieldLabel htmlFor="assignment-search">关键词</FieldLabel>
              <Input
                id="assignment-search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="alice@example.com / finance / workspace"
              />
            </Field>
            <Field>
              <FieldLabel>状态</FieldLabel>
              <Select value={status} onValueChange={value => setStatus(value as AssignmentStatus | 'all')}>
                <SelectTrigger>
                  <SelectValue placeholder="选择状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {assignmentStatusOptions.map(option => (
                      <SelectItem key={option} value={option}>
                        {option === 'all' ? '全部状态' : statusMeta[option].label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
      {filtered.length
        ? (
            <AssignmentTableCard title="Assignment ledger" assignments={filtered} />
          )
        : (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>没有匹配结果</EmptyTitle>
                <EmptyDescription>调整筛选条件，或从 Provisioning 创建新的 assignment plan。</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setQuery('')
                    setStatus('all')
                  }}
                >
                  清空筛选
                </Button>
              </EmptyContent>
            </Empty>
          )}
    </div>
  )
}

function ProvisioningPage() {
  const [selectedSoul, setSelectedSoul] = useState(soulReleases[0].id)
  const [selectedEnvironment, setSelectedEnvironment] = useState(environments[0].id)
  const [selectedProvider, setSelectedProvider] = useState(providerProfiles[0].id)
  const environment = getEnvironment(selectedEnvironment)
  const provider = getProviderProfile(selectedProvider)
  const soul = getSoulRelease(selectedSoul)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Provisioning"
        title="生成 assignment plan"
        description="该页面只预览 AIWorker 将执行的 aissh/projection/handoff 元数据，不会展示 provider secret，也不会连接 Paseo runtime。"
        actions={(
          <Button size="sm">
            <PlayCircleIcon data-icon="inline-start" weight="duotone" />
            预览计划
          </Button>
        )}
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <Card>
          <CardHeader>
            <CardTitle>输入</CardTitle>
            <CardDescription>选择目标员工环境、Soul release 与 provider profile。</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel>Paseo environment</FieldLabel>
                <Select value={selectedEnvironment} onValueChange={setSelectedEnvironment}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {environments.map(item => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.ownerEmail}
                          {' '}
                          ·
                          {item.targetRef}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Soul release</FieldLabel>
                <Select value={selectedSoul} onValueChange={setSelectedSoul}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {soulReleases.map(item => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.displayName}
                          {' '}
                          ·
                          {item.version}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Provider profile</FieldLabel>
                <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {providerProfiles.map(item => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.label}
                          {' '}
                          ·
                          {item.provider}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Redacted plan preview</CardTitle>
            <CardDescription>交付前可复制给审批或审计；secret 只显示 reference。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <FieldGroup>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>Install/verify Paseo</FieldTitle>
                  <FieldDescription>
                    {environment.targetRef}
                    {' '}
                    · PASEO_HOME=
                    {environment.paseoHome}
                  </FieldDescription>
                </FieldContent>
                <StatusBadge tone={environmentStatusMeta[environment.status].tone}>
                  {environmentStatusMeta[environment.status].label}
                </StatusBadge>
              </Field>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>Project workspace files</FieldTitle>
                  <FieldDescription>
                    {soul.fileCount}
                    {' '}
                    files from
                    {' '}
                    {soul.workspaceTemplateRoot}
                  </FieldDescription>
                </FieldContent>
                <StatusBadge tone={releaseStatusMeta[soul.status].tone}>{releaseStatusMeta[soul.status].label}</StatusBadge>
              </Field>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>Provider authentication</FieldTitle>
                  <FieldDescription>{provider.secretRef}</FieldDescription>
                </FieldContent>
                <StatusBadge tone={providerStatusMeta[provider.status].tone}>{providerStatusMeta[provider.status].label}</StatusBadge>
              </Field>
            </FieldGroup>
            <Separator />
            <pre className="overflow-x-auto rounded-md border bg-muted/30 p-3 text-xs/relaxed">
              {`aiworker apply --yes \\
  --user ${environment.ownerEmail} \\
  --target ${environment.targetRef} \\
  --environment ${environment.id} \\
  --paseo-home ${environment.paseoHome} \\
  --paseo-endpoint ${environment.daemonEndpoint} \\
  --provider ${provider.id} \\
  --soul ${soul.descriptorRef} \\
  --workspace <workspace-ref>`}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function SoulsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Soul releases"
        title="版本化 workspace templates"
        description="Soul descriptor 只描述 protocol / identity / workspaceTemplate。这里展示发布状态和投影文件摘要，不解释 Soul 私有领域字段。"
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {soulReleases.map((release) => {
          const meta = releaseStatusMeta[release.status]
          return (
            <Card key={release.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{release.displayName}</CardTitle>
                    <CardDescription className="mt-1">{release.version}</CardDescription>
                  </div>
                  <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-xs/relaxed">
                <p className="text-muted-foreground">{release.summary}</p>
                <div className="rounded-md border bg-muted/30 p-3 font-mono">
                  <p>{release.descriptorRef}</p>
                  <p className="mt-1 text-muted-foreground">
                    {release.fileCount}
                    {' '}
                    projected files
                  </p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function EnvironmentsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Paseo environments"
        title="环境与 provider profile"
        description="一个 Paseo environment 可承载同一员工的多个 workspace。跨员工隔离依赖 OS user/container/VM、独立 PASEO_HOME、endpoint 和 credentials。"
      />
      <Tabs defaultValue="environments">
        <TabsList>
          <TabsTrigger value="environments">Environments</TabsTrigger>
          <TabsTrigger value="providers">Provider profiles</TabsTrigger>
        </TabsList>
        <TabsContent value="environments" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Environment registry</CardTitle>
              <CardDescription>仅保存连接元数据；daemon lifecycle 属于 Paseo。</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Owner</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Endpoint</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {environments.map((environment) => {
                    const meta = environmentStatusMeta[environment.status]
                    return (
                      <TableRow key={environment.id}>
                        <TableCell>
                          <div className="font-medium">{environment.ownerEmail}</div>
                          <div className="font-mono text-[0.625rem] text-muted-foreground">{environment.paseoHome}</div>
                        </TableCell>
                        <TableCell>{environment.targetRef}</TableCell>
                        <TableCell className="font-mono text-xs">{environment.daemonEndpoint}</TableCell>
                        <TableCell><StatusBadge tone={meta.tone}>{meta.label}</StatusBadge></TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="providers" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Provider profile references</CardTitle>
              <CardDescription>literal provider keys never enter descriptors, receipts, logs, UI, or projected files。</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                {providerProfiles.map((profile) => {
                  const meta = providerStatusMeta[profile.status]
                  return (
                    <Card key={profile.id}>
                      <CardHeader>
                        <CardTitle>{profile.label}</CardTitle>
                        <CardDescription>{profile.provider}</CardDescription>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-3 text-xs">
                        <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                        <p className="break-words font-mono text-muted-foreground">{profile.secretRef}</p>
                        {profile.paseoProviderId ? <Badge variant="outline">{profile.paseoProviderId}</Badge> : null}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function AuditPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Audit / Handoff"
        title="交付证据与审计"
        description="展示 redacted receipt、状态迁移和 handoff references。不会展示 provider secret、shell script 全文或 Paseo session 内容。"
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_0.9fr]">
        <AuditCard />
        <Card>
          <CardHeader>
            <CardTitle>Handoff readiness</CardTitle>
            <CardDescription>ready 表示 AIWorker 准备好了 workspace 与 handoff，而不是读取运行时。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {assignments.map(assignment => (
              <div key={assignment.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">{assignment.assignedEmail}</span>
                  <StatusBadge tone={statusMeta[assignment.status].tone}>{statusMeta[assignment.status].label}</StatusBadge>
                </div>
                <p className="mt-2 font-mono text-xs/relaxed text-muted-foreground">{assignment.handoffLabel}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function AssignmentTableCard({ title, assignments: rows }: { title: string, assignments: AssignmentSummary[] }) {
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentSummary | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  function openAssignment(assignment: AssignmentSummary) {
    setSelectedAssignment(assignment)
    setSheetOpen(true)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Assignment lifecycle follows draft → provisioning → projected → handoff → ready.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Soul</TableHead>
              <TableHead>Environment</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((assignment) => {
              const soul = getSoulRelease(assignment.soulReleaseId)
              const environment = getEnvironment(assignment.environmentId)
              const status = statusMeta[assignment.status]
              return (
                <TableRow key={assignment.id}>
                  <TableCell>
                    <div className="font-medium">{assignment.assignedEmail}</div>
                    <div className="text-[0.625rem] text-muted-foreground">{assignment.team}</div>
                  </TableCell>
                  <TableCell>{soul.displayName}</TableCell>
                  <TableCell>
                    <div className="font-mono text-xs">{environment.id}</div>
                    <div className="text-[0.625rem] text-muted-foreground">{environment.targetRef}</div>
                  </TableCell>
                  <TableCell><StatusBadge tone={status.tone}>{status.label}</StatusBadge></TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => openAssignment(assignment)}>
                      <EyeIcon data-icon="inline-start" weight="duotone" />
                      查看
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        <AssignmentDetailSheet assignment={selectedAssignment} open={sheetOpen} onOpenChange={setSheetOpen} />
      </CardContent>
    </Card>
  )
}

function AuditCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent audit events</CardTitle>
        <CardDescription>所有事件都是 AIWorker 元数据事件，不含 Paseo transcript。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {recentAuditEvents.map(event => (
          <div key={event.id} className="flex items-start gap-3 rounded-md border p-3">
            <StatusBadge tone={event.tone}>{event.at}</StatusBadge>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground">{event.action}</p>
              <p className="mt-1 truncate font-mono text-[0.625rem] text-muted-foreground">{event.target}</p>
              <p className="mt-1 text-[0.625rem] text-muted-foreground">{event.actor}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function BoundaryAlert() {
  return (
    <Alert>
      <WarningCircleIcon weight="duotone" />
      <AlertTitle>Runtime boundary</AlertTitle>
      <AlertDescription>
        AIWorker Web is an admin control plane. It can prepare assignments and handoff metadata, but Paseo owns workspace UI, sessions, logs, permissions, and provider process lifecycle.
      </AlertDescription>
    </Alert>
  )
}

export default App
