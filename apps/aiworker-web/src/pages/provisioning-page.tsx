import type { AdminConsoleData, ApprovalStatus } from '@/lib/admin-data'
import { CheckCircleIcon, PlayCircleIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'

import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from '@/components/ui/field'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { adminMutationHeaders } from '@/lib/admin-api-client'
import {
  adminConsoleData,
  approvalCheckStatusMeta,
  approvalStatusMeta,
  environmentStatusMeta,
  getApprovalForAssignment,
  getAssignmentForPlan,
  getEnvironment,
  getProviderProfile,
  getSoulRelease,
  getTraceEventsForAssignment,
  providerStatusMeta,
  releaseStatusMeta,
} from '@/lib/admin-data'
import { useAdminData } from '@/lib/admin-data-context'

interface ApplyJobStep {
  id: string
  label: string
  status: 'done' | 'needs_attention' | 'failed'
}

export function ProvisioningPage() {
  const { data: adminData, decideApproval, isLive } = useAdminData()
  const [selectedSoul, setSelectedSoul] = useState(adminData.soulReleases[0]?.id ?? '')
  const [selectedEnvironment, setSelectedEnvironment] = useState(adminData.environments[0]?.id ?? '')
  const [selectedProvider, setSelectedProvider] = useState(adminData.providerProfiles[0]?.id ?? '')
  const [selectedAssignmentId, setSelectedAssignmentId] = useState(adminData.assignments[0]?.id ?? '')
  const [previewDecisionByAssignment, setPreviewDecisionByAssignment] = useState<Record<string, ApprovalStatus>>({})
  const [approvalError, setApprovalError] = useState<string | null>(null)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [applyStepsByAssignment, setApplyStepsByAssignment] = useState<Record<string, ApplyJobStep[]>>({})
  const [pairError, setPairError] = useState<string | null>(null)
  const [pairingAssignmentId, setPairingAssignmentId] = useState<string | null>(null)
  const [pairingOutputByAssignment, setPairingOutputByAssignment] = useState<Record<string, string>>({})
  const selectedAssignment = adminData.assignments.find(item => item.id === selectedAssignmentId)
  const tupleAssignment = getAssignmentForPlan(selectedEnvironment, selectedSoul, selectedProvider, adminData)
  const assignment = tupleAssignment?.id === selectedAssignment?.id ? selectedAssignment : tupleAssignment
  const environment = getEnvironment(assignment?.environmentId ?? selectedEnvironment, adminData)
  const provider = getProviderProfile(assignment?.providerProfileId ?? selectedProvider, adminData)
  const soul = getSoulRelease(assignment?.soulReleaseId ?? selectedSoul, adminData)
  const approval = assignment ? getApprovalForAssignment(assignment.id, adminData) : undefined
  const traceEvents = assignment ? getTraceEventsForAssignment(assignment.id, adminData) : []
  const effectiveApprovalStatus = assignment
    ? resolvePreviewApprovalStatus(assignment.id, previewDecisionByAssignment, approval?.status)
    : approval?.status
  const applySteps = assignment ? applyStepsByAssignment[assignment.id] : undefined
  const pairingOutput = assignment ? pairingOutputByAssignment[assignment.id] : undefined

  useEffect(() => {
    if (!adminData.assignments.some(item => item.id === selectedAssignmentId))
      setSelectedAssignmentId(adminData.assignments[0]?.id ?? '')
    if (!adminData.environments.some(item => item.id === selectedEnvironment))
      setSelectedEnvironment(adminData.environments[0]?.id ?? '')
    if (!adminData.soulReleases.some(item => item.id === selectedSoul))
      setSelectedSoul(adminData.soulReleases[0]?.id ?? '')
    if (!adminData.providerProfiles.some(item => item.id === selectedProvider))
      setSelectedProvider(adminData.providerProfiles[0]?.id ?? '')
  }, [adminData, selectedAssignmentId, selectedEnvironment, selectedProvider, selectedSoul])

  useEffect(() => {
    setSelectedAssignmentId(resolveAssignmentIdentityForTuple(selectedEnvironment, selectedSoul, selectedProvider, adminData))
  }, [adminData, selectedEnvironment, selectedProvider, selectedSoul])

  async function previewDecision(status: ApprovalStatus) {
    if (!assignment)
      return

    setApprovalError(null)
    setPreviewDecisionByAssignment(current => ({
      ...current,
      [assignment.id]: status,
    }))
    if (isLive) {
      try {
        await decideApproval(assignment.id, status)
      }
      catch (error) {
        setApprovalError(error instanceof Error ? error.message : String(error))
      }
    }
  }

  async function runApplyJob() {
    if (!assignment)
      return

    setApplyError(null)
    try {
      const response = await fetch(`/api/assignments/${encodeURIComponent(assignment.id)}/apply`, {
        headers: adminMutationHeaders(),
        method: 'POST',
      })
      if (!response.ok)
        throw new Error(`apply job failed: ${response.status}`)
      const payload = await response.json() as { job: { steps: ApplyJobStep[] } }
      setApplyStepsByAssignment(current => ({
        ...current,
        [assignment.id]: payload.job.steps,
      }))
    }
    catch (error) {
      setApplyError(error instanceof Error ? error.message : String(error))
    }
  }

  async function runPairJob() {
    if (!assignment)
      return

    setPairError(null)
    setPairingAssignmentId(assignment.id)
    try {
      const response = await fetch(`/api/assignments/${encodeURIComponent(assignment.id)}/pair`, {
        headers: adminMutationHeaders(),
        method: 'POST',
      })
      if (!response.ok)
        throw new Error(`pairing request failed: ${response.status}`)
      const payload = await response.json() as { pair: { pairingOutput: string } }
      setPairingOutputByAssignment(current => ({
        ...current,
        [assignment.id]: payload.pair.pairingOutput,
      }))
    }
    catch (error) {
      setPairError(error instanceof Error ? error.message : String(error))
    }
    finally {
      setPairingAssignmentId(current => current === assignment.id ? null : current)
    }
  }

  function selectAssignment(id: string) {
    const selected = resolveAssignmentSelectionState(id, adminData)
    if (!selected)
      return

    setSelectedAssignmentId(selected.assignmentId)
    setSelectedEnvironment(selected.environmentId)
    setSelectedSoul(selected.soulReleaseId)
    setSelectedProvider(selected.providerProfileId)
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Provisioning"
        title="生成 assignment plan"
        description="该页面只预览 AIWorker 将执行的 aissh/projection/handoff 元数据，不会展示 provider secret，也不会连接 Paseo runtime。"
        actions={(
          <Button size="sm">
            <PlayCircleIcon data-icon="inline-start" weight="duotone" />
            预览审批计划
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
                <FieldLabel>Assignment identity</FieldLabel>
                <Select value={assignment?.id ?? selectedAssignmentId} onValueChange={selectAssignment}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {adminData.assignments.map(item => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.assignedEmail}
                          {' '}
                          ·
                          {item.workspaceRef}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Paseo environment</FieldLabel>
                <Select value={selectedEnvironment} onValueChange={setSelectedEnvironment}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {adminData.environments.map(item => (
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
                      {adminData.soulReleases.map(item => (
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
                      {adminData.providerProfiles.map(item => (
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
              {`aiworker plan \\
  --user ${assignment?.assignedEmail ?? environment.ownerEmail} \\
  --target ${environment.targetRef} \\
  --environment ${environment.id} \\
  --provider ${provider.id} \\
  --soul ${soul.descriptorRef}`}
            </pre>
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <CardTitle>Approval gate</CardTitle>
            <CardDescription>管理员审批 AIWorker plan/projection/handoff 元数据；连接 control-plane 后会写入 approvals.jsonl。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Alert>
              <WarningCircleIcon weight="duotone" />
              <AlertTitle>{isLive ? 'Control API connected' : 'Fixture preview mode'}</AlertTitle>
              <AlertDescription>
                {isLive
                  ? '批准/退回会持久化到 AIWorker approvals.jsonl；不会触发 aissh，也不会连接 Paseo runtime。'
                  : '未配置 AIWORKER_CONTROL_PLANE_DIR 时只更新本页预览状态；不会持久化，也不会触发 aissh 或 Paseo。'}
              </AlertDescription>
            </Alert>
            {approvalError ? <p className="text-xs text-destructive">{approvalError}</p> : null}
            {approval && effectiveApprovalStatus
              ? (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{approval.title}</p>
                        <p className="mt-1 text-xs/relaxed text-muted-foreground">
                          reviewer:
                          {' '}
                          {approval.reviewer}
                          {' '}
                          · submitted:
                          {' '}
                          {approval.submittedAt}
                        </p>
                      </div>
                      <StatusBadge tone={approvalStatusMeta[effectiveApprovalStatus].tone}>
                        {approvalStatusMeta[effectiveApprovalStatus].label}
                      </StatusBadge>
                    </div>
                    <p className="rounded-md border bg-muted/30 p-3 text-xs/relaxed text-muted-foreground">{approval.riskSummary}</p>
                    <FieldGroup>
                      {approval.checks.map(check => (
                        <Field key={check.id} orientation="horizontal">
                          <FieldContent>
                            <FieldTitle>{check.label}</FieldTitle>
                            <FieldDescription>{check.detail}</FieldDescription>
                          </FieldContent>
                          <StatusBadge tone={approvalCheckStatusMeta[check.status].tone}>
                            {approvalCheckStatusMeta[check.status].label}
                          </StatusBadge>
                        </Field>
                      ))}
                    </FieldGroup>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => previewDecision('approved')}>
                        <CheckCircleIcon data-icon="inline-start" weight="duotone" />
                        {isLive ? '批准并记录' : '预览批准'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => previewDecision('changes_requested')}>
                        <WarningCircleIcon data-icon="inline-start" weight="duotone" />
                        {isLive ? '退回并记录' : '预览退回修改'}
                      </Button>
                      <Button disabled={!isLive || effectiveApprovalStatus !== 'approved'} size="sm" onClick={runApplyJob}>
                        <PlayCircleIcon data-icon="inline-start" weight="duotone" />
                        执行已审批交付
                      </Button>
                      <Button disabled={!isLive || effectiveApprovalStatus !== 'approved' || pairingAssignmentId === assignment?.id} size="sm" variant="outline" onClick={runPairJob}>
                        <PlayCircleIcon data-icon="inline-start" weight="duotone" />
                        生成配对链接
                      </Button>
                    </div>
                    {applyError ? <p className="text-xs text-destructive">{applyError}</p> : null}
                    {applySteps
                      ? (
                          <div className="rounded-md border bg-muted/20 p-3">
                            <p className="mb-2 text-xs font-medium">交付进度</p>
                            <FieldGroup>
                              {applySteps.map(step => (
                                <Field key={step.id} orientation="horizontal">
                                  <FieldContent>
                                    <FieldTitle>{step.label}</FieldTitle>
                                  </FieldContent>
                                  <StatusBadge tone={step.status === 'done' ? 'success' : step.status === 'needs_attention' ? 'warning' : 'destructive'}>
                                    {step.status === 'done' ? '完成' : step.status === 'needs_attention' ? '需处理' : '失败'}
                                  </StatusBadge>
                                </Field>
                              ))}
                            </FieldGroup>
                          </div>
                        )
                      : null}
                    <div className="rounded-md border bg-muted/20 p-3 text-xs/relaxed text-muted-foreground">
                      <p className="font-medium text-foreground">配对设备</p>
                      <p className="mt-1">
                        交付完成后点“生成配对链接”：Web 只让 AIWorker CLI 通过 aissh 瞬时调用 Paseo pair，结果只在当前页面显示，不写入 AIWorker 记录。
                      </p>
                      {pairError ? <p className="mt-2 text-destructive">{pairError}</p> : null}
                      {pairingOutput
                        ? (
                            <pre className="mt-3 overflow-x-auto rounded-md border bg-background p-3 text-xs/relaxed text-foreground">
                              {pairingOutput}
                            </pre>
                          )
                        : null}
                    </div>
                    <pre className="overflow-x-auto rounded-md border bg-muted/30 p-3 text-xs/relaxed">{approval.previewCommand}</pre>
                  </>
                )
              : (
                  <p className="text-xs/relaxed text-muted-foreground">当前选择还没有对应 assignment；先保存 plan 后再进入审批队列。</p>
                )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Preview trace timeline</CardTitle>
            <CardDescription>{isLive ? '从 control-plane snapshot 与 approvals.jsonl 派生 request → approval → receipt → handoff 链，不展示 Paseo session 或运行时日志。' : '从 fixture assignment snapshot 派生 request → approval → receipt → handoff 预览链，不展示 Paseo session 或运行时日志。'}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {traceEvents.map(event => (
              <div key={event.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <StatusBadge tone={event.tone}>{event.at}</StatusBadge>
                  <span className="text-xs text-muted-foreground">{event.actor}</span>
                </div>
                <p className="mt-2 text-xs font-medium text-foreground">{event.title}</p>
                <p className="mt-1 text-xs/relaxed text-muted-foreground">{event.detail}</p>
                <p className="mt-2 font-mono text-[0.625rem] text-muted-foreground">{event.evidenceRef}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export function resolvePreviewApprovalStatus(
  assignmentId: string,
  previewDecisionByAssignment: Partial<Record<string, ApprovalStatus>>,
  persistedStatus?: ApprovalStatus,
): ApprovalStatus | undefined {
  return previewDecisionByAssignment[assignmentId] ?? persistedStatus
}

export function resolveAssignmentSelectionState(id: string, data: AdminConsoleData = adminConsoleData): {
  assignmentId: string
  environmentId: string
  providerProfileId: string
  soulReleaseId: string
} | undefined {
  const selected = data.assignments.find(item => item.id === id)
  if (!selected)
    return undefined

  return {
    assignmentId: selected.id,
    environmentId: selected.environmentId,
    providerProfileId: selected.providerProfileId,
    soulReleaseId: selected.soulReleaseId,
  }
}

export function resolveAssignmentIdentityForTuple(
  environmentId: string,
  soulReleaseId: string,
  providerProfileId: string,
  data: AdminConsoleData = adminConsoleData,
): string {
  return getAssignmentForPlan(environmentId, soulReleaseId, providerProfileId, data)?.id ?? ''
}
