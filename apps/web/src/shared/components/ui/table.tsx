import type { ComponentProps } from 'react'
import { cn } from '@/shared/lib/utils'

interface TableProps extends ComponentProps<'table'> {
  containerClassName?: string
}

export function Table({ className, containerClassName, ...props }: TableProps) {
  return (
    <div className={cn('relative w-full overflow-auto rounded-sm border border-hairline bg-card', containerClassName)}>
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  )
}

export function TableHeader({ className, ...props }: ComponentProps<'thead'>) {
  return <thead className={cn('[&_tr]:border-b', className)} {...props} />
}

export function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return (
    <tr
      className={cn(
        'border-b border-hairline transition-colors hover:bg-soft-stone/60 data-[state=selected]:bg-soft-stone',
        className,
      )}
      {...props}
    />
  )
}

export function TableHead({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      className={cn(
        'h-11 bg-background px-4 text-left align-middle text-xs font-normal uppercase text-muted-foreground [&:has([role=checkbox])]:pr-0',
        className,
      )}
      {...props}
    />
  )
}

export function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return (
    <td
      className={cn('px-4 py-4 align-middle [&:has([role=checkbox])]:pr-0', className)}
      {...props}
    />
  )
}
