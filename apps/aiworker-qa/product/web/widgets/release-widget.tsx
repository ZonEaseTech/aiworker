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

export const widgetId = 'qa-release-widget'

export interface QaReleaseWidgetProofProps {
  badgeLabel?: string
  description?: string
  detail?: string
}

export function QaReleaseWidgetProof({
  badgeLabel = 'Shared UI',
  description = 'Shadcn proof for the QA Soul App Web surface.',
  detail = 'QA owns release verdict meaning. The shared UI package owns only primitive composition.',
}: QaReleaseWidgetProofProps = {}) {
  return (
    <Card size="sm">
      <CardHeader>
        <ItemContent className="min-w-0">
          <CardTitle>Release Readiness</CardTitle>
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
