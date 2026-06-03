import type { ClipboardEvent, FormEvent, KeyboardEvent, ReactNode } from 'react'

import { Alert, AlertDescription } from '#components/alert'
import { Badge, BadgeLabel } from '#components/badge'
import { Button } from '#components/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '#components/dialog'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '#components/input-group'
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '#components/item'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from '#components/select'
import { Spinner } from '#components/spinner'
import { cn } from '#lib/utils'
import {
  Activity02Icon,
  ArrowExpandDiagonalIcon,
  Attachment02Icon,
  Cancel01Icon,
  File02Icon,
  FileIcon,
  FileSpreadsheetIcon,
  MailSend02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useId, useMemo, useState } from 'react'

export interface SessionComposerAttachmentItem {
  id: string
  kind: string
  closePreviewLabel?: string
  mediaType?: 'file' | 'image'
  name: string
  onPreviewLabel?: string
  previewAlt?: string
  previewTitle?: string
  previewUrl?: string
  removeLabel: string
  size?: string
}

export interface SessionComposerOption {
  description?: ReactNode
  label: ReactNode
  value: string
}

export interface SessionComposerMentionOption {
  description?: ReactNode
  disabled?: boolean
  id: string
  label: ReactNode
}

export interface SessionComposerMentionQuery {
  active: boolean
  query: string
  trigger: '$'
}

export interface SessionComposerAction {
  ariaLabel: string
  disabled?: boolean
  icon: ReactNode
  id: string
  label?: ReactNode
  onClick: () => void
  title?: string
}

export interface SessionComposerUsage {
  ariaLabel?: string
  label: ReactNode
  meterValue?: number
  title?: string
  value: ReactNode
}

