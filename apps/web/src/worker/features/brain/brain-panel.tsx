import type { BrainAdmissionProposal } from '@zonease/aiworker-shared'
import { useState } from 'react'

import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Skeleton } from '@/shared/components/ui/skeleton'
import {
  useAdmissions,
  useApplyAdmission,
  useApproveAdmission,
  useArtifacts,
  useBrainSummary,
  useRejectAdmission,
} from '@/worker/lib/hooks'

/**
 * Worker Admin Brain 视图（FEAT-054 / PLAN-103）。
 *
 * 三个区块：scope manifest 摘要、admission 列表 + approve/reject/apply 操作、
 * 默认 redacted artifact 列表。所有数据走 `/api/worker/brain/*`，bearer-auth
 * 由 Caddy / public surface 上层中间件强制。Sensitive payload 通过开关请求 `?showSensitive=true`，
 * 无开关默认值替换为 `<redacted>`。
 */

export function BrainPanel() {
  return (
    <section className="flex w-full max-w-5xl min-w-0 flex-col gap-6">
      <header className="min-w-0">
        <h1 className="text-2xl font-bold">Brain</h1>
        <p className="break-words text-sm text-muted-foreground">
          Project Brain 摘要 + admission 审批 + brain artifact 注册表。
          Brief 是 canonical brain（
          <code className="font-mono text-xs">.aiworker/</code>
          ）的投影；这里展示的内容默认 redact secret-like 字段。
        </p>
      </header>

      <ScopeAndSummaryCard />
      <AdmissionsCard />
      <ArtifactsCard />
    </section>
  )
}

function ScopeAndSummaryCard() {
  const summary = useBrainSummary()

  if (summary.isLoading) {
    return (
      <section className="rounded-lg border p-4">
        <Skeleton className="h-24 w-full" />
      </section>
    )
  }
  if (summary.error || summary.data === undefined) {
    return (
      <section className="rounded-lg border p-4 text-sm text-destructive">
        无法加载 brain summary：
        {summary.error?.message ?? 'unknown error'}
      </section>
    )
  }

  const { brainSummary, checkedAt } = summary.data
  return (
    <section className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">Scope manifest</h2>
        {brainSummary.scopeManifest.status === 'ok'
          ? (
              <ul className="space-y-1 text-sm">
                <li>
                  <span>{`kind: `}</span>
                  <span className="font-mono">{brainSummary.scopeManifest.kind}</span>
                </li>
                <li>
                  <span>{`primary soul: `}</span>
                  <span className="font-mono">{brainSummary.scopeManifest.primarySoul}</span>
                </li>
                {brainSummary.scopeManifest.privacy && (
                  <li>
                    <span>{`privacy: `}</span>
                    <span className="font-mono">{brainSummary.scopeManifest.privacy}</span>
                  </li>
                )}
                {brainSummary.scopeManifest.approval && (
                  <li>
                    <span>{`approval: `}</span>
                    <span className="font-mono">{brainSummary.scopeManifest.approval}</span>
                  </li>
                )}
              </ul>
            )
          : (
              <p className="text-sm text-muted-foreground">
                <span>状态：</span>
                <span className="font-mono">{brainSummary.scopeManifest.status}</span>
                {brainSummary.scopeManifest.error && (
                  <>
                    <br />
                    <span className="text-destructive">{brainSummary.scopeManifest.error}</span>
                  </>
                )}
              </p>
            )}
      </div>
      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">Aggregates</h2>
        <ul className="space-y-1 text-sm">
          <li>
            <span>{`artifacts: `}</span>
            <span className="font-mono">{brainSummary.artifacts.total}</span>
            <span>{` total, by status: ${Object.entries(brainSummary.artifacts.byStatus).map(([status, count]) => `${status}=${count}`).join(', ') || '<none>'}`}</span>
          </li>
          <li>
            <span>{`admissions by status: ${Object.entries(brainSummary.admissions.byStatus).map(([status, count]) => `${status}=${count}`).join(', ') || '<none>'}`}</span>
          </li>
          {brainSummary.admissions.lastUpdatedAt && (
            <li>
              <span>{`last updated: `}</span>
              <span className="font-mono">{brainSummary.admissions.lastUpdatedAt}</span>
            </li>
          )}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          <span>{`checked at: `}</span>
          <span className="font-mono">{checkedAt}</span>
        </p>
      </div>
    </section>
  )
}

