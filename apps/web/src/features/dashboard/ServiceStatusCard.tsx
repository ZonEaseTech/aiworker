import type { ServiceHealth, ServiceStatus } from './types'
import type { BadgeVariantProps } from '@/components/ui/badge-variants'
import { RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface ServiceStatusCardProps {
  name: string
  health: ServiceHealth | undefined
  isLoading: boolean
  isFetching: boolean
  onCheck: () => void
}

const STATUS_VARIANT: Record<ServiceStatus, BadgeVariantProps['variant']> = {
  ok: 'success',
  degraded: 'warning',
  down: 'destructive',
}

export function ServiceStatusCard({ name, health, isLoading, isFetching, onCheck }: ServiceStatusCardProps) {
  const status = health?.status
  return (
    <Card className="flex-1">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-base">{name}</CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={onCheck}
          disabled={isFetching}
        >
          <RefreshCw className={isFetching ? 'animate-spin' : ''} />
          Check
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          {isLoading
            ? <Badge variant="outline">loading...</Badge>
            : status
              ? <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>
              : <Badge variant="destructive">unreachable</Badge>}
          {health?.latency != null && (
            <span className="text-sm text-muted-foreground">
              {health.latency}
              {' '}
              ms
            </span>
          )}
        </div>
        {health?.error && (
          <p className="text-xs text-destructive">{health.error}</p>
        )}
      </CardContent>
    </Card>
  )
}
