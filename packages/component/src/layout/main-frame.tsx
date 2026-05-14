import type { ReactNode } from 'react'

import { Header } from '../primitives/header'

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
      <Header className="workspace-header" kicker={kicker} title={title} actions={actions} />
      <div className="entry-tab-content workspace-content">
        {children}
      </div>
    </>
  )
}
