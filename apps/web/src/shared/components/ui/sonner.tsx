import type { ComponentProps } from 'react'
import { Toaster as SonnerToaster } from 'sonner'
import { useThemeStore } from '@/shared/stores/theme'

type ToasterProps = ComponentProps<typeof SonnerToaster>

export function Toaster(props: ToasterProps) {
  const theme = useThemeStore(s => s.theme)
  return (
    <SonnerToaster
      theme={theme}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:rounded-sm group-[.toaster]:border-hairline group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:shadow-popover',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton:
            'group-[.toast]:rounded-pill group-[.toast]:border group-[.toast]:border-primary group-[.toast]:bg-primary group-[.toast]:font-medium group-[.toast]:text-primary-foreground',
          cancelButton:
            'group-[.toast]:bg-soft-stone group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  )
}
