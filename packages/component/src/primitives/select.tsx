import type { ReactNode } from 'react'

import { Check, ChevronDown } from 'lucide-react'
import { useId, useState } from 'react'

import { cx } from '../utils/cx'

export interface SelectOption {
  description?: ReactNode
  label: ReactNode
  value: string
}

export interface SelectProps {
  ariaLabel: string
  className?: string
  label: string
  onChange: (value: string) => void
  options: SelectOption[]
  value: string
}

export function Select({
  ariaLabel,
  className,
  label,
  onChange,
  options,
  value,
}: SelectProps) {
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
      className={cx('studio-select', open && 'open', className)}
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
                  className={cx('studio-select-option', option.value === value && 'active')}
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
