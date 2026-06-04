import type { FormEvent, ReactNode } from 'react'
import type { messagesFor, normalizeLocale } from '../../i18n'
import type { VerticalSoul } from '../model-types'

import { Add01Icon, Cancel01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@zonease/aiworker-ui/components/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@zonease/aiworker-ui/components/dialog'
import { Field, FieldGroup, FieldLabel } from '@zonease/aiworker-ui/components/field'
import { Input } from '@zonease/aiworker-ui/components/input'
import { ItemContent, ItemDescription, ItemTitle } from '@zonease/aiworker-ui/components/item'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@zonease/aiworker-ui/components/select'
import { displaySoul } from '../../i18n'

type WorkerMessages = ReturnType<typeof messagesFor>

function CreateDialogShell({
  children,
  closeLabel,
  description,
  onClose,
  open,
  title,
}: {
  children: ReactNode
  closeLabel: string
  description: string
  onClose: () => void
  open: boolean
  title: string
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen)
          onClose()
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        showCloseButton={false}
      >
        <DialogHeader className="pr-8">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogClose asChild>
          <Button
            aria-label={closeLabel}
            className="absolute top-2 right-2"
            size="icon-sm"
            title={closeLabel}
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} aria-hidden="true" data-icon="inline-start" />
          </Button>
        </DialogClose>
        {children}
      </DialogContent>
    </Dialog>
  )
}

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
  const selectedSoul = availableSouls.find(soul => soul.id === selectedSoulId)
  const selectedSoulCopy = selectedSoul ? displaySoul(selectedSoul, locale) : null

  return (
    <CreateDialogShell
      description={copy.workspace.createWorkerHint}
      open={open}
      title={copy.workspace.createWorker}
      closeLabel={copy.accessibility.closeDialog}
      onClose={onClose}
    >
      <form onSubmit={onSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="create-worker-soul">{copy.create.soul}</FieldLabel>
            <Select
              disabled={availableSouls.length === 0}
              value={selectedSoulId}
              onValueChange={onSoulChange}
            >
              <SelectTrigger
                id="create-worker-soul"
                aria-label={copy.create.soul}
                className="w-full overflow-hidden"
              >
                <SelectValue placeholder={copy.create.soul}>
                  {selectedSoulCopy?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent
                align="start"
                aria-label={copy.create.soul}
                position="popper"
              >
                <SelectGroup>
                  {availableSouls.map((soul) => {
                    const soulCopy = displaySoul(soul, locale)

                    return (
                      <SelectItem key={soul.id} value={soul.id}>
                        <ItemContent asChild className="min-w-0 gap-0.5">
                          <span>
                            <ItemTitle asChild>
                              <span>{soulCopy.name}</span>
                            </ItemTitle>
                            <ItemDescription asChild>
                              <span>{soulCopy.description}</span>
                            </ItemDescription>
                          </span>
                        </ItemContent>
                      </SelectItem>
                    )
                  })}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="create-worker-name">{copy.workspace.workerName}</FieldLabel>
            <Input
              id="create-worker-name"
              aria-label={copy.workspace.workerName}
              placeholder={copy.workspace.workerName}
              value={workerName}
              onChange={event => onNameChange(event.target.value)}
            />
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">{copy.accessibility.closeDialog}</Button>
            </DialogClose>
            <Button type="submit" disabled={!workerName.trim() || availableSouls.length === 0}>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} aria-hidden="true" data-icon="inline-start" />
              {copy.workspace.createWorker}
            </Button>
          </DialogFooter>
        </FieldGroup>
      </form>
    </CreateDialogShell>
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
    <CreateDialogShell
      description={copy.workspace.createWorkspaceHint}
      open={open}
      title={copy.workspace.createWorkspace}
      closeLabel={copy.accessibility.closeDialog}
      onClose={onClose}
    >
      <form onSubmit={onSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="create-workspace-worker">{copy.workspace.currentWorker}</FieldLabel>
            <Input
              id="create-workspace-worker"
              readOnly
              value={workerLabel}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="create-workspace-name">{copy.create.projectName}</FieldLabel>
            <Input
              id="create-workspace-name"
              aria-label={copy.create.projectName}
              data-testid="new-project-name"
              placeholder={placeholder}
              value={workspaceTitle}
              onChange={event => onTitleChange(event.target.value)}
            />
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">{copy.accessibility.closeDialog}</Button>
            </DialogClose>
            <Button data-testid="create-project" type="submit" disabled={!workspaceTitle.trim() || submitting}>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} aria-hidden="true" data-icon="inline-start" />
              {copy.workspace.createWorkspace}
            </Button>
          </DialogFooter>
        </FieldGroup>
      </form>
    </CreateDialogShell>
  )
}
