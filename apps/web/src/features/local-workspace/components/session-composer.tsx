import type { CapabilityTemplate, LocalWorkspace } from '@zonease/aiworker-shared'
import type { FormEvent } from 'react'
import type { messagesFor, normalizeLocale } from '../../i18n'

import { StudioSelect } from '@zonease/aiworker-component'
import { ArrowUp, Plus, Settings, ShieldCheck } from 'lucide-react'
import { displayTemplate } from '../../i18n'

type WorkerMessages = ReturnType<typeof messagesFor>

export function WorkspaceSessionComposer({
  copy,
  engineLabel,
  engineReadiness,
  locale,
  onContextChange,
  onOpenSettings,
  onSubmit,
  onTemplateChange,
  selectedTemplate,
  submitting,
  templates,
  value,
  workspace,
}: {
  copy: WorkerMessages
  engineLabel: string
  engineReadiness: { detail: string, ready: boolean }
  locale: ReturnType<typeof normalizeLocale>
  onContextChange: (value: string) => void
  onOpenSettings: () => void
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
      <form className="workspace-composer-box" onSubmit={onSubmit}>
        <textarea
          id="project-context"
          className="workspace-composer-input"
          aria-label={copy.create.businessContext}
          placeholder={copy.workspace.createSessionPlaceholder}
          value={value}
          onChange={event => onContextChange(event.target.value)}
        />

        {!engineReadiness.ready
          ? (
              <div className="inline-warning workspace-composer-warning" role="status">
                <ShieldCheck aria-hidden="true" size={14} />
                <span>{engineReadiness.detail}</span>
              </div>
            )
          : null}

        <div className="workspace-composer-toolbar">
          <div className="workspace-composer-tools">
            <span className="workspace-composer-tool-static" aria-hidden="true">
              <Plus size={18} />
            </span>
            <StudioSelect
              ariaLabel={copy.create.capabilityTemplate}
              className="workspace-composer-select"
              label={copy.create.capabilityTemplate}
              options={templates.map((template) => {
                const templateCopy = displayTemplate(template, locale)
                return {
                  description: template.outputKind,
                  label: templateCopy.name,
                  value: template.id,
                }
              })}
              value={selectedTemplate.id}
              onChange={onTemplateChange}
            />
            <button
              type="button"
              className="workspace-composer-engine"
              aria-label={copy.accessibility.openSettings}
              onClick={onOpenSettings}
            >
              <Settings aria-hidden="true" size={14} />
              <span>{engineLabel}</span>
            </button>
          </div>

          <button
            className="primary workspace-composer-submit"
            data-testid="create-session"
            type="submit"
            aria-label={copy.workspace.createSession}
            disabled={!value.trim() || submitting || !engineReadiness.ready}
          >
            <ArrowUp aria-hidden="true" size={18} />
          </button>
        </div>
      </form>
      <p className="workspace-composer-hint">{copy.workspace.createSessionHint(selectedTemplateCopy.name)}</p>
    </section>
  )
}
