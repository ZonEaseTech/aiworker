import type { ReactNode } from 'react'

import { Check, ChevronDown, X } from 'lucide-react'
import { useId, useState } from 'react'

export type WorkerStudioLayoutVariant = 'home' | 'session' | 'workspace'

export interface StudioSelectOption {
  description?: string
  label: string
  value: string
}

export function WorkerStudioLayout({
  appearance,
  detail,
  detailCollapsed = false,
  dialogs,
  main,
  mainLabel,
  resolvedTheme,
  sidebar,
  sidebarLabel,
  variant,
}: {
  appearance: string
  detail?: ReactNode
  detailCollapsed?: boolean
  dialogs?: ReactNode
  main: ReactNode
  mainLabel: string
  resolvedTheme: string
  sidebar: ReactNode
  sidebarLabel: string
  variant: WorkerStudioLayoutVariant
}) {
  const routeClass = variant === 'session' ? 'workspace-session-route has-artifact-rail' : variant === 'workspace' ? 'workspace-context-route' : 'workspace-home-route'
  return (
    <main className="entry-shell" data-appearance={appearance} data-theme={resolvedTheme} data-testid="worker-studio-shell">
      <div className={`entry workspace-entry ${routeClass}${variant === 'session' && detailCollapsed ? ' detail-drawer-collapsed' : ''}`}>
        <StudioSidebar label={sidebarLabel}>
          {sidebar}
        </StudioSidebar>
        <section className="entry-main workspace-column" aria-label={mainLabel}>
          {main}
        </section>
        {detail}
        {dialogs}
      </div>
    </main>
  )
}

function StudioSidebar({
  children,
  label,
}: {
  children: ReactNode
  label: string
}) {
  return (
    <aside className="entry-side soul-sidebar" aria-label={label}>
      {children}
    </aside>
  )
}

export function StudioMainFrame({
  actions,
  children,
  kicker,
  title,
}: {
  actions?: ReactNode
  children: ReactNode
  kicker: string
  title: string
}) {
  return (
    <>
      <header className="entry-header workspace-header">
        <div>
          <span className="kicker">{kicker}</span>
          <h1>{title}</h1>
        </div>
        {actions ? <div className="entry-header-right">{actions}</div> : null}
      </header>
      <div className="entry-tab-content workspace-content">
        {children}
      </div>
    </>
  )
}

export function CreationDialog({
  children,
  closeLabel,
  description,
  onClose,
  open,
  title,
  titleId,
}: {
  children: ReactNode
  closeLabel: string
  description: string
  onClose: () => void
  open: boolean
  title: string
  titleId: string
}) {
  if (!open)
    return null

  return (
    <div
      className="modal-backdrop creation-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget)
          onClose()
      }}
    >
      <dialog className="modal creation-dialog" open aria-modal="true" aria-labelledby={titleId} onCancel={onClose}>
        <button type="button" className="settings-close creation-dialog-close" onClick={onClose} aria-label={closeLabel}>
          <X size={16} strokeWidth={2} />
        </button>
        <header className="modal-head creation-dialog-head">
          <span className="kicker">{title}</span>
          <h2 id={titleId}>{title}</h2>
          <p className="subtitle">{description}</p>
        </header>
        <div className="creation-dialog-body">
          {children}
        </div>
      </dialog>
    </div>
  )
}

export function StudioSelect({
  ariaLabel,
  label,
  onChange,
  options,
  value,
}: {
  ariaLabel: string
  label: string
  onChange: (value: string) => void
  options: StudioSelectOption[]
  value: string
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const selectedIndex = Math.max(0, options.findIndex(option => option.value === value))
  const selected = options[selectedIndex]

  const choose = (nextValue: string) => {
    onChange(nextValue)
    setOpen(false)
  }

  const chooseByOffset = (offset: number) => {
    if (options.length === 0)
      return
    const nextIndex = (selectedIndex + offset + options.length) % options.length
    const next = options[nextIndex]
    if (!next)
      return
    onChange(next.value)
    setOpen(true)
  }

  return (
    <div
      className={`studio-select ${open ? 'open' : ''}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false)
      }}
    >
      <button
        type="button"
        id={`${id}-trigger`}
        className="studio-select-trigger"
        role="combobox"
        aria-label={ariaLabel}
        aria-controls={`${id}-listbox`}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen(current => !current)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false)
            return
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            chooseByOffset(1)
            return
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            chooseByOffset(-1)
            return
          }
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setOpen(current => !current)
          }
        }}
      >
        <span id={`${id}-label`} className="sr-only">{label}</span>
        <span className="studio-select-copy">
          <strong>{selected?.label ?? ''}</strong>
          {selected?.description ? <small>{selected.description}</small> : null}
        </span>
        <ChevronDown aria-hidden="true" className="studio-select-chevron" size={16} />
      </button>
      {open
        ? (
            <div id={`${id}-listbox`} className="studio-select-list" role="listbox" aria-label={label}>
              {options.map(option => (
                <button
                  key={option.value}
                  type="button"
                  className={`studio-select-option ${option.value === value ? 'active' : ''}`}
                  role="option"
                  aria-selected={option.value === value}
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => choose(option.value)}
                >
                  <span className="studio-select-copy">
                    <strong>{option.label}</strong>
                    {option.description ? <small>{option.description}</small> : null}
                  </span>
                  {option.value === value ? <Check aria-hidden="true" size={14} /> : null}
                </button>
              ))}
            </div>
          )
        : null}
    </div>
  )
}
