import type { ReactNode } from 'react'

import { X } from 'lucide-react'

import { cx } from '../utils/cx'
import { Button } from './button'

export interface DialogProps {
  backdropClassName?: string
  bodyClassName?: string
  children: ReactNode
  closeClassName?: string
  closeLabel: string
  description?: string
  dialogClassName?: string
  headerClassName?: string
  onClose: () => void
  open: boolean
  title: string
  titleId: string
}

export function Dialog({
  backdropClassName,
  bodyClassName,
  children,
  closeClassName,
  closeLabel,
  description,
  dialogClassName,
  headerClassName,
  onClose,
  open,
  title,
  titleId,
}: DialogProps) {
  if (!open)
    return null

  return (
    <div
      className={cx('modal-backdrop', backdropClassName)}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget)
          onClose()
      }}
    >
      <dialog className={cx('modal', dialogClassName)} open aria-modal="true" aria-labelledby={titleId} onCancel={onClose}>
        <Button variant="close" className={closeClassName} onClick={onClose} aria-label={closeLabel}>
          <X size={16} strokeWidth={2} />
        </Button>
        <header className={cx('modal-head', headerClassName)}>
          <span className="kicker">{title}</span>
          <h2 id={titleId}>{title}</h2>
          {description ? <p className="subtitle">{description}</p> : null}
        </header>
        <div className={bodyClassName}>
          {children}
        </div>
      </dialog>
    </div>
  )
}
