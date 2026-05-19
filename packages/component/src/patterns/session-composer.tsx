import type { ClipboardEvent, FormEvent, ReactNode } from 'react'

import { Activity, Expand, File as FileIcon, FileSpreadsheet, FileText, Paperclip, SendHorizontal, X } from 'lucide-react'
import { useState } from 'react'
import { IconButton, Select, Textarea } from '../primitives'
import { cx } from '../utils/cx'

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
  onAddAttachmentFiles?: (files: File[]) => void
  onAddAttachments?: () => void
  onRemoveAttachment?: (id: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onTemplateChange?: (value: string) => void
  onValueChange: (value: string) => void
  placeholder?: string
  secondaryActions?: SessionComposerAction[]
  selectedTemplateId?: string
  submitDisabled?: boolean
  statusAction?: SessionComposerAction
  submitAriaLabel: string
  submitIcon?: ReactNode
  submitting?: boolean
  submitTitle?: string
  templateClassName?: string
  templateContentClassName?: string
  templateLabel?: string
  templateOptions?: SessionComposerOption[]
  title?: ReactNode
  usage?: SessionComposerUsage
  value: string
  variant?: 'compact' | 'large' | 'panel'
}

export interface SessionComposerActionBarProps {
  attachmentCount?: number
  attachmentCountLabel?: string
  attachmentTriggerLabel?: string
  disabled?: boolean
  onAddAttachments?: () => void
  onTemplateChange?: (value: string) => void
  secondaryActions?: SessionComposerAction[]
  selectedTemplateId?: string
  statusAction?: SessionComposerAction
  submitAriaLabel: string
  submitIcon?: ReactNode
  submitting?: boolean
  submitTitle?: string
  templateClassName?: string
  templateContentClassName?: string
  templateLabel?: string
  templateOptions?: SessionComposerOption[]
  usage?: SessionComposerUsage
}

export function SessionComposer({
  allowSubmitWithoutText = false,
  ariaLabel,
  attachmentCountLabel,
  attachmentTriggerLabel,
  attachments = [],
  className,
  description,
  disabled = false,
  disabledReason,
  error,
  onAddAttachmentFiles,
  onAddAttachments,
  onRemoveAttachment,
  onSubmit,
  onTemplateChange,
  onValueChange,
  placeholder,
  secondaryActions,
  selectedTemplateId,
  statusAction,
  submitAriaLabel,
  submitDisabled = false,
  submitIcon,
  submitting = false,
  submitTitle,
  templateClassName,
  templateContentClassName,
  templateLabel,
  templateOptions,
  title,
  usage,
  value,
  variant = 'large',
}: SessionComposerProps) {
  const canSubmit = !disabled && !submitDisabled && !submitting && (allowSubmitWithoutText || value.trim().length > 0 || attachments.length > 0)

  return (
    <form className={cx('session-composer', `session-composer-${variant}`, className)} onSubmit={onSubmit}>
      {title || description
        ? (
            <header className="session-composer-heading">
              <div>
                {title ? <strong>{title}</strong> : null}
                {description ? <small>{description}</small> : null}
              </div>
            </header>
          )
        : null}

      <div className="session-composer-field">
        <SessionAttachmentList attachments={attachments} onRemoveAttachment={onRemoveAttachment} />

        <Textarea
          aria-label={ariaLabel}
          className="session-composer-input"
          disabled={disabled || submitting}
          placeholder={placeholder}
          value={value}
          onChange={event => onValueChange(event.target.value)}
          onPaste={event => handleAttachmentPaste(event, onAddAttachmentFiles)}
        />

        {error ? <div className="session-composer-warning" role="status">{error}</div> : null}
        {disabledReason ? <div className="session-composer-warning" role="status">{disabledReason}</div> : null}

        <SessionComposerActionBar
          attachmentCount={attachments.length}
          attachmentCountLabel={attachmentCountLabel}
          attachmentTriggerLabel={attachmentTriggerLabel}
          disabled={!canSubmit}
          onAddAttachments={onAddAttachments}
          onTemplateChange={onTemplateChange}
          secondaryActions={secondaryActions}
          selectedTemplateId={selectedTemplateId}
          statusAction={statusAction}
          submitAriaLabel={submitAriaLabel}
          submitIcon={submitIcon}
          submitting={submitting}
          submitTitle={submitTitle}
          templateClassName={templateClassName}
          templateContentClassName={templateContentClassName}
          templateLabel={templateLabel}
          templateOptions={templateOptions}
          usage={usage}
        />
      </div>
    </form>
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
  attachmentTriggerLabel,
  disabled = false,
  onAddAttachments,
  onTemplateChange,
  secondaryActions = [],
  selectedTemplateId,
  statusAction,
  submitAriaLabel,
  submitIcon,
  submitting = false,
  submitTitle,
  templateClassName,
  templateContentClassName,
  templateLabel = 'Proposal type',
  templateOptions = [],
  usage,
}: SessionComposerActionBarProps) {
  const templateSelect = selectedTemplateId && onTemplateChange && templateOptions.length > 0
    ? { onChange: onTemplateChange, value: selectedTemplateId }
    : null

  return (
    <div className="session-composer-action-bar">
      <div className="session-composer-action-left">
        {onAddAttachments && attachmentTriggerLabel
          ? (
              <IconButton
                className="session-composer-attachment-button"
                aria-label={attachmentTriggerLabel}
                title={attachmentTriggerLabel}
                onClick={onAddAttachments}
              >
                <Paperclip aria-hidden="true" size={15} />
                {attachmentCount > 0
                  ? <span className="session-composer-attachment-count" aria-label={attachmentCountLabel}>{attachmentCount}</span>
                  : null}
              </IconButton>
            )
          : null}
        {secondaryActions.map(action => <SessionComposerIconAction key={action.id} action={action} />)}
      </div>

      <div className="session-composer-action-main">
        {usage
          ? (
              <span className="session-composer-usage" aria-label={usage.ariaLabel} title={usage.title}>
                <Activity aria-hidden="true" size={14} />
                <span>{usage.label}</span>
                <small>{usage.value}</small>
              </span>
            )
          : null}
        {templateSelect
          ? (
              <Select
                className={cx('session-composer-template-select', templateClassName)}
                contentClassName={cx('session-composer-template-select-content', templateContentClassName)}
                ariaLabel={templateLabel}
                label={templateLabel}
                options={templateOptions}
                side="top"
                value={templateSelect.value}
                onChange={templateSelect.onChange}
              />
            )
          : null}
        {statusAction ? <SessionComposerStatusAction action={statusAction} /> : null}
      </div>

      <IconButton
        type="submit"
        className="primary session-composer-submit"
        disabled={disabled || submitting}
        aria-label={submitAriaLabel}
        title={submitTitle ?? submitAriaLabel}
      >
        {submitIcon ?? <SendHorizontal aria-hidden="true" size={16} />}
      </IconButton>
    </div>
  )
}

