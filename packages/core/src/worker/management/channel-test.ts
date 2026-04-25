import type { ChannelType, OutboundMessage } from '@aiworker/shared'
import type { WorkerModeState } from './state'
import { AppError } from '@aiworker/shared'

import { getChannelAdapter } from '../channels/registry'

export interface ChannelTestBody {
  chatId?: string
  text?: string
}

export interface ChannelTestResponse {
  sent: boolean
  platformResponse?: unknown
  error?: string
}

const CHANNEL_TYPES: ReadonlySet<ChannelType> = new Set([
  'web',
  'line',
  'telegram',
  'lark',
  'whatsapp',
])

function isChannelType(value: string): value is ChannelType {
  return CHANNEL_TYPES.has(value as ChannelType)
}

function errorMessage(err: unknown): string {
  if (err instanceof Error)
    return err.message
  return String(err)
}

/**
 * Exercise a bound channel adapter. In dry-run mode (no `chatId + text`), we
 * simply confirm the binding exists and is enabled. With both fields present,
 * we call `adapter.send` against the platform and return the outcome —
 * platform errors resolve as `{ sent: false, error }` rather than throwing,
 * because learning that the channel is broken *is* the probe's job.
 */
export async function handleChannelTest(
  state: WorkerModeState,
  channel: string,
  body: ChannelTestBody = {},
): Promise<ChannelTestResponse> {
  if (!isChannelType(channel))
    throw AppError.notFound(`unknown channel '${channel}'`)

  const binding = state.runtime.channels.get(channel)
  if (!binding)
    throw AppError.notFound(`channel '${channel}' is not bound or not enabled`)

  const adapter = getChannelAdapter(channel)

  if (body.chatId === undefined || body.text === undefined) {
    return {
      sent: false,
      platformResponse: {
        dryRun: true,
        channel,
        enabled: binding.enabled,
      },
    }
  }

  const outbound: OutboundMessage = {
    channel,
    chatId: body.chatId,
    text: body.text,
  }

  try {
    await adapter.send(binding, outbound)
    return { sent: true, platformResponse: { ok: true } }
  }
  catch (err) {
    return { sent: false, error: errorMessage(err) }
  }
}
