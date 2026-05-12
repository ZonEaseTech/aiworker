import type { SoulWorkbenchDescriptor } from '@zonease/aiworker-shared'
import type { SoulWorkbenchRendererComponent } from './types'

import { HrPeopleWorkbench } from './hr/people-workbench'

const specializedWorkbenchRenderers: Record<string, SoulWorkbenchRendererComponent> = {
  'hr-people-workbench': HrPeopleWorkbench,
}

export function getSpecializedWorkbenchRenderer(workbench: SoulWorkbenchDescriptor): SoulWorkbenchRendererComponent | null {
  return specializedWorkbenchRenderers[workbench.id] ?? null
}

export function hasSpecializedWorkbenchRenderer(workbench: SoulWorkbenchDescriptor | null): boolean {
  return Boolean(workbench && getSpecializedWorkbenchRenderer(workbench))
}
