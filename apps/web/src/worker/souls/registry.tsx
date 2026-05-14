import type { ComponentType, LazyExoticComponent } from 'react'
import type { SoulWorkbenchContext, SoulWorkbenchRendererProps } from './types'

import { lazy, Suspense } from 'react'

type LazySoulWorkbenchRenderer = LazyExoticComponent<ComponentType<SoulWorkbenchRendererProps>>

const specializedWorkbenchRenderers: Record<string, LazySoulWorkbenchRenderer> = {
  'hr-people-workbench': lazy(() => import('./hr/people-workbench').then(module => ({ default: module.HrPeopleWorkbench }))),
}

export function SoulWorkbenchRenderer({ context }: { context: SoulWorkbenchContext }) {
  const Renderer = specializedWorkbenchRenderers[context.workbench.id]
  return Renderer
    ? (
        <Suspense fallback={null}>
          <Renderer context={context} />
        </Suspense>
      )
    : null
}