export interface SessionComposerProps {
  allowSubmitWithoutText?: boolean
  ariaLabel: string
  attachmentCountLabel?: string
  attachmentTriggerLabel?: string
  attachments?: SessionComposerAttachmentItem[]
  className?: string
  description?: ReactNode
  disabled?: boolean
  disabledReason?: ReactNode
  error?: ReactNode
  mentionOptions?: SessionComposerMentionOption[]
  mentionQuery?: SessionComposerMentionQuery
  onAddAttachmentFiles?: (files: File[]) => void
  onAddAttachments?: () => void
  onMentionDismiss?: () => void
  onMentionSelect?: (option: SessionComposerMentionOption) => void
  onRemoveAttachment?: (id: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onModeChange?: (value: string) => void
  onValueChange: (value: string) => void
  placeholder?: string
  secondaryActions?: SessionComposerAction[]
  selectedModeId?: string
  statusAction?: SessionComposerAction
  submitAriaLabel: string
  submitDisabled?: boolean
  submitIcon?: ReactNode
  submitting?: boolean
  submitTitle?: string
  modeClassName?: string
  modeContentClassName?: string
  modeLabel?: string
  modeOptions?: SessionComposerOption[]
  title?: ReactNode
  usage?: SessionComposerUsage
  value: string
  variant?: 'compact' | 'large' | 'panel'
}

export interface SessionComposerActionBarProps {
  attachmentCount?: number
  attachmentCountLabel?: string
  attachmentActionDisabled?: boolean
  attachmentTriggerLabel?: string
  disabled?: boolean
  onAddAttachments?: () => void
  onModeChange?: (value: string) => void
  secondaryActions?: SessionComposerAction[]
  selectedModeId?: string
  statusAction?: SessionComposerAction
  submitAriaLabel: string
  submitIcon?: ReactNode
  submitting?: boolean
  submitTitle?: string
  modeClassName?: string
  modeContentClassName?: string
  modeLabel?: string
  modeOptions?: SessionComposerOption[]
  usage?: SessionComposerUsage
}

const EMPTY_ATTACHMENTS: SessionComposerAttachmentItem[] = []
const EMPTY_COMPOSER_ACTIONS: SessionComposerAction[] = []
const EMPTY_MENTION_OPTIONS: SessionComposerMentionOption[] = []
const EMPTY_COMPOSER_OPTIONS: SessionComposerOption[] = []

export function SessionComposer({
  allowSubmitWithoutText = false,
  ariaLabel,
  attachmentCountLabel,
  attachmentTriggerLabel,
  attachments = EMPTY_ATTACHMENTS,
  className,
  description,
  disabled = false,
  disabledReason,
  error,
  mentionOptions = EMPTY_MENTION_OPTIONS,
  mentionQuery,
  onAddAttachmentFiles,
  onAddAttachments,
  onMentionDismiss,
  onMentionSelect,
  onRemoveAttachment,
  onSubmit,
  onModeChange,
  onValueChange,
  placeholder,
  secondaryActions = EMPTY_COMPOSER_ACTIONS,
  selectedModeId,
  statusAction,
  submitAriaLabel,
  submitDisabled = false,
  submitIcon,
  submitting = false,
  submitTitle,
  modeClassName,
  modeContentClassName,
  modeLabel,
  modeOptions = EMPTY_COMPOSER_OPTIONS,
  title,
  usage,
  value,
  variant = 'large',
}: SessionComposerProps) {
  const canSubmit = !disabled && !submitDisabled && !submitting && (allowSubmitWithoutText || value.trim().length > 0 || attachments.length > 0)
  const mentionListboxId = useId()
  const mentionTypeaheadOpen = mentionQuery?.active === true && mentionQuery.trigger === '$'
  const filteredMentionOptions = useMemo(
    () => filterSessionComposerMentionOptions(mentionOptions, mentionQuery),
    [mentionOptions, mentionQuery],
  )
  const enabledMentionOptions = useMemo(
    () => filteredMentionOptions.filter(option => !option.disabled),
    [filteredMentionOptions],
  )
  const enabledMentionOptionKey = enabledMentionOptions.map(option => option.id).join('\0')
  const [activeMentionOptionState, setActiveMentionOptionState] = useState({ index: 0, optionKey: '' })
  const activeMentionOptionIndex = activeMentionOptionState.optionKey === enabledMentionOptionKey
    ? activeMentionOptionState.index
    : 0
  const activeMentionOption = mentionTypeaheadOpen
    ? enabledMentionOptions[activeMentionOptionIndex] ?? enabledMentionOptions[0]
    : undefined
  const activeMentionOptionDomId = activeMentionOption
    ? getMentionOptionDomId(mentionListboxId, activeMentionOption)
    : undefined

  return (
    <form
      data-slot="session-composer"
      data-variant={variant}
      aria-label={ariaLabel}
      className={cn(
        'flex min-w-0 flex-col gap-2',
        className,
      )}
      onSubmit={onSubmit}
    >
      {title || description
        ? (
            <Item variant="default" size="xs" className="px-0 py-0">
              <ItemContent className="min-w-0 gap-0.5">
                {title ? <ItemTitle className="max-w-full">{title}</ItemTitle> : null}
                {description ? <ItemDescription className="max-w-full line-clamp-none">{description}</ItemDescription> : null}
              </ItemContent>
            </Item>
          )
        : null}

      <InputGroup
        data-session-slot="composer-field"
        className={cn(
          'h-auto min-h-0 flex-col items-stretch overflow-hidden',
          variant === 'large' && 'min-h-44',
          variant === 'panel' && 'min-h-0 flex-1',
        )}
        data-disabled={disabled || submitting ? true : undefined}
      >
        <SessionComposerTypeahead
          activeOptionId={activeMentionOption?.id}
          listboxId={mentionListboxId}
          mentionOptions={filteredMentionOptions}
          mentionQuery={mentionQuery}
          onMentionSelect={onMentionSelect}
        />
        <SessionAttachmentList attachments={attachments} onRemoveAttachment={onRemoveAttachment} removeDisabled={disabled || submitting} />
        <InputGroupTextarea
          data-session-slot="composer-input"
          aria-label={ariaLabel}
          className={cn(
            'min-h-16 max-h-40 w-full',
            variant === 'large' && 'min-h-32',
            variant === 'compact' && 'min-h-12',
            variant === 'panel' && 'min-h-0 max-h-none flex-1 field-sizing-fixed',
          )}
          disabled={disabled || submitting}
          aria-activedescendant={activeMentionOptionDomId}
          aria-controls={mentionTypeaheadOpen ? mentionListboxId : undefined}
          aria-expanded={mentionTypeaheadOpen ? true : undefined}
          aria-haspopup={mentionTypeaheadOpen ? 'listbox' : undefined}
          placeholder={placeholder}
          value={value}
          onChange={event => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (handleSessionComposerSubmitKeyDown(event, { canSubmit }))
              return
            handleMentionTypeaheadKeyDown(event, {
              activeIndex: activeMentionOptionIndex,
              enabledOptions: enabledMentionOptions,
              isOpen: mentionTypeaheadOpen,
              onDismiss: onMentionDismiss,
              onSelect: onMentionSelect,
              setActiveIndex: index => setActiveMentionOptionState({ index, optionKey: enabledMentionOptionKey }),
            })
          }}
          onPaste={event => handleAttachmentPaste(event, onAddAttachmentFiles)}
        />
        {error || disabledReason
          ? (
              <InputGroupAddon align="block-end" className="flex-col items-stretch gap-1 pt-2">
                {error ? <ComposerWarning>{error}</ComposerWarning> : null}
                {disabledReason ? <ComposerWarning>{disabledReason}</ComposerWarning> : null}
              </InputGroupAddon>
            )
          : null}
        <SessionComposerActionBar
          attachmentCount={attachments.length}
          attachmentCountLabel={attachmentCountLabel}
          attachmentActionDisabled={disabled || submitting}
          attachmentTriggerLabel={attachmentTriggerLabel}
          disabled={!canSubmit}
          onAddAttachments={onAddAttachments}
          onModeChange={onModeChange}
          secondaryActions={secondaryActions}
          selectedModeId={selectedModeId}
          statusAction={statusAction}
          submitAriaLabel={submitAriaLabel}
          submitIcon={submitIcon}
          submitting={submitting}
          submitTitle={submitTitle}
          modeClassName={modeClassName}
          modeContentClassName={modeContentClassName}
          modeLabel={modeLabel}
          modeOptions={modeOptions}
          usage={usage}
        />
      </InputGroup>
    </form>
  )
}

