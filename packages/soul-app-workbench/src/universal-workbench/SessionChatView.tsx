import type {
  LocalSession,
  LocalSessionEvent,
  LocalTurn,
  LocalWorkspace,
} from '@zonease/aiworker-shared'
import type { FormEvent } from 'react'
import type { EngineReadiness } from './timeline/engine-readiness'

import {
  ArrowDown01Icon,
  ArrowLeft01Icon,
  Message02Icon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  RefreshIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@zonease/aiworker-ui/components/badge'
import { Button } from '@zonease/aiworker-ui/components/button'
import { ScrollArea } from '@zonease/aiworker-ui/components/scroll-area'
import {
  createComposerAttachment,
  formatSessionAttachmentKind,
  formatSessionAttachmentSize,
  isSessionAttachmentImage,
  SessionComposer,
} from '@zonease/aiworker-ui/components/session-composer'
import { useEffect, useMemo, useRef, useState } from 'react'
import { MessageFlow, MessageRow, StatusEventPill } from './timeline/message-flow'
import {
  createSessionTimelineViewModel,
  normalizeSessionEvents,
  summarizeSessionUsage,
} from './timeline/session-view-model'
import { SessionTimeline } from './timeline/SessionTimeline'

export interface SessionChatViewProps {
  assistantRoleLabel: string
  detailDrawerOpen: boolean
  engineReadiness: EngineReadiness
  events: LocalSessionEvent[]
  onBackToWorkspace: () => void
  onRefresh: () => void
  onToggleDetailDrawer: () => void
  onSubmitTurn: (event: FormEvent<HTMLFormElement>) => void
  onTurnInputChange: (value: string) => void
  operatorRoleLabel: string
  session: LocalSession
  sessionStatusLabel: string
  turnInput: string
  turnSubmitting: boolean
  turns: LocalTurn[]
  workspace: LocalWorkspace
  workspaceName: string
}

interface SessionTurnAttachment {
  file: File
  id: string
  previewUrl?: string
}

const copy = {
  addSourceMaterials: 'Add source materials',
  attachedSourceMaterials: 'Attached source materials',
  closeSourceMaterialPreview: 'Close preview',
  followUpInput: 'Session follow-up input',
  followUpPlaceholder: 'Continue the conversation...',
  materialReadError: 'Failed to read source material.',
  previewSourceMaterial: (name: string) => `Preview ${name}`,
  removeSourceMaterial: (name: string) => `Remove ${name}`,
  sendTurn: 'Send',
  sendingTurn: 'Sending...',
}

export function SessionChatView({
  assistantRoleLabel,
  detailDrawerOpen,
  engineReadiness,
  events,
  onBackToWorkspace,
  onRefresh,
  onToggleDetailDrawer,
  onSubmitTurn,
  onTurnInputChange,
  operatorRoleLabel,
  session,
  sessionStatusLabel,
  turnInput,
  turnSubmitting,
  turns,
  workspace: _workspace,
  workspaceName,
}: SessionChatViewProps) {
  const logRef = useRef<HTMLDivElement | null>(null)
  const didInitialScrollRef = useRef(false)
  const pinnedToBottomRef = useRef(true)
  const [scrolledFromBottom, setScrolledFromBottom] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const attachmentsRef = useRef<SessionTurnAttachment[]>([])
  const [attachments, setAttachments] = useState<SessionTurnAttachment[]>([])
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const normalizedEvents = useMemo(() => normalizeSessionEvents(events, { parser: 'codex-cli' }), [events])
  const timeline = useMemo(() => createSessionTimelineViewModel({
    events: normalizedEvents,
    turns,
  }), [normalizedEvents, turns])
  const usage = useMemo(() => summarizeSessionUsage(normalizedEvents), [normalizedEvents])

  const composerUsage = usage && (usage.inputTokens != null || usage.outputTokens != null)
    ? {
        ariaLabel: `Usage ${usage.inputTokens ?? 0} input, ${usage.outputTokens ?? 0} output tokens`,
        label: 'Usage',
        meterValue: usage.inputTokens && (usage.inputTokens + (usage.outputTokens ?? 0)) > 0
          ? usage.inputTokens / (usage.inputTokens + (usage.outputTokens ?? 0))
          : undefined,
        title: `Usage ${usage.inputTokens ?? 0} input, ${usage.outputTokens ?? 0} output tokens`,
        value: `${formatCompactTokenCount(usage.inputTokens)} in / ${formatCompactTokenCount(usage.outputTokens)} out`,
      }
    : undefined

  const composerBusy = turnSubmitting || turns.some(turn => turn.status === 'running')

  const attachmentItems = useMemo(() => attachments.map(attachment => ({
    id: attachment.id,
    kind: formatSessionAttachmentKind(attachment.file),
    closePreviewLabel: copy.closeSourceMaterialPreview,
    mediaType: attachment.previewUrl ? 'image' as const : 'file' as const,
    name: attachment.file.name,
    onPreviewLabel: copy.previewSourceMaterial(attachment.file.name),
    previewAlt: attachment.file.name,
    previewTitle: attachment.file.name,
    previewUrl: attachment.previewUrl,
    removeLabel: copy.removeSourceMaterial(attachment.file.name),
    size: formatSessionAttachmentSize(attachment.file.size),
  })), [attachments])

  useEffect(() => {
    attachmentsRef.current = attachments
  }, [attachments])

  useEffect(() => {
    return () => {
      for (const attachment of attachmentsRef.current) {
        if (attachment.previewUrl)
          URL.revokeObjectURL(attachment.previewUrl)
      }
    }
  }, [])

  useEffect(() => {
    didInitialScrollRef.current = false
    pinnedToBottomRef.current = true
  }, [session.id])

  useEffect(() => {
    const el = logRef.current
    if (!el || didInitialScrollRef.current || (timeline.turns.length === 0 && events.length === 0))
      return
    didInitialScrollRef.current = true
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
      pinnedToBottomRef.current = true
      setScrolledFromBottom(false)
    })
  }, [events.length, session.id, timeline.turns.length])

  useEffect(() => {
    const el = logRef.current
    if (!el || !pinnedToBottomRef.current)
      return
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
      setScrolledFromBottom(false)
    })
  }, [timeline, turnSubmitting])

  useEffect(() => {
    const el = logRef.current
    if (!el)
      return
    const onScroll = () => {
      const target = logRef.current
      if (!target)
        return
      const distance = target.scrollHeight - target.scrollTop - target.clientHeight
      pinnedToBottomRef.current = distance < 80
      setScrolledFromBottom(distance > 140)
    }
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  function jumpToBottom() {
    const el = logRef.current
    if (!el)
      return
    pinnedToBottomRef.current = true
    el.scrollTo({ behavior: 'smooth', top: el.scrollHeight })
    setScrolledFromBottom(false)
  }

  function addAttachmentFiles(files: FileList | File[] | null) {
    const selectedFiles = Array.from(files ?? [])
    if (selectedFiles.length === 0)
      return
    setAttachmentError(null)
    setAttachments((current) => {
      const seen = new Set(current.map(a => `${a.file.name}:${a.file.size}:${a.file.type}`))
      const nextFiles = selectedFiles.filter((file) => {
        const key = `${file.name}:${file.size}:${file.type}`
        if (seen.has(key))
          return false
        seen.add(key)
        return true
      })
      if (nextFiles.length === 0)
        return current
      return [
        ...current,
        ...nextFiles.map((file, index) => ({
          file,
          id: `${file.name}-${file.size}-${file.type}-${current.length + index}`,
          previewUrl: isSessionAttachmentImage(file) ? URL.createObjectURL(file) : undefined,
        })),
      ]
    })
    if (fileInputRef.current)
      fileInputRef.current.value = ''
  }

  function openFilePicker() {
    const input = fileInputRef.current
    if (!input)
      return
    input.value = ''
    input.click()
  }

  function removeAttachment(id: string) {
    setAttachments(current => current.filter((attachment) => {
      if (attachment.id === id && attachment.previewUrl)
        URL.revokeObjectURL(attachment.previewUrl)
      return attachment.id !== id
    }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!engineReadiness.ready || (!turnInput.trim() && attachments.length === 0))
      return
    try {
      setAttachmentError(null)
      await Promise.all(attachments.map(a => createComposerAttachment(a.file)))
      for (const a of attachments) {
        if (a.previewUrl)
          URL.revokeObjectURL(a.previewUrl)
      }
      setAttachments([])
      onSubmitTurn(event)
    }
    catch {
      setAttachmentError(copy.materialReadError)
    }
  }

  return (
    <section
      className="relative flex h-full min-h-0 min-w-0 flex-col transition-colors"
      data-slot="session-chat-view"
    >
      <div className="flex min-h-0 min-w-0 max-w-full items-center justify-between gap-2 px-6 py-3 max-md:px-4 max-md:py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Button type="button" variant="ghost" size="icon" aria-label="Back to workspace" onClick={onBackToWorkspace}>
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} aria-hidden="true" />
          </Button>
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">{workspaceName}</div>
            <div className="truncate text-sm font-medium">{session.capabilityTemplateId}</div>
          </div>
          <Badge variant="outline">{sessionStatusLabel}</Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" aria-label="Refresh" onClick={onRefresh}>
            <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} aria-hidden="true" />
          </Button>
          <Button
            aria-label={detailDrawerOpen ? 'Collapse detail' : 'Expand detail'}
            aria-pressed={detailDrawerOpen}
            size="icon"
            type="button"
            variant="ghost"
            onClick={onToggleDetailDrawer}
          >
            {detailDrawerOpen
              ? <HugeiconsIcon icon={PanelRightCloseIcon} strokeWidth={2} aria-hidden="true" />
              : <HugeiconsIcon icon={PanelRightOpenIcon} strokeWidth={2} aria-hidden="true" />}
          </Button>
        </div>
      </div>

      <ScrollArea
        className="min-h-0 min-w-0 flex-1"
        overlay={scrolledFromBottom
          ? (
              <Button type="button" variant="secondary" size="sm" className="absolute right-6 bottom-4" onClick={jumpToBottom}>
                <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} aria-hidden="true" data-icon="inline-start" />
                <span>Latest</span>
              </Button>
            )
          : null}
        viewportClassName="flex min-h-0 min-w-0 scroll-smooth flex-col gap-4 px-6 pt-5 pb-6 transition-all max-md:px-4"
        viewportRef={logRef}
      >
        {timeline.turns.length > 0
          ? (
              <SessionTimeline
                assistantRoleLabel={assistantRoleLabel}
                assistantTimestampForTurn={turn => turn.status}
                className="min-w-0"
                operatorRoleLabel={operatorRoleLabel}
                placeholderForTurn={turn => turn.status === 'running'
                  ? (
                      <MessageRow roleLabel={assistantRoleLabel}>
                        <MessageFlow>
                          <StatusEventPill tone="success">{engineReadiness.detail}</StatusEventPill>
                        </MessageFlow>
                      </MessageRow>
                    )
                  : null}
                turns={timeline.turns}
              />
            )
          : (
              <div className="flex min-h-64 flex-col items-center justify-center gap-2">
                <HugeiconsIcon icon={Message02Icon} strokeWidth={2} aria-hidden="true" />
                <p className="text-sm text-muted-foreground">{engineReadiness.detail}</p>
              </div>
            )}
        {turnSubmitting && timeline.turns.every(({ turn }) => turn.status !== 'running')
          ? (
              <MessageRow roleLabel={assistantRoleLabel}>
                <MessageFlow>
                  <StatusEventPill tone="success">{engineReadiness.detail}</StatusEventPill>
                </MessageFlow>
              </MessageRow>
            )
          : null}
      </ScrollArea>

      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        multiple
        aria-hidden="true"
        tabIndex={-1}
        onChange={event => addAttachmentFiles(event.currentTarget.files)}
      />
      <SessionComposer
        ariaLabel={copy.followUpInput}
        attachmentCountLabel={copy.attachedSourceMaterials}
        attachmentTriggerLabel={copy.addSourceMaterials}
        attachments={attachmentItems}
        className="min-w-0 max-w-full px-6 pt-3 pb-4 max-md:px-4"
        disabled={!engineReadiness.ready}
        disabledReason={engineReadiness.ready ? undefined : engineReadiness.detail}
        error={attachmentError}
        onAddAttachmentFiles={addAttachmentFiles}
        onAddAttachments={openFilePicker}
        onRemoveAttachment={removeAttachment}
        placeholder={copy.followUpPlaceholder}
        submitAriaLabel={turnSubmitting || composerBusy ? copy.sendingTurn : copy.sendTurn}
        submitDisabled={!engineReadiness.ready}
        submitting={composerBusy}
        submitTitle={turnSubmitting || composerBusy ? copy.sendingTurn : copy.sendTurn}
        usage={composerUsage}
        value={turnInput}
        variant="compact"
        onSubmit={handleSubmit}
        onValueChange={onTurnInputChange}
      />
    </section>
  )
}

function formatCompactTokenCount(value?: number): string {
  if (value == null)
    return '0'
  if (value >= 1000)
    return `${Number((value / 1000).toFixed(value >= 10000 ? 0 : 1))}K`
  return String(value)
}
