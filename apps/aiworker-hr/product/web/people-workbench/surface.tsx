import type { HrPeopleWorkbenchAppProps, HrRouteProfile } from './app'

import { HrPeopleWorkbenchApp } from './app'

export type HrPeopleWorkbenchSurfaceProps = HrPeopleWorkbenchAppProps
export type { HrRouteProfile }

export function HrPeopleWorkbenchSurface(props: HrPeopleWorkbenchSurfaceProps = {}) {
  return (
    <div data-slot="hr-route-surface-root" data-hr-child-route="/hr" className="h-full min-h-0">
      <HrPeopleWorkbenchApp {...props} />
    </div>
  )
}