function SessionComposerTypeahead({
  activeOptionId,
  listboxId,
  mentionOptions,
  mentionQuery,
  onMentionSelect,
}: {
  activeOptionId?: string
  listboxId: string
  mentionOptions: SessionComposerMentionOption[]
  mentionQuery?: SessionComposerMentionQuery
  onMentionSelect?: (option: SessionComposerMentionOption) => void
}) {
  if (!mentionQuery?.active || mentionQuery.trigger !== '$')
    return null

  return (
    <InputGroupAddon
      id={listboxId}
      data-session-slot="composer-typeahead"
      data-side="top"
      align="block-start"
      className="flex-col items-stretch rounded-b-none border-b bg-popover p-1 shadow-lg"
      role="listbox"
      aria-label="Skill suggestions"
    >
      {mentionOptions.length > 0
        ? mentionOptions.map(option => (
            <Button
              key={option.id}
              id={getMentionOptionDomId(listboxId, option)}
              type="button"
              variant="ghost"
              className="h-auto w-full justify-start p-0 text-left"
              role="option"
              aria-disabled={option.disabled ? true : undefined}
              aria-selected={option.id === activeOptionId}
              disabled={option.disabled}
              onClick={() => onMentionSelect?.(option)}
            >
              <Item variant="default" size="xs" className="min-w-0">
                <ItemContent className="min-w-0 gap-0.5">
                  <ItemTitle className="max-w-full">{option.label}</ItemTitle>
                  {option.description
                    ? <ItemDescription className="max-w-full">{option.description}</ItemDescription>
                    : null}
                </ItemContent>
              </Item>
            </Button>
          ))
        : (
            <Item variant="muted" size="xs">
              <ItemContent>
                <ItemTitle>No matching skill</ItemTitle>
              </ItemContent>
            </Item>
          )}
    </InputGroupAddon>
  )
}

function filterSessionComposerMentionOptions(
  mentionOptions: SessionComposerMentionOption[],
  mentionQuery?: SessionComposerMentionQuery,
) {
  if (!mentionQuery?.active || mentionQuery.trigger !== '$')
    return []

  const query = mentionQuery.query.trim().toLowerCase()
  return mentionOptions.filter((option) => {
    const label = typeof option.label === 'string' ? option.label : option.id
    return !query || option.id.toLowerCase().includes(query) || label.toLowerCase().includes(query)
  })
}

function getMentionOptionDomId(listboxId: string, option: SessionComposerMentionOption) {
  return `${listboxId}-option-${option.id.replace(/[^\w-]/g, '-')}`
}