export function SessionAttachmentList({
  attachments,
  onRemoveAttachment,
}: {
  attachments: SessionComposerAttachmentItem[]
  onRemoveAttachment?: (id: string) => void
}) {
  const [previewAttachment, setPreviewAttachment] = useState<SessionComposerAttachmentItem | null>(null)

  if (attachments.length === 0)
    return null

  return (
    <>
      <div className="session-composer-attachment-list">
        {attachments.map((attachment) => {
          const isImage = attachment.mediaType === 'image' && attachment.previewUrl
          return (
            <div key={attachment.id} className={cx('session-composer-attachment-card', isImage ? 'image' : 'file')}>
              {isImage
                ? (
                  <button
                    type="button"
                    className="session-composer-attachment-preview"
                    aria-label={attachment.onPreviewLabel ?? attachment.previewTitle ?? attachment.name}
                    title={attachment.previewTitle ?? attachment.name}
                    onClick={() => setPreviewAttachment(attachment)}
                  >
                    <img src={attachment.previewUrl} alt={attachment.previewAlt ?? ''} />
                    <Expand aria-hidden="true" size={12} />
                  </button>
                  )
                : (
                  <span className="session-composer-attachment-file-icon" aria-hidden="true">
                    {renderAttachmentFileIcon(attachment)}
                  </span>
                  )}
              {isImage
                ? null
                : (
                    <span className="session-composer-attachment-copy">
                      <span className="session-composer-attachment-name">{attachment.name}</span>
                      <span className="session-composer-attachment-kind">{attachment.kind}</span>
                    </span>
                  )}
              {onRemoveAttachment
                ? (
                  <IconButton
                    className="session-composer-attachment-remove"
                    aria-label={attachment.removeLabel}
                    title={attachment.removeLabel}
                    onClick={() => onRemoveAttachment(attachment.id)}
                  >
                    <X aria-hidden="true" size={13} />
                  </IconButton>
                  )
                : null}
            </div>
          )
        })}
      </div>
      {previewAttachment?.previewUrl
        ? (
            <div
              className="session-composer-lightbox"
              role="dialog"
              aria-modal="true"
              aria-label={previewAttachment.previewTitle ?? previewAttachment.name}
              onClick={() => setPreviewAttachment(null)}
            >
              <div className="session-composer-lightbox-frame" onClick={event => event.stopPropagation()}>
                <IconButton
                  className="session-composer-lightbox-close"
                  aria-label={previewAttachment.closePreviewLabel ?? 'Close preview'}
                  title={previewAttachment.closePreviewLabel ?? 'Close preview'}
                  onClick={() => setPreviewAttachment(null)}
                >
                  <X aria-hidden="true" size={16} />
                </IconButton>
                <img src={previewAttachment.previewUrl} alt={previewAttachment.previewAlt ?? previewAttachment.name} />
                <span>{previewAttachment.name}</span>
              </div>
            </div>
          )
        : null}
    </>
  )
}

function renderAttachmentFileIcon(attachment: SessionComposerAttachmentItem) {
  const kind = attachment.kind.toUpperCase()
  if (['CSV', 'TSV', 'XLS', 'XLSX'].includes(kind))
    return <FileSpreadsheet size={25} />
  if (['MD', 'PDF', 'TXT', 'JSON', 'DOC', 'DOCX'].includes(kind))
    return <FileText size={25} />
  return <FileIcon size={25} />
}

function SessionComposerIconAction({ action }: { action: SessionComposerAction }) {
  return (
    <IconButton
      aria-label={action.ariaLabel}
      disabled={action.disabled}
      title={action.title ?? action.ariaLabel}
      onClick={action.onClick}
    >
      {action.icon}
      {action.label}
    </IconButton>
  )
}

function SessionComposerStatusAction({ action }: { action: SessionComposerAction }) {
  return (
    <button
      type="button"
      className="session-composer-status-action"
      aria-label={action.ariaLabel}
      disabled={action.disabled}
      title={action.title ?? action.ariaLabel}
      onClick={action.onClick}
    >
      {action.icon}
      {action.label ? <span>{action.label}</span> : null}
    </button>
  )
}
