import type { ComponentPropsWithoutRef } from 'react'

import * as SwitchPrimitive from '@radix-ui/react-switch'

import { cx } from '../utils/cx'

export interface SwitchProps extends ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> {
  label?: string
}

export function Switch({ className, label, ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      {...props}
      aria-label={props['aria-label'] ?? label}
      className={cx('ui-switch', className)}
    >
      <SwitchPrimitive.Thumb className="ui-switch-thumb" />
    </SwitchPrimitive.Root>
  )
}