function handleSessionComposerSubmitKeyDown(
  event: KeyboardEvent<HTMLTextAreaElement>,
  { canSubmit }: { canSubmit: boolean },
): boolean {
  if (event.key !== 'Enter' || event.shiftKey || (!event.metaKey && !event.ctrlKey))
    return false

  event.preventDefault()

  if (!canSubmit)
    return true

  const form = event.currentTarget.form
  if (!form)
    return true

  if (typeof form.requestSubmit === 'function') {
    form.requestSubmit()
    return true
  }

  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  return true
}

function handleMentionTypeaheadKeyDown(
  event: KeyboardEvent<HTMLTextAreaElement>,
  {
    activeIndex,
    enabledOptions,
    isOpen,
    onDismiss,
    onSelect,
    setActiveIndex,
  }: {
    activeIndex: number
    enabledOptions: SessionComposerMentionOption[]
    isOpen: boolean
    onDismiss?: () => void
    onSelect?: (option: SessionComposerMentionOption) => void
    setActiveIndex: (index: number) => void
  },
) {
  if (!isOpen)
    return

  if (event.key === 'Escape') {
    event.preventDefault()
    onDismiss?.()
    return
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    const activeOption = enabledOptions[activeIndex] ?? enabledOptions[0]
    if (activeOption)
      onSelect?.(activeOption)
    return
  }

  if (enabledOptions.length === 0)
    return

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    setActiveIndex((activeIndex + 1) % enabledOptions.length)
  }
  else if (event.key === 'ArrowUp') {
    event.preventDefault()
    setActiveIndex((activeIndex - 1 + enabledOptions.length) % enabledOptions.length)
  }
}

function ComposerWarning({ children }: { children: ReactNode }) {
  return (
    <Alert variant="destructive" role="status">
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  )
}

function handleAttachmentPaste(event: ClipboardEvent<HTMLTextAreaElement>, onAddAttachmentFiles?: (files: File[]) => void) {
  if (!onAddAttachmentFiles)
    return
  const files = filesFromDataTransfer(event.clipboardData)
  if (files.length === 0)
    return
  onAddAttachmentFiles(files)
}

