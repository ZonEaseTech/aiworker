import type { ReactNode } from 'react'

export function WorkbenchSectionTitle({ detail, icon, title }: { detail: string, icon: ReactNode, title: string }) {
  return (
    <div className="workbench-section-title">
      <span className="workbench-section-icon" aria-hidden="true">{icon}</span>
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
    </div>
  )
}
