import type { CockpitGate, ProvisioningApprovalCheckSummary } from '@/lib/admin-data'
import type { AdminRemediation } from '@/lib/admin-remediation'
import { useState } from 'react'

import { remediationFromCaughtError } from '@/components/forms/metadata-form-helpers'
import { RemediationAlert } from '@/components/remediation-alert'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { submitAdminMutation } from '@/lib/admin-api-client'
import { approvalCheckStatusMeta } from '@/lib/admin-data'

interface PlanPreviewPayload {
  environment: string
  provider: string
  soul: string
  user: string
}

interface PlanPreviewResult {
  plan?: unknown
}

/**
 * 承重的实时校验门（设计 A2/A3）。
 *
 * 折叠的是步骤不是信息：开通/重试前一定展示 plan 预览（只读 /api/plan，确认前零副作用）
 * 和 4 项 check 状态。
 * - 任一 blocked → 按钮禁用并列出 blockingChecks.detail。
 * - 任一 warning（无 blocked）→ 逐条要求操作员显式勾选确认后才可继续，绝不静默放行。
 * - 全 pass → 直接可开通。
 */
export function useProvisionGate({
  environment,
  provider,
  soul,
  user,
}: {
  environment: string
  provider: string
  soul: string
  user: string
}) {
  const [previewing, setPreviewing] = useState(false)
  const [previewReady, setPreviewReady] = useState(false)
  const [previewError, setPreviewError] = useState<AdminRemediation | null>(null)

  async function runPreview(): Promise<boolean> {
    setPreviewing(true)
    setPreviewError(null)
    try {
      await submitAdminMutation<PlanPreviewResult>('/api/plan', {
        environment,
        provider,
        soul,
        user,
      } satisfies PlanPreviewPayload)
      setPreviewReady(true)
      return true
    }
    catch (caught) {
      setPreviewReady(false)
      setPreviewError(remediationFromCaughtError(caught))
      return false
    }
    finally {
      setPreviewing(false)
    }
  }

  function resetPreview() {
    setPreviewing(false)
    setPreviewReady(false)
    setPreviewError(null)
  }

  return { previewing, previewReady, previewError, runPreview, resetPreview }
}

export function ProvisionCheckList({
  checks,
  acknowledgedWarnings,
  onToggleWarning,
}: {
  checks: ProvisioningApprovalCheckSummary[]
  acknowledgedWarnings: Set<string>
  onToggleWarning: (id: string, next: boolean) => void
}) {
  return (
    <ul className="flex flex-col gap-2">
      {checks.map((check) => {
        const meta = approvalCheckStatusMeta[check.status]
        const isWarning = check.status === 'warning'
        return (
          <li key={check.id} className="rounded-md border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">{check.label}</p>
                <p className="mt-1 text-[0.6875rem]/relaxed text-muted-foreground">{check.detail}</p>
              </div>
              <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
            </div>
            {isWarning
              ? (
                  <label className="mt-2 flex items-start gap-2 text-[0.6875rem]/relaxed text-foreground">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-3.5 shrink-0"
                      checked={acknowledgedWarnings.has(check.id)}
                      onChange={event => onToggleWarning(check.id, event.target.checked)}
                      aria-label={`确认这条需注意项：${check.label}`}
                    />
                    <span>我已确认这一项，继续开通。</span>
                  </label>
                )
              : null}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * 展示门控状态并给出可点性提示：
 * - blocked → 列出每条 blockingChecks.detail。
 * - warning 未全部勾选 → 提示还需确认。
 */
export function ProvisionGateSummary({
  gate,
  acknowledgedWarnings,
}: {
  gate: CockpitGate
  acknowledgedWarnings: Set<string>
}) {
  if (gate.blocked) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
        <p className="text-xs font-medium text-destructive">有检查未通过，暂时不能开通：</p>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-[0.6875rem]/relaxed text-muted-foreground">
          {gate.blockingChecks.map(check => (
            <li key={check.id}>{check.detail}</li>
          ))}
        </ul>
      </div>
    )
  }

  const unacknowledged = gate.warningChecks.filter(check => !acknowledgedWarnings.has(check.id))
  if (unacknowledged.length) {
    return (
      <p className="rounded-md border border-warning/30 bg-warning/5 p-3 text-[0.6875rem]/relaxed text-foreground">
        还有
        {' '}
        {unacknowledged.length}
        {' '}
        项需注意，逐条确认后才能继续开通。
      </p>
    )
  }

  return null
}

export function warningsFullyAcknowledged(gate: CockpitGate, acknowledgedWarnings: Set<string>): boolean {
  if (gate.blocked)
    return false
  return gate.warningChecks.every(check => acknowledgedWarnings.has(check.id))
}

/**
 * plan 预览触发按钮 + 结果提示。
 */
export function PlanPreviewControl({
  previewing,
  previewReady,
  previewError,
  onPreview,
  disabled,
  disabledReason,
}: {
  previewing: boolean
  previewReady: boolean
  previewError: AdminRemediation | null
  onPreview: () => void
  disabled?: boolean
  disabledReason?: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={disabled || previewing}
        aria-busy={previewing ? true : undefined}
        onClick={onPreview}
      >
        {previewing ? '预览计划中…' : previewReady ? '重新预览计划' : '预览开通计划'}
      </Button>
      {disabled && disabledReason
        ? <p className="text-[0.6875rem]/relaxed text-muted-foreground">{disabledReason}</p>
        : null}
      {previewReady
        ? (
            <p className="rounded-md border border-primary/30 bg-primary/5 p-2 text-[0.6875rem]/relaxed text-foreground">
              开通计划已预览（只读，未做任何改动）。确认下方检查后即可开通。
            </p>
          )
        : null}
      {previewError ? <RemediationAlert remediation={previewError} /> : null}
    </div>
  )
}
