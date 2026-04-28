import type {
  ChannelBinding,
  ChannelCredentials,
  ChannelType,
  WorkerInfo,
} from '@zonease/aiworker-shared'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { SecretField } from './brain-section'

interface ChannelsSectionProps {
  channels: ChannelBinding[]
  info?: WorkerInfo
  onChange: (next: ChannelBinding[]) => void
}

const CHANNEL_TYPES: ChannelType[] = ['web', 'line', 'telegram', 'lark', 'whatsapp']

function generateInboundToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const b of bytes)
    binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function defaultCredentials(channel: ChannelType): ChannelCredentials {
  switch (channel) {
    case 'web': return { channel: 'web', inboundToken: '' }
    case 'line': return { channel: 'line', channelSecret: '', channelAccessToken: '' }
    case 'telegram': return { channel: 'telegram', botToken: '' }
    case 'lark': return { channel: 'lark', appId: '', appSecret: '', encryptKey: '', verificationToken: '' }
    case 'whatsapp': return {
      channel: 'whatsapp',
      phoneNumberId: '',
      accessToken: '',
      appSecret: '',
      verifyToken: '',
    }
  }
}

function defaultBinding(channel: ChannelType): ChannelBinding {
  return { channel, enabled: false, credentials: defaultCredentials(channel) }
}

function channelRowKey(channel: ChannelType, all: ChannelBinding[], index: number): string {
  let occurrence = 0
  for (let i = 0; i < index; i += 1) {
    if (all[i]?.channel === channel)
      occurrence += 1
  }
  return occurrence === 0 ? channel : `${channel}#${occurrence}`
}

export function ChannelsSection({ channels, info, onChange }: ChannelsSectionProps) {
  function replaceAt(index: number, next: ChannelBinding) {
    const arr = channels.slice()
    arr[index] = next
    onChange(arr)
  }

  function removeAt(index: number) {
    onChange(channels.filter((_, i) => i !== index))
  }

  function addChannel(channel: ChannelType) {
    onChange([...channels, defaultBinding(channel)])
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border bg-card p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Channels</h2>
          <p className="text-sm text-muted-foreground">
            入站消息源。把卡片里的 webhook URL 粘到对应平台后台。
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {CHANNEL_TYPES.map(t => (
            <Button key={t} type="button" variant="outline" size="sm" onClick={() => addChannel(t)}>
              <Plus className="size-3.5" />
              {t}
            </Button>
          ))}
        </div>
      </header>

      {channels.length === 0 && (
        <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          尚未绑定 channel。
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {channels.map((binding, index) => (
          <ChannelRow
            key={channelRowKey(binding.channel, channels, index)}
            binding={binding}
            webhookUrl={info?.channels.find(c => c.channel === binding.channel)?.webhookUrl}
            onChange={next => replaceAt(index, next)}
            onRemove={() => removeAt(index)}
          />
        ))}
      </ul>
    </section>
  )
}

function ChannelRow({
  binding,
  webhookUrl,
  onChange,
  onRemove,
}: {
  binding: ChannelBinding
  webhookUrl?: string
  onChange: (next: ChannelBinding) => void
  onRemove: () => void
}) {
  function updateCreds(next: ChannelCredentials) {
    onChange({ ...binding, credentials: next })
  }

  function switchChannel(next: ChannelType) {
    if (next === binding.channel)
      return
    onChange({ channel: next, enabled: binding.enabled, credentials: defaultCredentials(next) })
  }

  return (
    <li className="flex flex-col gap-3 rounded-md border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={binding.channel}
            onChange={e => switchChannel(e.target.value as ChannelType)}
            aria-label="Channel type"
          >
            {CHANNEL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={binding.enabled}
              onChange={e => onChange({ ...binding, enabled: e.target.checked })}
            />
            enabled
          </label>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Remove ${binding.channel} channel`}
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      {webhookUrl && (
        <div className="flex flex-col gap-1">
          <Label>Webhook URL（只读，粘进平台后台即可）</Label>
          <Input value={webhookUrl} readOnly className="font-mono text-xs" />
        </div>
      )}

      <ChannelCredentialFields credentials={binding.credentials} onChange={updateCreds} />
    </li>
  )
}

function ChannelCredentialFields({
  credentials,
  onChange,
}: {
  credentials: ChannelCredentials
  onChange: (next: ChannelCredentials) => void
}) {
  switch (credentials.channel) {
    case 'web':
      return (
        <div className="flex flex-col gap-2">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <SecretField
              label="inboundToken"
              value={credentials.inboundToken ?? ''}
              onChange={v => onChange({ ...credentials, inboundToken: v })}
              placeholder="(unchanged — 留空沿用旧 token)"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange({ ...credentials, inboundToken: generateInboundToken() })}
            >
              Generate
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            必填：调用
            {' '}
            <code className="font-mono text-[11px]">POST /web/webhook</code>
            {' '}
            的客户端必须发
            {' '}
            <code className="font-mono text-[11px]">Authorization: Bearer &lt;inboundToken&gt;</code>
            。空 token = 拒绝所有入站（fail-closed）。
          </p>
        </div>
      )
    case 'line':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <SecretField
            label="channelSecret"
            value={credentials.channelSecret}
            onChange={v => onChange({ ...credentials, channelSecret: v })}
          />
          <SecretField
            label="channelAccessToken"
            value={credentials.channelAccessToken}
            onChange={v => onChange({ ...credentials, channelAccessToken: v })}
          />
        </div>
      )
    case 'telegram':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <SecretField
            label="botToken"
            value={credentials.botToken}
            onChange={v => onChange({ ...credentials, botToken: v })}
          />
          <SecretField
            label="webhookSecretToken (optional)"
            value={credentials.webhookSecretToken ?? ''}
            onChange={v => onChange({ ...credentials, webhookSecretToken: v || undefined })}
          />
        </div>
      )
    case 'lark':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>appId</Label>
            <Input value={credentials.appId} onChange={e => onChange({ ...credentials, appId: e.target.value })} />
          </div>
          <SecretField
            label="appSecret"
            value={credentials.appSecret}
            onChange={v => onChange({ ...credentials, appSecret: v })}
          />
          <SecretField
            label="encryptKey"
            value={credentials.encryptKey}
            onChange={v => onChange({ ...credentials, encryptKey: v })}
          />
          <SecretField
            label="verificationToken"
            value={credentials.verificationToken}
            onChange={v => onChange({ ...credentials, verificationToken: v })}
          />
        </div>
      )
    case 'whatsapp':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>phoneNumberId</Label>
            <Input
              value={credentials.phoneNumberId}
              onChange={e => onChange({ ...credentials, phoneNumberId: e.target.value })}
            />
          </div>
          <SecretField
            label="accessToken"
            value={credentials.accessToken}
            onChange={v => onChange({ ...credentials, accessToken: v })}
          />
          <SecretField
            label="appSecret"
            value={credentials.appSecret}
            onChange={v => onChange({ ...credentials, appSecret: v })}
          />
          <SecretField
            label="verifyToken"
            value={credentials.verifyToken}
            onChange={v => onChange({ ...credentials, verifyToken: v })}
          />
        </div>
      )
  }
}