function statusBadgeVariant(status: BrainAdmissionProposal['status']): 'default' | 'destructive' | 'secondary' | 'outline' {
  if (status === 'pending')
    return 'secondary'
  if (status === 'approved')
    return 'default'
  if (status === 'applied')
    return 'default'
  if (status === 'rejected')
    return 'destructive'
  if (status === 'failed')
    return 'destructive'
  return 'outline'
}

function AdmissionsCard() {
  const [decidedBy, setDecidedBy] = useState('')
  const admissions = useAdmissions({ status: 'pending' })
  const approve = useApproveAdmission()
  const reject = useRejectAdmission()
  const apply = useApplyAdmission()

  const ready = decidedBy.trim().length > 0
  const proposals = admissions.data?.proposals ?? []

  return (
    <section className="rounded-lg border p-4">
      <header className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">Admission proposals (pending)</h2>
        <div className="flex items-center gap-2">
          <Input
            className="h-8 w-48"
            placeholder="--decided-by name"
            value={decidedBy}
            onChange={event => setDecidedBy(event.target.value)}
          />
        </div>
      </header>
      {admissions.isLoading && <Skeleton className="h-24 w-full" />}
      {admissions.error && (
        <p className="text-sm text-destructive">
          加载失败：
          {admissions.error.message}
        </p>
      )}
      {!admissions.isLoading && proposals.length === 0 && (
        <p className="text-sm text-muted-foreground">暂无 pending 的 admission proposal。</p>
      )}
      <ul className="space-y-3">
        {proposals.map(p => (
          <li key={p.id} className="rounded border p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-mono">{p.id}</span>
              <Badge variant={statusBadgeVariant(p.status)}>{p.status}</Badge>
              <Badge variant="outline">{p.kind}</Badge>
              <Badge variant="outline">
                soul:
                {p.soulId}
              </Badge>
              <Badge variant="outline">
                risk:
                {p.risk}
              </Badge>
            </div>
            <p className="mt-1 text-sm">{p.summary}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              target:
              {' '}
              <code className="font-mono">{p.target}</code>
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" disabled={!ready || approve.isPending} onClick={() => approve.mutate({ decidedBy, id: p.id })}>
                Approve
              </Button>
              <Button size="sm" variant="destructive" disabled={!ready || reject.isPending} onClick={() => reject.mutate({ decidedBy, id: p.id })}>
                Reject
              </Button>
              <Button size="sm" variant="outline" disabled={!ready || apply.isPending} onClick={() => apply.mutate({ decidedBy, id: p.id })}>
                Apply (dry-run)
              </Button>
              <Button size="sm" variant="outline" disabled={!ready || apply.isPending} onClick={() => apply.mutate({ commit: true, decidedBy, id: p.id })}>
                Apply --commit
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {(approve.error || reject.error || apply.error) && (
        <p className="mt-3 text-sm text-destructive">
          操作失败：
          {(approve.error ?? reject.error ?? apply.error)?.message}
        </p>
      )}
    </section>
  )
}

function ArtifactsCard() {
  const artifacts = useArtifacts({ limit: 50 })
  return (
    <section className="rounded-lg border p-4">
      <header className="mb-4">
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">Brain artifacts (read-only, redacted)</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Confidential / secret artifact 的 ref 与 hash 默认替换为
          <code className="font-mono">&lt;redacted&gt;</code>
          。
        </p>
      </header>
      {artifacts.isLoading && <Skeleton className="h-24 w-full" />}
      {artifacts.error && (
        <p className="text-sm text-destructive">
          加载失败：
          {artifacts.error.message}
        </p>
      )}
      {!artifacts.isLoading && (artifacts.data?.artifacts.length ?? 0) === 0 && (
        <p className="text-sm text-muted-foreground">暂无登记的 brain artifact。</p>
      )}
      <ul className="space-y-2">
        {(artifacts.data?.artifacts ?? []).map(a => (
          <li key={a.id} className="rounded border p-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono">{a.id}</span>
              <Badge variant="outline">{a.type}</Badge>
              <Badge variant="outline">{a.status}</Badge>
              <Badge variant="outline">
                sensitivity:
                {a.sensitivity}
              </Badge>
              {a.scopeId && (
                <Badge variant="outline">
                  scope:
                  {a.scopeId}
                </Badge>
              )}
            </div>
            {a.summary && <p className="mt-1 text-muted-foreground">{a.summary}</p>}
            <p className="mt-1 text-xs text-muted-foreground">
              ref:
              {' '}
              <code className="font-mono">{a.ref}</code>
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
