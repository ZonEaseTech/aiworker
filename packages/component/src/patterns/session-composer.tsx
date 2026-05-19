import type { FormEvent, ReactNode } from 'react'

import { Paperclip, SendHorizontal, X } from 'lucide-react'
import { IconButton, Select, Textarea } from '../primitives'
import { cx } from '../utils/cx'

export interface SessionComposerAttachmentItem {
  id: string
  kind: string
  name: string
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

      <Textarea
        aria-label={ariaLabel}
        className="session-composer-input"
        disabled={disabled || submitting}
        placeholder={placeholder}
        value={value}
        onChange={event => onValueChange(event.target.value)}
      />

      <SessionAttachmentList attachments={attachments} onRemoveAttachment={onRemoveAttachment} />

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
      />
    </form>
  )
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
  if (attachments.length === 0)
    return null

  return (
    <div className="session-composer-attachment-list">
      {attachments.map(attachment => (
        <div key={attachment.id} className="session-composer-attachment-row">
          <span className="session-composer-attachment-kind">{attachment.kind}</span>
          <span className="session-composer-attachment-name">{attachment.name}</span>
          {attachment.size ? <span className="session-composer-attachment-size">{attachment.size}</span> : null}
          {onRemoveAttachment
            ? (
                <IconButton
                  aria-label={attachment.removeLabel}
                  title={attachment.removeLabel}
                  onClick={() => onRemoveAttachment(attachment.id)}
                >
                  <X aria-hidden="true" size={13} />
                </IconButton>
              )
            : null}
        </div>
      ))}
    </div>
  )
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
