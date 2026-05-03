import type { ChannelType } from '@zonease/aiworker-shared'
import { Loader2, Play } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import {
  useTestWorkerBrain,
  useTestWorkerChannel,
  useTestWorkerExecutor,
  useWorkerInfo,
} from '@/worker/lib/hooks'

/**
 * Test 触发器（FEAT-035 §验收 4）。直连 worker REST。
 */
export function TestPanel() {
  const info = useWorkerInfo()
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Test</h1>
        <p className="text-sm text-muted-foreground">
          针对 brain / executor / channel 跑一次活体探测。
        </p>
      </header>

      <BrainTestCard />
      <ExecutorTestCard />
      <ChannelTestCard channels={info.data?.channels ?? []} />
    </div>
  )
}

function BrainTestCard() {
  const mut = useTestWorkerBrain()
  return (
    <section className="flex flex-col gap-3 rounded-md border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">Brain</h2>
          <p className="text-sm text-muted-foreground">
            调
            {' '}
            <code className="font-mono text-xs">/brain/test</code>
            ，对每个已配置的 brain source 探一次健康。
          </p>
        </div>
        <Button type="button" onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          Test brain
        </Button>
      </div>
      {mut.isError && (
        <ErrorRow err={mut.error} />
      )}
      {mut.data && (
        <ul className="flex flex-col gap-2 text-sm">
          {mut.data.brains.map(row => (
            <li key={row.id} className="flex items-start justify-between gap-2 rounded-md border bg-background p-3">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-xs">{row.id}</code>
                  <span className="text-xs text-muted-foreground">
                    (
                    {row.type}
                    )
                  </span>
                  {row.writeTarget && <Badge variant="secondary">write target</Badge>}
                  {row.readOnly && <Badge variant="outline">read only</Badge>}
                </div>
                <div className="min-w-0 break-words text-xs text-muted-foreground">
                  {brainDetailText(row)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={row.status} />
                {row.errorMessage && (
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer">错误详情</summary>
                    <pre className="mt-1 max-w-xs whitespace-pre-wrap break-words rounded bg-muted p-2">
                      {row.errorMessage}
                    </pre>
                  </details>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function brainDetailText(row: {
  healthScope?: 'source' | 'aggregate'
  home?: string
  priority?: number
  url?: string
}): string {
  const details: string[] = []
  if (typeof row.priority === 'number')
    details.push(`priority ${row.priority}`)
  if (row.healthScope === 'aggregate')
    details.push('aggregate health')
  if (row.home)
    details.push(row.home)
  if (row.url)
    details.push(row.url)
  return details.join(' / ')
}

function ExecutorTestCard() {
  const [probe, setProbe] = useState(false)
  const mut = useTestWorkerExecutor()
  const executorTimeoutHint = 'Tiny probe 请求已超时。可以先关闭 Tiny probe 只测 health，或检查 executor 日志后重试。'
  const executorErrorHint = isExecutorTimeoutError(mut.error)
    ? executorTimeoutHint
    : undefined
  const probeErrorHint = isTimeoutMessage(mut.data?.executor.probeError)
    ? executorTimeoutHint
    : undefined
  return (
    <section className="flex flex-col gap-3 rounded-md border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">Executor</h2>
          <p className="text-sm text-muted-foreground">
            调
            {' '}
            <code className="font-mono text-xs">/executor/test</code>
            。开 tiny probe 会发一次
            {' '}
            <code>ping</code>
            {' '}
            chat completion 测延迟。
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={probe} onChange={e => setProbe(e.target.checked)} />
            Tiny probe
          </label>
          <Button
            type="button"
            onClick={() => mut.mutate(probe ? { probe: true } : undefined)}
            disabled={mut.isPending}
          >
            {mut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            Test executor
          </Button>
        </div>
      </div>
      {mut.isError && <ErrorRow err={mut.error} hint={executorErrorHint} />}
      {mut.data && (
        <div className="flex flex-col gap-2 rounded-md border bg-background p-3 text-sm">
          <div className="flex items-center justify-between">
            <span>
              Type:
              <code className="ml-1 font-mono text-xs">{mut.data.executor.type}</code>
            </span>
            <StatusBadge status={mut.data.executor.status} />
          </div>
          {mut.data.executor.tinyProbe && (
            <p className="text-xs text-muted-foreground">
              Tiny probe:
              {' '}
              {mut.data.executor.tinyProbe.ok ? 'ok' : 'failed'}
              {' '}
              (
              {mut.data.executor.tinyProbe.latencyMs}
              {' '}
              ms)
              {mut.data.executor.tinyProbe.output && (
                <>
                  {' '}
                  — output:
                  {' '}
                  <code className="font-mono">{mut.data.executor.tinyProbe.output}</code>
                </>
              )}
            </p>
          )}
          {mut.data.executor.probeError && (
            <div className="flex flex-col gap-1">
              <details className="text-xs text-destructive">
                <summary className="cursor-pointer">probe 错误</summary>
                <pre className="mt-1 whitespace-pre-wrap break-words rounded bg-muted p-2 text-foreground">
                  {mut.data.executor.probeError}
                </pre>
              </details>
              {probeErrorHint && (
                <p className="text-xs text-muted-foreground">
                  {probeErrorHint}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function ChannelTestCard({
  channels,
}: {
  channels: Array<{ channel: ChannelType, enabled: boolean }>
}) {
  const [channel, setChannel] = useState<ChannelType | ''>('')
  const [chatId, setChatId] = useState('')
  const [text, setText] = useState('')
  const mut = useTestWorkerChannel()

  const effectiveChannel: ChannelType | '' = channel || (channels[0]?.channel ?? '')

  function run() {
    if (!effectiveChannel)
      return
    mut.mutate({
      channel: effectiveChannel,
      ...(chatId ? { chatId } : {}),
      ...(text ? { text } : {}),
    })
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border bg-card p-6">
      <div>
        <h2 className="text-lg font-bold">Channel</h2>
        <p className="text-sm text-muted-foreground">
          调
          {' '}
          <code className="font-mono text-xs">/channels/:ch/test</code>
          。chat id + text 为空 = dry-run，仅确认 binding 是否激活。
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>Channel</Label>
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={effectiveChannel}
            onChange={e => setChannel(e.target.value as ChannelType | '')}
            aria-label="Channel to test"
          >
            {channels.length === 0 && <option value="">— 尚未绑定 channel —</option>}
            {channels.map(c => (
              <option key={c.channel} value={c.channel}>
                {c.channel}
                {c.enabled ? '' : '（disabled）'}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Chat id（optional）</Label>
          <Input value={chatId} onChange={e => setChatId(e.target.value)} />
        </div>
        <div className="sm:col-span-2 flex flex-col gap-1.5">
          <Label>Text（optional）</Label>
          <Input value={text} onChange={e => setText(e.target.value)} />
        </div>
      </div>
      <div>
        <Button type="button" onClick={run} disabled={mut.isPending || !effectiveChannel}>
          {mut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          发送测试消息
        </Button>
      </div>
      {mut.isError && <ErrorRow err={mut.error} />}
      {mut.data && (
        <div className="rounded-md border bg-background p-3 text-sm">
          <p>
            Sent:
            {' '}
            <Badge variant={mut.data.sent ? 'default' : 'outline'}>
              {String(mut.data.sent)}
            </Badge>
          </p>
          {mut.data.error && <p className="mt-1 text-xs text-destructive">{mut.data.error}</p>}
          {mut.data.platformResponse !== undefined && (
            <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-micro">
              {JSON.stringify(mut.data.platformResponse, null, 2)}
            </pre>
          )}
        </div>
      )}
    </section>
  )
}

function StatusBadge({ status }: { status: string }) {
  const variant: 'default' | 'destructive' | 'outline' | 'secondary'
    = status === 'healthy'
      ? 'default'
      : status === 'down'
        ? 'destructive'
        : status === 'degraded'
          ? 'secondary'
          : 'outline'
  return <Badge variant={variant}>{status}</Badge>
}

function isExecutorTimeoutError(err: unknown): boolean {
  if (!err)
    return false
  const msg = err instanceof Error ? err.message : String(err)
  return isTimeoutMessage(msg)
}

function isTimeoutMessage(msg: string | undefined): boolean {
  if (!msg)
    return false
  return /executor test timed out|tiny probe.*timed out|timeout/i.test(msg)
}

function ErrorRow({ err, hint }: { err: unknown, hint?: string }) {
  const msg = err instanceof Error ? err.message : '测试失败。'
  return (
    <div className="flex flex-col gap-1">
      <details className="text-sm text-destructive">
        <summary className="cursor-pointer">
          错误：
          {msg.slice(0, 80)}
          {msg.length > 80 ? '…' : ''}
        </summary>
        <pre className="mt-1 whitespace-pre-wrap break-words rounded border bg-muted p-2 text-xs text-foreground">
          {msg}
        </pre>
      </details>
      {hint && (
        <p className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  )
}
