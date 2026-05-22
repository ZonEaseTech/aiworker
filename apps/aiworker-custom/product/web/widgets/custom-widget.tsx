import { Badge } from '@zonease/aiworker-ui/components/badge'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@zonease/aiworker-ui/components/card'
import { ItemContent } from '@zonease/aiworker-ui/components/item'

export const widgetId = 'custom-widget'

export interface CustomWidgetProofProps {
  badgeLabel?: string
  description?: string
  detail?: string
}

export function CustomWidgetProof({
  badgeLabel = 'Custom',
  description = 'AIWorker Custom Soul App.',
  detail = 'Free-form exploration workspace. Add skills, MCP clients, and entry files through Worker Configuration.',
}: CustomWidgetProofProps = {}) {
  return (
    <Card size="sm">
      <CardHeader>
        <ItemContent className="min-w-0">
          <CardTitle>AIWorker Custom</CardTitle>
          <CardDescription>{description}</CardDescription>
        </ItemContent>
        <CardAction>
          <Badge variant="secondary">{badgeLabel}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <CardDescription className="line-clamp-none">{detail}</CardDescription>
      </CardContent>
    </Card>
  )
}
