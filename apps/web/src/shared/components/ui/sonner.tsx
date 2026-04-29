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
            'group toast group-[.toaster]:rounded-md group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-card',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton:
            'group-[.toast]:border group-[.toast]:border-primary group-[.toast]:bg-transparent group-[.toast]:font-bold group-[.toast]:text-foreground',
          cancelButton:
            'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  )
}
