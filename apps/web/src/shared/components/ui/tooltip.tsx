import type { ComponentProps } from 'react'
import { Tooltip as BaseTooltip } from '@base-ui-components/react/tooltip'
import { cn } from '@/shared/lib/utils'

export const TooltipProvider = BaseTooltip.Provider
export const Tooltip = BaseTooltip.Root
export const TooltipTrigger = BaseTooltip.Trigger

export function TooltipContent({ className, children, ...props }: ComponentProps<typeof BaseTooltip.Popup>) {
  return (
    <BaseTooltip.Portal>
      <BaseTooltip.Positioner sideOffset={6}>
        <BaseTooltip.Popup
          className={cn(
            'z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md',
            className,
          )}
          {...props}
        >
          {children}
        </BaseTooltip.Popup>
      </BaseTooltip.Positioner>
    </BaseTooltip.Portal>
  )
}
