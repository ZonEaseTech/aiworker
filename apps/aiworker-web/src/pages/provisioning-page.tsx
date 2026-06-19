import type {
  AdminConsoleData,
  ApprovalStatus,
  AssignmentSummary,
  PaseoEnvironmentSummary,
  ProviderProfileSummary,
  ProvisioningApprovalSummary,
  SoulReleaseSummary,
  Tone,
} from '@/lib/admin-data'
import type { AdminRemediation } from '@/lib/admin-remediation'
import { CheckCircleIcon, PlayCircleIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'

import { PageHeader } from '@/components/page-header'
import { RemediationAlert } from '@/components/remediation-alert'
import { StatusBadge } from '@/components/status-badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from '@/components/ui/field'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { AdminApiError, adminMutationHeaders, readAdminApiError } from '@/lib/admin-api-client'
import {
  adminConsoleData,
  approvalCheckStatusMeta,
  approvalStatusMeta,
  environmentStatusMeta,
  getApprovalForAssignment,
  getEnvironment,
  getProviderProfile,
  getSoulRelease,
  getTraceEventsForAssignment,
  providerStatusMeta,
  releaseStatusMeta,
  statusMeta,
} from '@/lib/admin-data'
import { useAdminData } from '@/lib/admin-data-context'
import { adminRemediation } from '@/lib/admin-remediation'

interface ApplyJobStep {
  id: string
  label: string
  status: 'done' | 'needs_attention' | 'failed'
}

interface ApplyJobPayload {
  job: {
    remediation?: AdminRemediation
    steps: ApplyJobStep[]
  }
}

export function ProvisioningPage() {
  const { data: adminData, decideApproval, isLive } = useAdminData()
  const [selectedSoul, setSelectedSoul] = useState(adminData.soulReleases[0]?.id ?? '')
  const [selectedEnvironment, setSelectedEnvironment] = useState(adminData.environments[0]?.id ?? '')
  const [selectedProvider, setSelectedProvider] = useState(adminData.providerProfiles[0]?.id ?? '')
  const [selectedAssignmentId, setSelectedAssignmentId] = useState(adminData.assignments[0]?.id ?? '')
  const [previewDecisionByAssignment, setPreviewDecisionByAssignment] = useState<Record<string, ApprovalStatus>>({})
  const [approvalError, setApprovalError] = useState<AdminRemediation | null>(null)
  const [applyError, setApplyError] = useState<AdminRemediation | null>(null)
  const [applyStepsByAssignment, setApplyStepsByAssignment] = useState<Record<string, ApplyJobStep[]>>({})
  const [applyRemediationByAssignment, setApplyRemediationByAssignment] = useState<Record<string, AdminRemediation>>({})
  const [pairError, setPairError] = useState<AdminRemediation | null>(null)
  const [pairingAssignmentId, setPairingAssignmentId] = useState<string | null>(null)
  const [pairingOutputByAssignment, setPairingOutputByAssignment] = useState<Record<string, string>>({})
  const selectedAssignment = adminData.assignments.find(item => item.id === selectedAssignmentId)
  const assignment = selectedAssignment
  const environment = getEnvironment(assignment?.environmentId ?? selectedEnvironment, adminData)
  const provider = getProviderProfile(assignment?.providerProfileId ?? selectedProvider, adminData)
  const soul = getSoulRelease(assignment?.soulReleaseId ?? selectedSoul, adminData)
  const approval = assignment ? getApprovalForAssignment(assignment.id, adminData) : undefined
  const traceEvents = assignment ? getTraceEventsForAssignment(assignment.id, adminData) : []
  const effectiveApprovalStatus = assignment
    ? resolvePreviewApprovalStatus(assignment.id, previewDecisionByAssignment, approval?.status)
    : approval?.status
  const applySteps = assignment ? applyStepsByAssignment[assignment.id] : undefined
  const applyRemediation = assignment ? applyRemediationByAssignment[assignment.id] : undefined
  const pairingOutput = assignment ? pairingOutputByAssignment[assignment.id] : undefined
  const pairingPreconditionReady = Boolean(
    assignment
    && (
      ['handoff_ready', 'ready', 'needs_attention'].includes(assignment.status)
      || applySteps?.some(step => step.id === 'handoff' && step.status === 'done')
    ),
  )

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
        setApprovalError(remediationFromCaughtError(error))
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
        throw await readAdminApiError(response)
      const payload = await response.json() as ApplyJobPayload
      setApplyStepsByAssignment(current => ({
        ...current,
        [assignment.id]: payload.job.steps,
      }))
      setApplyRemediationByAssignment((current) => {
        const next = { ...current }
        if (payload.job.remediation)
          next[assignment.id] = payload.job.remediation
        else
          delete next[assignment.id]
        return next
      })
    }
    catch (error) {
      setApplyError(remediationFromCaughtError(error))
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
        throw await readAdminApiError(response)
      const payload = await response.json() as { pair: { pairingOutput: string } }
      setPairingOutputByAssignment(current => ({
        ...current,
        [assignment.id]: payload.pair.pairingOutput,
      }))
    }
    catch (error) {
      setPairError(remediationFromCaughtError(error))
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

  const provisioningStages = buildProvisioningStages({
    approval,
    applySteps,
    assignment,
    effectiveApprovalStatus,
    pairingOutput,
    pairingPreconditionReady,
  })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="员工开通"
        title="处理员工开通"
        description="按管理员能理解的顺序推进：选择员工、确认能力和设备、确认开通、开始执行，最后把一次性入口发给员工。"
      />

      <Card className="border-primary/30">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>当前员工</CardTitle>
              <CardDescription>先确认给谁开通、开通什么能力、下一步做什么。</CardDescription>
            </div>
            <CardAction>
              <StatusBadge tone={assignment ? statusMeta[assignment.status].tone : 'warning'}>
                {assignment ? statusMeta[assignment.status].label : '待选择'}
              </StatusBadge>
            </CardAction>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SelectedAssignmentSummary
            assignment={assignment}
            environment={environment}
            provider={provider}
            soul={soul}
          />
          <ProvisioningStageStrip stages={provisioningStages} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle>选择员工</CardTitle>
            <CardDescription>选择要开通 AIWorker 的员工；其余字段用于核对后台配置。</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel>员工</FieldLabel>
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
                          {item.team}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>员工设备</FieldLabel>
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
                          {environmentStatusMeta[item.status].label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>能力模板</FieldLabel>
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
                <FieldLabel>后台 AI 账号</FieldLabel>
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
                          {providerStatusMeta[item.status].label}
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
            <CardTitle>确认开通内容</CardTitle>
            <CardDescription>管理员只需要核对员工、能力和设备；技术配置放在折叠区。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <FieldGroup>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>员工设备</FieldTitle>
                  <FieldDescription>
                    {environment.ownerEmail === assignment?.assignedEmail
                      ? '员工本人设备，技术支持已配置连接。'
                      : `由 ${environment.ownerEmail} 代管，请确认这台设备归属正确。`}
                  </FieldDescription>
                </FieldContent>
                <StatusBadge tone={environmentStatusMeta[environment.status].tone}>
                  {environmentStatusMeta[environment.status].label}
                </StatusBadge>
              </Field>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>能力模板</FieldTitle>
                  <FieldDescription>
                    {soul.fileCount}
                    {' '}
                    个准备文件，会生成员工使用 AIWorker 所需的工作区内容。
                  </FieldDescription>
                </FieldContent>
                <StatusBadge tone={releaseStatusMeta[soul.status].tone}>{releaseStatusMeta[soul.status].label}</StatusBadge>
              </Field>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>后台 AI 账号</FieldTitle>
                  <FieldDescription>
                    {provider.label}
                    {' '}
                    的授权状态会影响员工能否开始使用。
                  </FieldDescription>
                </FieldContent>
                <StatusBadge tone={providerStatusMeta[provider.status].tone}>{providerStatusMeta[provider.status].label}</StatusBadge>
              </Field>
            </FieldGroup>
            <details className="rounded-md border bg-muted/20 p-3">
              <summary className="cursor-pointer text-sm font-medium">给技术支持查看开通配置</summary>
              <dl className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">设备连接</dt>
                  <dd className="mt-1 break-words font-mono">{environment.targetRef}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">工作区目录</dt>
                  <dd className="mt-1 break-words font-mono">{environment.paseoHome}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">后台账号引用</dt>
                  <dd className="mt-1 break-words font-mono">{provider.secretRef}</dd>
                </div>
                <div className="sm:col-span-3">
                  <dt className="text-muted-foreground">能力模板文件</dt>
                  <dd className="mt-1 break-words font-mono">{soul.workspaceTemplateRoot}</dd>
                </div>
              </dl>
              <pre className="mt-3 overflow-x-auto rounded-md border bg-background p-3 text-xs/relaxed">
                {`aiworker plan \\
  --user ${assignment?.assignedEmail ?? environment.ownerEmail} \\
  --target ${environment.targetRef} \\
  --target-owner ${environment.ownerEmail}${environment.dedication ? ' \\\n  --dedicated-target-user' : ''} \\
  --environment ${environment.id} \\
  --provider ${provider.id} \\
  --soul ${soul.descriptorRef}`}
              </pre>
            </details>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle>管理员确认</CardTitle>
                <CardDescription>确认员工、能力模板和设备无误；正式环境会保存确认记录。</CardDescription>
              </div>
              <CardAction>
                <StatusBadge tone={effectiveApprovalStatus ? approvalStatusMeta[effectiveApprovalStatus].tone : 'warning'}>
                  {effectiveApprovalStatus ? approvalStatusMeta[effectiveApprovalStatus].label : '待审批'}
                </StatusBadge>
              </CardAction>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Alert>
              <WarningCircleIcon weight="duotone" />
              <AlertTitle>{isLive ? '真实数据已连接' : '演示模式'}</AlertTitle>
              <AlertDescription>
                {isLive
                  ? '确认或退回会保存到管理记录；不会展示员工对话内容。'
                  : '当前只更新本页预览状态，不会保存，也不会连接员工设备。'}
              </AlertDescription>
            </Alert>
            {approvalError ? <RemediationAlert remediation={approvalError} /> : null}
            {approval && effectiveApprovalStatus
              ? (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{approval.title}</p>
                        <p className="mt-1 text-xs/relaxed text-muted-foreground">
                          确认人：
                          {' '}
                          {approval.reviewer}
                          {' '}
                          · 提交时间：
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
                        {isLive ? '确认并保存' : '预览确认'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => previewDecision('changes_requested')}>
                        <WarningCircleIcon data-icon="inline-start" weight="duotone" />
                        {isLive ? '退回并保存' : '预览退回'}
                      </Button>
                    </div>
                    {effectiveApprovalStatus !== 'approved' ? <RemediationAlert remediation={adminRemediation('approval_required')} /> : null}
                    {provider.status !== 'ready' ? <RemediationAlert remediation={adminRemediation('provider_auth_required')} /> : null}

                    <Separator />

                    <section aria-labelledby="execute-delivery" className="flex flex-col gap-3">
                      <div>
                        <h3 id="execute-delivery" className="text-sm font-medium">开始开通</h3>
                        <p className="mt-1 text-xs/relaxed text-muted-foreground">
                          确认通过后，系统会在员工设备上准备 AIWorker 工作区。
                        </p>
                      </div>
                      <Button disabled={!isLive || effectiveApprovalStatus !== 'approved'} size="sm" onClick={runApplyJob}>
                        <PlayCircleIcon data-icon="inline-start" weight="duotone" />
                        开始开通
                      </Button>
                      {applyError ? <RemediationAlert remediation={applyError} /> : null}
                      {applyRemediation ? <RemediationAlert remediation={applyRemediation} /> : null}
                      {applySteps ? <ApplyStepsList steps={applySteps} /> : null}
                    </section>

                    <Separator />

                    <section aria-labelledby="pair-device" className="flex flex-col gap-3">
                      <div>
                        <h3 id="pair-device" className="text-sm font-medium">发送入口</h3>
                        <p className="mt-1 text-xs/relaxed text-muted-foreground">
                          开通完成后生成一次性入口，复制给员工使用；入口只在当前页面临时显示。
                        </p>
                      </div>
                      <Button
                        disabled={!isLive || effectiveApprovalStatus !== 'approved' || !pairingPreconditionReady || pairingAssignmentId === assignment?.id}
                        size="sm"
                        variant="outline"
                        onClick={runPairJob}
                      >
                        <PlayCircleIcon data-icon="inline-start" weight="duotone" />
                        生成一次性入口
                      </Button>
                      {!pairingPreconditionReady && !pairingOutput ? <RemediationAlert remediation={adminRemediation('handoff_not_ready')} /> : null}
                      {pairError ? <RemediationAlert remediation={pairError} /> : null}
                      {pairingOutput
                        ? (
                            <pre className="overflow-x-auto rounded-md border bg-background p-3 text-xs/relaxed text-foreground">
                              {pairingOutput}
                            </pre>
                          )
                        : null}
                    </section>

                    <details className="rounded-md border bg-muted/20 p-3">
                      <summary className="cursor-pointer text-sm font-medium">给技术支持查看确认命令</summary>
                      <pre className="mt-3 overflow-x-auto rounded-md border bg-background p-3 text-xs/relaxed">{approval.previewCommand}</pre>
                    </details>
                  </>
                )
              : (
                  <p className="text-xs/relaxed text-muted-foreground">当前选择还没有对应员工开通记录；请先准备开通内容。</p>
                )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>操作记录</CardTitle>
            <CardDescription>{isLive ? '显示本次开通的请求、确认、执行和入口记录，不展示员工对话内容。' : '显示演示数据里的请求、确认、执行和入口记录，不展示员工对话内容。'}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {traceEvents.length
              ? traceEvents.map(event => (
                  <div key={event.id} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <StatusBadge tone={event.tone}>{event.at}</StatusBadge>
                      <span className="text-xs text-muted-foreground">{event.actor}</span>
                    </div>
                    <p className="mt-2 text-xs font-medium text-foreground">{event.title}</p>
                    <p className="mt-1 text-xs/relaxed text-muted-foreground">{event.detail}</p>
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[0.625rem] text-muted-foreground">支持信息</summary>
                      <p className="mt-1 font-mono text-[0.625rem] text-muted-foreground">{event.evidenceRef}</p>
                    </details>
                  </div>
                ))
              : <p className="text-xs/relaxed text-muted-foreground">当前员工还没有操作记录。</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

interface ProvisioningStage {
  description: string
  label: string
  tone: Tone
}

interface ProvisioningStageInput {
  approval?: ProvisioningApprovalSummary
  applySteps?: ApplyJobStep[]
  assignment?: AssignmentSummary
  effectiveApprovalStatus?: ApprovalStatus
  pairingOutput?: string
  pairingPreconditionReady: boolean
}

function buildProvisioningStages({
  approval,
  applySteps,
  assignment,
  effectiveApprovalStatus,
  pairingOutput,
  pairingPreconditionReady,
}: ProvisioningStageInput): ProvisioningStage[] {
  const handoffReady = Boolean(applySteps?.some(step => step.id === 'handoff' && step.status === 'done'))
  const approvalTone = effectiveApprovalStatus ? approvalStatusMeta[effectiveApprovalStatus].tone : 'warning'

  return [
    {
      description: assignment ? `${assignment.assignedEmail} · ${assignment.team}` : '先选择要开通的员工',
      label: '选择员工',
      tone: assignment ? 'success' : 'warning',
    },
    {
      description: assignment ? '确认能力、设备和后台账号' : '等待员工信息',
      label: '确认内容',
      tone: assignment ? 'info' : 'outline',
    },
    {
      description: approval ? (effectiveApprovalStatus ? approvalStatusMeta[effectiveApprovalStatus].label : '等待确认记录') : '等待确认记录',
      label: '管理员确认',
      tone: approvalTone,
    },
    {
      description: handoffReady ? '员工入口已准备' : effectiveApprovalStatus === 'approved' ? '可开始开通' : '确认后执行',
      label: '开始开通',
      tone: handoffReady ? 'success' : effectiveApprovalStatus === 'approved' ? 'info' : 'outline',
    },
    {
      description: pairingOutput ? '一次性入口已生成' : pairingPreconditionReady ? '可生成一次性入口' : '等待开通完成',
      label: '发送入口',
      tone: pairingOutput ? 'success' : pairingPreconditionReady ? 'info' : 'outline',
    },
  ]
}

function SelectedAssignmentSummary({
  assignment,
  environment,
  provider,
  soul,
}: {
  assignment?: AssignmentSummary
  environment: PaseoEnvironmentSummary
  provider: ProviderProfileSummary
  soul: SoulReleaseSummary
}) {
  if (!assignment) {
    return (
      <div className="rounded-md border bg-muted/20 p-4">
        <p className="text-sm font-medium">还没有选中员工</p>
        <p className="mt-1 text-xs/relaxed text-muted-foreground">先从下方选择员工，再继续确认能力和设备。</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3 rounded-md border bg-muted/20 p-4 md:grid-cols-4">
      <div>
        <p className="text-xs text-muted-foreground">员工</p>
        <p className="mt-1 truncate text-sm font-medium">{assignment.assignedEmail}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">下一步</p>
        <p className="mt-1 text-sm/relaxed font-medium">{assignment.nextStep}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">能力</p>
        <p className="mt-1 truncate text-sm font-medium">
          {soul.displayName}
          {' '}
          {soul.version}
        </p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">设备</p>
        <p className="mt-1 truncate text-sm font-medium">
          {environment.ownerEmail === assignment.assignedEmail ? '员工本人设备' : `${environment.ownerEmail} 代管设备`}
        </p>
      </div>
      <div className="md:col-span-4">
        <p className="text-xs text-muted-foreground">后台 AI 账号</p>
        <p className="mt-1 truncate text-sm font-medium">
          {provider.label}
        </p>
      </div>
    </div>
  )
}

function ProvisioningStageStrip({ stages }: { stages: ProvisioningStage[] }) {
  return (
    <ol className="grid grid-cols-1 gap-2 md:grid-cols-5">
      {stages.map((stage, index) => (
        <li key={stage.label} className="rounded-md border bg-background p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {index + 1}
            </span>
            <StatusBadge tone={stage.tone}>{stage.label}</StatusBadge>
          </div>
          <p className="mt-2 text-xs/relaxed text-muted-foreground">{stage.description}</p>
        </li>
      ))}
    </ol>
  )
}

function ApplyStepsList({ steps }: { steps: ApplyJobStep[] }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <p className="mb-2 text-xs font-medium">开通进度</p>
      <FieldGroup>
        {steps.map(step => (
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
  try {
    return data.assignments.find(assignment =>
      assignment.environmentId === environmentId
      && assignment.soulReleaseId === soulReleaseId
      && assignment.providerProfileId === providerProfileId,
    )?.id ?? ''
  }
  catch {
    return ''
  }
}

function remediationFromCaughtError(error: unknown): AdminRemediation {
  if (error instanceof AdminApiError)
    return error.remediation
  return adminRemediation('unknown_admin_error')
}
