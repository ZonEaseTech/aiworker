import type { VerticalSoul } from '@zonease/aiworker-shared'
import type { FormEvent } from 'react'
import type { messagesFor, normalizeLocale } from '../../i18n'

import { CreationDialog, StudioSelect } from '@zonease/aiworker-component'
import { Plus } from 'lucide-react'
import { displaySoul } from '../../i18n'

type WorkerMessages = ReturnType<typeof messagesFor>

export function CreateWorkerDialog({
  availableSouls,
  copy,
  locale,
  onClose,
  onNameChange,
  onSoulChange,
  onSubmit,
  open,
  selectedSoulId,
  workerName,
}: {
  availableSouls: VerticalSoul[]
  copy: WorkerMessages
  locale: ReturnType<typeof normalizeLocale>
  onClose: () => void
  onNameChange: (value: string) => void
  onSoulChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  open: boolean
  selectedSoulId: string
  workerName: string
}) {
  return (
    <CreationDialog
      description={copy.workspace.createWorkerHint}
      open={open}
      title={copy.workspace.createWorker}
      titleId="create-worker-dialog-title"
      closeLabel={copy.accessibility.closeDialog}
      onClose={onClose}
    >
      <form className="dialog-form" onSubmit={onSubmit}>
        <div className="settings-field">
          <span>{copy.create.soul}</span>
          <StudioSelect
            ariaLabel={copy.create.soul}
            label={copy.create.soul}
            options={availableSouls.map((soul) => {
              const soulCopy = displaySoul(soul, locale)
              return {
                description: soulCopy.domain,
                label: soulCopy.name,
                value: soul.id,
              }
            })}
            value={selectedSoulId}
            onChange={onSoulChange}
          />
        </div>
        <label className="settings-field">
          <span>{copy.workspace.workerName}</span>
          <input
            className="newproj-name"
            aria-label={copy.workspace.workerName}
            placeholder={copy.workspace.workerName}
            value={workerName}
            onChange={event => onNameChange(event.target.value)}
          />
        </label>
        <div className="dialog-actions">
          <button type="button" className="ghost" onClick={onClose}>{copy.accessibility.closeDialog}</button>
          <button className="primary" type="submit" disabled={!workerName.trim() || availableSouls.length === 0}>
            <Plus aria-hidden="true" size={13} />
            <span>{copy.workspace.createWorker}</span>
          </button>
        </div>
      </form>
    </CreationDialog>
  )
}

export function CreateWorkspaceDialog({
  copy,
  onClose,
  onSubmit,
  onTitleChange,
  open,
  placeholder,
  workerLabel,
  submitting,
  workspaceTitle,
}: {
  copy: WorkerMessages
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onTitleChange: (value: string) => void
  open: boolean
  placeholder: string
  workerLabel: string
  submitting: boolean
  workspaceTitle: string
}) {
  return (
    <CreationDialog
      description={copy.workspace.createWorkspaceHint}
      open={open}
      title={copy.workspace.createWorkspace}
      titleId="create-workspace-dialog-title"
      closeLabel={copy.accessibility.closeDialog}
      onClose={onClose}
    >
      <form className="dialog-form" onSubmit={onSubmit}>
        <label className="settings-field">
          <span>{copy.workspace.currentWorker}</span>
          <input readOnly value={workerLabel} />
        </label>
        <label className="settings-field">
          <span>{copy.create.projectName}</span>
          <input
            className="newproj-name"
            aria-label={copy.create.projectName}
            data-testid="new-project-name"
            placeholder={placeholder}
            value={workspaceTitle}
            onChange={event => onTitleChange(event.target.value)}
          />
        </label>
        <div className="dialog-actions">
          <button type="button" className="ghost" onClick={onClose}>{copy.accessibility.closeDialog}</button>
          <button className="primary" data-testid="create-project" type="submit" disabled={!workspaceTitle.trim() || submitting}>
            <Plus aria-hidden="true" size={13} />
            <span>{copy.workspace.createWorkspace}</span>
          </button>
        </div>
      </form>
    </CreationDialog>
  )
}
