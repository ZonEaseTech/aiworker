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

export const widgetId = 'hr-people-widget'

export interface HrPeopleWidgetProofProps {
  badgeLabel?: string
  description?: string
  detail?: string
}

export function HrPeopleWidgetProof({
  badgeLabel = 'Shared UI',
  description = 'Shadcn proof for the HR Soul App Web surface.',
  detail = 'HR owns the profile meaning. The shared UI package owns the primitive surface.',
}: HrPeopleWidgetProofProps = {}) {
  return (
    <Card size="sm">
      <CardHeader>
        <ItemContent className="min-w-0">
          <CardTitle>People Profile</CardTitle>
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
