import { cn } from '#lib/utils'
import { ScrollArea as ScrollAreaPrimitive } from 'radix-ui'

import * as React from 'react'

type ScrollAreaViewportProps = React.HTMLAttributes<HTMLDivElement> & {
  [key: `data-${string}`]: string | undefined
}

function ScrollArea({
  className,
  children,
  overlay,
  viewportClassName,
  viewportProps,
  viewportRef,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root> & {
  overlay?: React.ReactNode
  viewportClassName?: string
  viewportProps?: ScrollAreaViewportProps
  viewportRef?: React.Ref<HTMLDivElement>
}) {
  const { className: viewportPropsClassName, ...restViewportProps } = viewportProps ?? {}

  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn('relative', className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        ref={viewportRef}
        data-slot="scroll-area-viewport"
        className={cn(
          'size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1',
          viewportClassName,
          viewportPropsClassName,
        )}
        {...restViewportProps}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      {overlay}
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

function ScrollBar({
  className,
  orientation = 'vertical',
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        'flex touch-none p-px transition-colors select-none data-horizontal:h-2.5 data-horizontal:flex-col data-horizontal:border-t data-horizontal:border-t-transparent data-vertical:h-full data-vertical:w-2.5 data-vertical:border-l data-vertical:border-l-transparent',
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-border"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  )
}

export { ScrollArea, ScrollBar }
