import type { ChannelType } from '@zonease/aiworker-shared'
import { Loader2, Play } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  useTestWorkerBrain,
  useTestWorkerChannel,
  useTestWorkerExecutor,
  useWorkerInfo,
} from '../hooks'

interface TestPanelProps {
  workerId: string
}

export function TestPanel({ workerId }: TestPanelProps) {
  const info = useWorkerInfo(workerId)
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Test</h1>
        <p className="text-sm text-muted-foreground">
          Probe the worker's configured backends. Requests go through the manager's proxy.
        </p>
      </header>

      <BrainTestCard workerId={workerId} />
      <ExecutorTestCard workerId={workerId} />
      <ChannelTestCard workerId={workerId} channels={info.data?.channels ?? []} />
    </div>
  )
}

function BrainTestCard({ workerId }: { workerId: string }) {
  const mut = useTestWorkerBrain(workerId)
  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Brain</h2>
          <p className="text-sm text-muted-foreground">
            Calls
            {' '}
            <code className="font-mono text-xs">/brain/test</code>
            {' '}
            to probe every configured brain source.
          </p>
        </div>
        <Button type="button" onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          Test brain
        </Button>
      </div>
      {mut.isError && (
        <p role="alert" className="text-sm text-destructive">
          {mut.error instanceof Error ? mut.error.message : 'Test failed.'}
        </p>
      )}
      {mut.data && (
        <ul className="flex flex-col gap-2 text-sm">
          {mut.data.brains.map(row => (
            <li key={row.id} className="flex items-center justify-between gap-2 rounded-md border bg-background p-3">
              <div className="flex items-center gap-2">
                <code className="font-mono text-xs">{row.id}</code>
                <span className="text-xs text-muted-foreground">
                  (
                  {row.type}
                  )
                </span>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={row.status} />
                {row.errorMessage && (
                  <span className="text-xs text-muted-foreground">{row.errorMessage}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ExecutorTestCard({ workerId }: { workerId: string }) {
  const [probe, setProbe] = useState(false)
  const mut = useTestWorkerExecutor(workerId)
  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Executor</h2>
          <p className="text-sm text-muted-foreground">
            Calls
            {' '}
            <code className="font-mono text-xs">/executor/test</code>
            . With the tiny probe enabled, issues a single
            {' '}
            <code>ping</code>
            {' '}
            chat completion and reports the latency.
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
      {mut.isError && (
        <p role="alert" className="text-sm text-destructive">
          {mut.error instanceof Error ? mut.error.message : 'Test failed.'}
        </p>
      )}
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
            <p className="text-xs text-destructive">{mut.data.executor.probeError}</p>
          )}
        </div>
      )}
    </section>
  )
}

function ChannelTestCard({
  workerId,
  channels,
}: {
  workerId: string
  channels: Array<{ channel: ChannelType, enabled: boolean }>
}) {
  // User's explicit selection, empty until they interact. The displayed value
  // falls back to the first available channel so an info-loading-late race
  // doesn't leave the dropdown on a non-option (and the Send button disabled).
  const [channel, setChannel] = useState<ChannelType | ''>('')
  const [chatId, setChatId] = useState('')
  const [text, setText] = useState('')
  const mut = useTestWorkerChannel(workerId)

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
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-6">
      <div>
        <h2 className="text-lg font-semibold">Channel</h2>
        <p className="text-sm text-muted-foreground">
          Calls
          {' '}
          <code className="font-mono text-xs">/channels/:ch/test</code>
          . Leave chat id + text empty for a dry-run that confirms the binding is live.
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
            {channels.length === 0 && <option value="">— no channels bound —</option>}
            {channels.map(c => (
              <option key={c.channel} value={c.channel}>
                {c.channel}
                {c.enabled ? '' : ' (disabled)'}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Chat id (optional)</Label>
          <Input value={chatId} onChange={e => setChatId(e.target.value)} />
        </div>
        <div className="sm:col-span-2 flex flex-col gap-1.5">
          <Label>Text (optional)</Label>
          <Input value={text} onChange={e => setText(e.target.value)} />
        </div>
      </div>
      <div>
        <Button type="button" onClick={run} disabled={mut.isPending || !effectiveChannel}>
          {mut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          Send test message
        </Button>
      </div>
      {mut.isError && (
        <p role="alert" className="text-sm text-destructive">
          {mut.error instanceof Error ? mut.error.message : 'Test failed.'}
        </p>
      )}
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
            <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-[11px]">
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