function filesFromDataTransfer(dataTransfer: DataTransfer): File[] {
  const files = new Map<string, File>()
  for (const file of Array.from(dataTransfer.files))
    files.set(fileKey(file), file)
  for (const item of Array.from(dataTransfer.items)) {
    if (item.kind !== 'file')
      continue
    const file = item.getAsFile()
    if (file)
      files.set(fileKey(file), file)
  }
  return [...files.values()]
}

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.type}`
}

export function SessionComposerActionBar({
  attachmentCount = 0,
  attachmentCountLabel,
  attachmentActionDisabled = false,
  attachmentTriggerLabel,
  disabled = false,
  onAddAttachments,
  onModeChange,
  secondaryActions = EMPTY_COMPOSER_ACTIONS,
  selectedModeId,
  statusAction,
  submitAriaLabel,
  submitIcon,
  submitting = false,
  submitTitle,
  modeClassName,
  modeContentClassName,
  modeLabel = 'Mode',
  modeOptions = EMPTY_COMPOSER_OPTIONS,
  usage,
}: SessionComposerActionBarProps) {
  const modeSelect = onModeChange && modeOptions.length > 0
    ? { onChange: onModeChange, value: selectedModeId }
    : null
  const selectedModeOption = modeSelect
    ? modeOptions.find(option => option.value === modeSelect.value)
    : null

  return (
    <InputGroupAddon data-session-slot="composer-action-bar" align="block-end" className="flex-row items-center justify-between gap-2 pt-2">
      <ItemActions data-session-slot="composer-action-left" className="min-w-0 gap-1">
        {onAddAttachments && attachmentTriggerLabel
          ? (
              <InputGroupButton
                type="button"
                variant="ghost"
                size={attachmentCount > 0 ? 'sm' : 'icon-sm'}
                aria-label={attachmentTriggerLabel}
                disabled={attachmentActionDisabled}
                title={attachmentTriggerLabel}
                onClick={onAddAttachments}
              >
                <HugeiconsIcon icon={Attachment02Icon} strokeWidth={2} aria-hidden="true" />
                {attachmentCount > 0
                  ? (
                      <Badge variant="secondary" aria-label={attachmentCountLabel}>
                        <BadgeLabel>{attachmentCount}</BadgeLabel>
                      </Badge>
                    )
                  : null}
              </InputGroupButton>
            )
          : null}
        {secondaryActions.map(action => <SessionComposerIconAction key={action.id} action={action} />)}
      </ItemActions>

      <ItemActions data-session-slot="composer-action-main" className="min-w-0 flex-1 justify-end gap-2">
        {modeSelect
          ? (
              <Select value={modeSelect.value ?? ''} onValueChange={modeSelect.onChange}>
                <SelectTrigger
                  aria-label={modeLabel}
                  className={cn('max-w-full', modeClassName)}
                  size="sm"
                >
                  <span data-slot="select-value" className="flex min-w-0 items-center gap-1.5 truncate">
                    {selectedModeOption?.label ?? modeLabel}
                  </span>
                </SelectTrigger>
                <SelectContent className={modeContentClassName} side="top" data-side="top">
                  <SelectGroup>
                    {modeOptions.map(option => (
                      <SelectItem key={option.value} value={option.value} textValue={typeof option.label === 'string' ? option.label : undefined}>
                        <ItemContent asChild className="min-w-0 gap-0.5">
                          <span>
                            <ItemTitle asChild className="max-w-full truncate">
                              <span>{option.label}</span>
                            </ItemTitle>
                            {option.description
                              ? (
                                  <ItemDescription asChild className="max-w-full truncate">
                                    <span>{option.description}</span>
                                  </ItemDescription>
                                )
                              : null}
                          </span>
                        </ItemContent>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            )
          : null}
        {statusAction ? <SessionComposerStatusAction action={statusAction} /> : null}
      </ItemActions>

      <ItemActions data-session-slot="composer-action-right" className="min-w-0 gap-2">
        {usage
          ? (
              <Badge
                variant="outline"
                className="max-w-48 gap-1"
                aria-label={usage.ariaLabel}
                title={usage.title}
              >
                <HugeiconsIcon icon={Activity02Icon} strokeWidth={2} data-icon="inline-start" aria-hidden="true" />
                <ItemContent asChild className="min-w-0 flex-none flex-row items-center gap-1">
                  <span>
                    <ItemTitle asChild className="max-w-full truncate">
                      <span>{usage.label}</span>
                    </ItemTitle>
                    <ItemDescription asChild className="max-w-full truncate">
                      <span>{usage.value}</span>
                    </ItemDescription>
                  </span>
                </ItemContent>
              </Badge>
            )
          : null}
        <InputGroupButton
          type="submit"
          variant="default"
          size="icon-sm"
          disabled={disabled || submitting}
          aria-busy={submitting ? true : undefined}
          aria-label={submitAriaLabel}
          title={submitTitle ?? submitAriaLabel}
        >
          {submitting
            ? <Spinner aria-hidden="true" />
            : submitIcon ?? <HugeiconsIcon icon={MailSend02Icon} strokeWidth={2} aria-hidden="true" />}
        </InputGroupButton>
      </ItemActions>
    </InputGroupAddon>
  )
}

export function SessionAttachmentList({
  attachments,
  onRemoveAttachment,
  removeDisabled = false,
}: {
  attachments: SessionComposerAttachmentItem[]
  onRemoveAttachment?: (id: string) => void
  removeDisabled?: boolean
}) {
  const [previewAttachment, setPreviewAttachment] = useState<SessionComposerAttachmentItem | null>(null)
  const visiblePreviewAttachment = previewAttachment
    ? attachments.find(attachment => attachment.id === previewAttachment.id && attachment.previewUrl === previewAttachment.previewUrl) ?? null
    : null

  if (attachments.length === 0)
    return null

  return (
    <>
      <InputGroupAddon data-session-slot="composer-attachment-list" align="block-start" className="flex-row flex-wrap items-center gap-2 p-2">
        {attachments.map((attachment) => {
          const isImage = attachment.mediaType === 'image' && attachment.previewUrl
          return (
            <Item key={attachment.id} variant="muted" size={isImage ? 'default' : 'xs'} data-media-type={isImage ? 'image' : 'file'} className={cn('min-w-0 max-w-56 flex-nowrap', isImage ? 'w-32 p-1' : undefined)}>
              {isImage
                ? (
                    <ItemContent className="min-w-0">
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-auto w-full justify-between overflow-hidden p-0 pr-2"
                        aria-label={attachment.onPreviewLabel ?? attachment.previewTitle ?? attachment.name}
                        title={attachment.previewTitle ?? attachment.name}
                        onClick={() => setPreviewAttachment(attachment)}
                      >
                        <ItemMedia variant="image" className="size-14">
                          <img src={attachment.previewUrl} alt={attachment.previewAlt ?? ''} />
                        </ItemMedia>
                        <HugeiconsIcon icon={ArrowExpandDiagonalIcon} strokeWidth={2} data-icon="inline-end" aria-hidden="true" />
                      </Button>
                    </ItemContent>
                  )
                : (
                    <ItemMedia variant="icon" aria-hidden="true">
                      {renderAttachmentFileIcon(attachment)}
                    </ItemMedia>
                  )}
              {isImage
                ? null
                : (
                    <ItemContent className="min-w-0">
                      <ItemTitle className="max-w-full">{attachment.name}</ItemTitle>
                      <ItemDescription className="max-w-full">
                        {attachment.kind}
                        {attachment.size ? ` · ${attachment.size}` : ''}
                      </ItemDescription>
                    </ItemContent>
                  )}
              {onRemoveAttachment
                ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={attachment.removeLabel}
                      disabled={removeDisabled}
                      title={attachment.removeLabel}
                      onClick={() => onRemoveAttachment(attachment.id)}
                    >
                      <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} data-icon="inline-start" aria-hidden="true" />
                    </Button>
                  )
                : null}
            </Item>
          )
        })}
      </InputGroupAddon>
      <Dialog open={Boolean(visiblePreviewAttachment?.previewUrl)} onOpenChange={open => !open && setPreviewAttachment(null)}>
        {visiblePreviewAttachment?.previewUrl
          ? (
              <DialogContent className="max-w-3xl p-3" closeButtonLabel={visiblePreviewAttachment.closePreviewLabel}>
                <DialogTitle className="sr-only">{visiblePreviewAttachment.previewTitle ?? visiblePreviewAttachment.name}</DialogTitle>
                <DialogDescription className="sr-only">{visiblePreviewAttachment.name}</DialogDescription>
                <img className="max-h-dvh w-full object-contain" src={visiblePreviewAttachment.previewUrl} alt={visiblePreviewAttachment.previewAlt ?? visiblePreviewAttachment.name} />
                <ItemDescription asChild className="max-w-full truncate">
                  <span>{visiblePreviewAttachment.name}</span>
                </ItemDescription>
              </DialogContent>
            )
          : null}
      </Dialog>
    </>
  )
}

function renderAttachmentFileIcon(attachment: SessionComposerAttachmentItem) {
  const kind = attachment.kind.toUpperCase()
  if (['CSV', 'TSV', 'XLS', 'XLSX'].includes(kind))
    return <HugeiconsIcon icon={FileSpreadsheetIcon} strokeWidth={2} aria-hidden="true" />
  if (['MD', 'PDF', 'TXT', 'JSON', 'DOC', 'DOCX'].includes(kind))
    return <HugeiconsIcon icon={File02Icon} strokeWidth={2} aria-hidden="true" />
  return <HugeiconsIcon icon={FileIcon} strokeWidth={2} aria-hidden="true" />
}

function SessionComposerIconAction({ action }: { action: SessionComposerAction }) {
  return (
    <InputGroupButton
      type="button"
      variant="ghost"
      size={action.label ? 'sm' : 'icon-sm'}
      aria-label={action.ariaLabel}
      disabled={action.disabled}
      title={action.title ?? action.ariaLabel}
      onClick={action.onClick}
    >
      {action.icon}
      {action.label}
    </InputGroupButton>
  )
}

function SessionComposerStatusAction({ action }: { action: SessionComposerAction }) {
  return (
    <InputGroupButton
      type="button"
      variant="outline"
      size="sm"
      aria-label={action.ariaLabel}
      disabled={action.disabled}
      title={action.title ?? action.ariaLabel}
      onClick={action.onClick}
    >
      {action.icon}
      {action.label}
    </InputGroupButton>
  )
}

export type { SessionComposerMaterial, SessionComposerMaterialEncoding } from './session-composer-attachments'
