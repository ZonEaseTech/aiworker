/** Channels that can deliver messages to a worker. */
export type ChannelType = 'web' | 'line' | 'telegram' | 'lark' | 'whatsapp'

/** Per-platform credentials required to verify inbound and send outbound messages. */
export type ChannelCredentials
  = | {
    channel: 'web'
    /**
     * Bearer token required on `POST /web/webhook` (`Authorization: Bearer
     * <token>`). The web adapter's `verify` is fail-closed — missing or empty
     * `inboundToken` rejects all inbound requests. Required because the
     * `/web/webhook` route is mounted at the worker root with no transport-level
     * auth; without a per-binding secret the endpoint is open to envelope
     * injection (BUG-016).
     */
    inboundToken?: string
  }
  | { channel: 'line', channelSecret: string, channelAccessToken: string }
  | { channel: 'telegram', botToken: string, botUsername?: string, webhookSecretToken?: string }
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
  /**
   * Stable per-binding identifier. Used as `Envelope.accountId` for channels
   * (e.g. web) where the underlying credentials don't already carry a unique
   * account-level id. Multiple bindings of the same `channel` MUST have
   * distinct `id`s.
   */
  id?: string
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
 * Reply-to / quote / reaction signals extracted from the raw payload.
 * Each adapter populates only the fields its protocol exposes; everything
 * here is optional.
 */
export interface EnvelopeRichMetadata {
  /** True if the inbound message edits a previously delivered one. */
  isEdit?: boolean
  /** True if the inbound message deletes a previously delivered one. */
  isDelete?: boolean
  /** Inline quoted message the user is replying to. */
  replyTo?: {
    /** Platform-native author id of the quoted message. */
    authorId: string
    /** Best-effort plain-text rendering of the quoted message. */
    text: string
  }
  /** Free-form quoted text when no structured replyTo is available. */
  quote?: string
  /** Aggregated reactions on the inbound message (emoji + count). */
  reactions?: Array<{ emoji: string, count: number }>
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
  /**
   * Per-channel credential identity. Distinguishes envelopes coming from
   * different bots / phone numbers / app ids running on the same `channel`.
   * Adapters derive this from the binding's credentials (or `binding.id` for
   * channels without account-scoped credentials).
   */
  accountId: string
  chatId: string
  threadId?: string
  userId?: string
  userDisplayName?: string
  text: string
  attachments?: EnvelopeAttachment[]
  /** Optional structured reply / edit / delete / reaction signals. */
  richMetadata?: EnvelopeRichMetadata
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
