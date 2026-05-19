import type { ReactNode } from 'react'

import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { useState } from 'react'

import { cx } from '../utils/cx'

export type SelectSide = 'bottom' | 'left' | 'right' | 'top'

export interface SelectOption {
  description?: ReactNode
  label: ReactNode
  value: string
}

export interface SelectProps {
  ariaLabel: string
  className?: string
  contentClassName?: string
  label: string
  onChange: (value: string) => void
  options: SelectOption[]
  side?: SelectSide
  value: string
}

export function Select({
  ariaLabel,
  className,
  contentClassName,
  label,
  onChange,
  options,
  side,
  value,
}: SelectProps) {
  const [open, setOpen] = useState(false)
  const selectedIndex = Math.max(0, options.findIndex(option => option.value === value))
  const selected = options[selectedIndex]

  return (
    <SelectPrimitive.Root value={value} open={open} onOpenChange={setOpen} onValueChange={onChange}>
      <div className={cx('studio-select', open && 'open', side && `side-${side}`, className)}>
        <SelectPrimitive.Trigger className="studio-select-trigger" aria-label={ariaLabel}>
          <span className="sr-only">{label}</span>
          <span className="studio-select-copy">
            <strong>{selected?.label ?? ''}</strong>
            {selected?.description ? <small>{selected.description}</small> : null}
          </span>
          <SelectPrimitive.Icon asChild>
            <ChevronDown aria-hidden="true" className="studio-select-chevron" size={16} />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            className={cx('studio-select-list', contentClassName)}
            align="start"
            aria-label={label}
            position="popper"
            side={side}
            sideOffset={-1}
          >
            <SelectPrimitive.Viewport className="studio-select-viewport">
              {options.map(option => (
                <SelectPrimitive.Item
                  key={option.value}
                  className={cx('studio-select-option', option.value === value && 'active')}
                  value={option.value}
                >
                  <SelectPrimitive.ItemText asChild>
                    <span className="studio-select-copy">
                      <strong>{option.label}</strong>
                      {option.description ? <small>{option.description}</small> : null}
                    </span>
                  </SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator asChild>
                    <Check aria-hidden="true" size={14} />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </div>
    </SelectPrimitive.Root>
  )
}
