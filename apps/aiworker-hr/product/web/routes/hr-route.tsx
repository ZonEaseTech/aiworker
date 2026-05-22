import type { HrPeopleWorkbenchSurfaceProps, HrRouteProfile } from '../people-workbench'

import { HrPeopleWorkbenchSurface } from '../people-workbench'

export const routeId = 'hr-home'
export type { HrRouteProfile }
export type HrHomeRouteSurfaceProps = HrPeopleWorkbenchSurfaceProps

export function HrHomeRouteSurface(props: HrHomeRouteSurfaceProps = {}) {
  return <HrPeopleWorkbenchSurface {...props} title="HR People Workbench" />
}
