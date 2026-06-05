export type AssignmentStatus = 'draft' | 'provisioning' | 'checked_in' | 'access_ready' | 'ready' | 'needs_attention' | 'revoked' | 'archived'

export interface AssignmentView {
  assignedEmail: string
  assignmentId: string
  serverRef: string
  soulReleaseRef: string
  status: AssignmentStatus
  revokedAt?: string | null
  workerId?: string | null
  workbenchUrl?: string | null
}

export interface AuthenticatedUser {
  email: string
}

const allowedTransitions: Record<AssignmentStatus, AssignmentStatus[]> = {
  access_ready: ['ready', 'needs_attention', 'revoked', 'archived'],
  archived: [],
  checked_in: ['access_ready', 'needs_attention', 'revoked', 'archived'],
  draft: ['provisioning', 'archived'],
  needs_attention: ['provisioning', 'revoked', 'archived'],
  provisioning: ['checked_in', 'needs_attention', 'revoked', 'archived'],
  ready: ['needs_attention', 'revoked', 'archived'],
  revoked: ['archived'],
}

export function normalizeAssignedEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function createAssignmentView(input: AssignmentView): AssignmentView {
  return { ...input, assignedEmail: normalizeAssignedEmail(input.assignedEmail) }
}

export function canAdvanceAssignment(from: AssignmentStatus, to: AssignmentStatus): boolean {
  return allowedTransitions[from].includes(to)
}

export function userCanOpenWorker(user: AuthenticatedUser, assignment: AssignmentView): boolean {
  if (assignment.revokedAt)
    return false
  if (assignment.status !== 'ready')
    return false
  return normalizeAssignedEmail(user.email) === assignment.assignedEmail
}
