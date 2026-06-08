import type { hostAssignments } from './schema'

export type HostAssignmentRow = typeof hostAssignments.$inferSelect

export interface HostAssignmentStorageTestHooks {
  beforeConsumeUpdate?: (assignment: HostAssignmentRow, at: string) => void
}

export const hostAssignmentStorageTestHooks: { current: HostAssignmentStorageTestHooks | null } = {
  current: null,
}

export function setHostAssignmentStorageTestHooks(hooks: HostAssignmentStorageTestHooks | null): void {
  hostAssignmentStorageTestHooks.current = hooks
}
