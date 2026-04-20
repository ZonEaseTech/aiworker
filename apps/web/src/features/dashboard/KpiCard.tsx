import type { LucideIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

interface KpiCardProps {
  title: string
  value: string | number | undefined
  hint?: string
  icon: LucideIcon
  isLoading?: boolean
  tone?: 'default' | 'warning'
}

export function KpiCard({ title, value, hint, icon: Icon, isLoading, tone = 'default' }: KpiCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={tone === 'warning' ? 'size-4 text-amber-500' : 'size-4 text-muted-foreground'} />
      </CardHeader>
      <CardContent>
        {isLoading
          ? <Skeleton className="h-7 w-20" />
          : <div className="text-2xl font-semibold">{value ?? '-'}</div>}
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}
