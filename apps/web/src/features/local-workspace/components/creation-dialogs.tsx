import type { VerticalSoul } from '@zonease/aiworker-shared'
import type { FormEvent } from 'react'
import type { messagesFor, normalizeLocale } from '../../i18n'

import { Button, CreationDialog, Field, FieldGroup, StudioSelect } from '@zonease/aiworker-component'
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
        <FieldGroup label={copy.create.soul}>
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
        </FieldGroup>
        <Field label={copy.workspace.workerName}>
          <input
            className="newproj-name"
            aria-label={copy.workspace.workerName}
            placeholder={copy.workspace.workerName}
            value={workerName}
            onChange={event => onNameChange(event.target.value)}
          />
        </Field>
        <div className="dialog-actions">
          <Button variant="ghost" onClick={onClose}>{copy.accessibility.closeDialog}</Button>
          <Button variant="primary" type="submit" disabled={!workerName.trim() || availableSouls.length === 0}>
            <Plus aria-hidden="true" size={13} />
            <span>{copy.workspace.createWorker}</span>
          </Button>
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
        <Field label={copy.workspace.currentWorker}>
          <input readOnly value={workerLabel} />
        </Field>
        <Field label={copy.create.projectName}>
          <input
            className="newproj-name"
            aria-label={copy.create.projectName}
            data-testid="new-project-name"
            placeholder={placeholder}
            value={workspaceTitle}
            onChange={event => onTitleChange(event.target.value)}
          />
        </Field>
        <div className="dialog-actions">
          <Button variant="ghost" onClick={onClose}>{copy.accessibility.closeDialog}</Button>
          <Button variant="primary" data-testid="create-project" type="submit" disabled={!workspaceTitle.trim() || submitting}>
            <Plus aria-hidden="true" size={13} />
            <span>{copy.workspace.createWorkspace}</span>
          </Button>
        </div>
      </form>
    </CreationDialog>
  )
}
