import type { ReactNode } from 'react'

import { Dialog } from '../primitives/dialog'

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
  return (
    <Dialog
      backdropClassName="creation-dialog-backdrop"
      bodyClassName="creation-dialog-body"
      closeClassName="creation-dialog-close"
      closeLabel={closeLabel}
      description={description}
      dialogClassName="creation-dialog"
      headerClassName="creation-dialog-head"
      onClose={onClose}
      open={open}
      title={title}
      titleId={titleId}
    >
      {children}
    </Dialog>
  )
}
