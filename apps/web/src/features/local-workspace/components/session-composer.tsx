import type { CapabilityTemplate, LocalWorkspace } from '@zonease/aiworker-shared'
import type { FormEvent } from 'react'
import type { messagesFor, normalizeLocale } from '../../i18n'

import { SessionComposer } from '@zonease/aiworker-component'
import { displayTemplate } from '../../i18n'

type WorkerMessages = ReturnType<typeof messagesFor>

export function WorkspaceSessionComposer({
  copy,
  engineReadiness,
  locale,
  onContextChange,
  onSubmit,
  onTemplateChange,
  selectedTemplate,
  submitting,
  templates,
  value,
  workspace,
}: {
  copy: WorkerMessages
  engineReadiness: { detail: string, ready: boolean }
  locale: ReturnType<typeof normalizeLocale>
  onContextChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onTemplateChange: (value: string) => void
  selectedTemplate: CapabilityTemplate
  submitting: boolean
  templates: CapabilityTemplate[]
  value: string
  workspace: LocalWorkspace
}) {
  const selectedTemplateCopy = displayTemplate(selectedTemplate, locale)
  return (
    <section className="workspace-session-composer" data-testid="new-session-panel">
      <h2 className="workspace-composer-title">{copy.workspace.createSessionPrompt(workspace.name)}</h2>
      <SessionComposer
        ariaLabel={copy.create.businessContext}
        className="workspace-composer-box"
        disabledReason={engineReadiness.ready ? undefined : engineReadiness.detail}
        placeholder={copy.workspace.createSessionPlaceholder}
        selectedTemplateId={selectedTemplate.id}
        submitAriaLabel={copy.workspace.createSession}
        submitDisabled={!engineReadiness.ready}
        submitting={submitting}
        templateLabel={copy.create.capabilityTemplate}
        templateOptions={templates.map((template) => {
          const templateCopy = displayTemplate(template, locale)
          return {
            description: template.outputKind,
            label: templateCopy.name,
            value: template.id,
          }
        })}
        value={value}
        variant="large"
        onSubmit={onSubmit}
        onTemplateChange={onTemplateChange}
        onValueChange={onContextChange}
      />
      <p className="workspace-composer-hint">{copy.workspace.createSessionHint(selectedTemplateCopy.name)}</p>
    </section>
  )
}
