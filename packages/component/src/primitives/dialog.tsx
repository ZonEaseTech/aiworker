import type { ReactNode } from 'react'

import * as DialogPrimitive from '@radix-ui/react-dialog'
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
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen)
          onClose()
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={cx('modal-backdrop', backdropClassName)} />
        <DialogPrimitive.Content
          aria-describedby={description ? `${titleId}-description` : undefined}
          aria-labelledby={titleId}
          className={cx('modal', dialogClassName)}
        >
          <DialogPrimitive.Close asChild>
            <Button variant="close" className={closeClassName} aria-label={closeLabel}>
              <X size={16} strokeWidth={2} />
            </Button>
          </DialogPrimitive.Close>
          <header className={cx('modal-head', headerClassName)}>
            <span className="kicker">{title}</span>
            <DialogPrimitive.Title asChild>
              <h2 id={titleId}>{title}</h2>
            </DialogPrimitive.Title>
            {description
              ? (
                  <DialogPrimitive.Description asChild>
                    <p id={`${titleId}-description`} className="subtitle">{description}</p>
                  </DialogPrimitive.Description>
                )
              : null}
          </header>
          <div className={bodyClassName}>
            {children}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
