/** Channels that can deliver messages to a worker. */
export type ChannelType = 'web' | 'line' | 'telegram' | 'lark' | 'whatsapp'

/** Per-platform credentials required to verify inbound and send outbound messages. */
export type ChannelCredentials
  = | { channel: 'web' }
    | { channel: 'line', channelSecret: string, channelAccessToken: string }
    | { channel: 'telegram', botToken: string, webhookSecretToken?: string }
    | {
      channel: 'lark'
      appId: string
      appSecret: string
      encryptKey: string
      verificationToken: string
    }
    | {
      channel: 'whatsapp'
      phoneNumberId: string
      accessToken: string
      appSecret: string
      verifyToken: string
    }

/** Non-secret display metadata for a channel binding (shown in dashboard). */
export interface ChannelProfile {
  displayName?: string
  avatarUrl?: string
}

/**
 * A worker's binding to one channel. Stored as part of `WorkerConfig`;
 * the credential JSON travels through the secrets vault.
 */
export interface ChannelBinding {
  channel: ChannelType
  enabled: boolean
  credentials: ChannelCredentials
  profile?: ChannelProfile
}

/** Attachment accompanying an inbound envelope. */
export interface EnvelopeAttachment {
  kind: 'image' | 'audio' | 'video' | 'file'
  url?: string
  mimeType?: string
  filename?: string
  sizeBytes?: number
}

/**
 * Normalized inbound message handed to the orchestrator.
 *
 * Every channel adapter converts its platform-specific payload into this shape
 * before routing. `raw` preserves the original event for debugging and for
 * outbound replies that need platform identifiers.
 */
export interface Envelope {
  workerId: string
  channel: ChannelType
  chatId: string
  threadId?: string
  userId?: string
  userDisplayName?: string
  text: string
  attachments?: EnvelopeAttachment[]
  receivedAt: string
  raw: unknown
}

/** Reply produced by the orchestrator and pushed out via the channel adapter. */
export interface OutboundMessage {
  channel: ChannelType
  chatId: string
  threadId?: string
  text: string
  attachments?: EnvelopeAttachment[]
  /** Optional channel-specific hints (card template id, parse mode, ...). */
  hints?: Record<string, unknown>
}
