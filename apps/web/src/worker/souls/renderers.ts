import type { SoulWorkbenchDescriptor } from '@zonease/aiworker-shared'

const specializedWorkbenchIds = new Set(['hr-people-workbench'])

export function hasSpecializedWorkbenchRenderer(workbench: SoulWorkbenchDescriptor | null): boolean {
  return Boolean(workbench && specializedWorkbenchIds.has(workbench.id))
}
