export type BuiltinToolsetRisk = 'low' | 'medium' | 'high'

export interface BuiltinToolsetDefinition {
  description: string
  risk: BuiltinToolsetRisk
}

export interface BuiltinCapabilityPackDefinition {
  description: string
}

export const BUILTIN_TOOLSETS: Record<string, BuiltinToolsetDefinition> = {
  'browser-smoke': {
    description: 'Browser smoke checks for UI flows.',
    risk: 'medium',
  },
  'calendar-draft': {
    description: 'Draft calendar events or scheduling proposals without sending.',
    risk: 'low',
  },
  'candidate-draft': {
    description: 'Draft candidate notes and recruiting process artifacts.',
    risk: 'low',
  },
  'design-review': {
    description: 'Review product UI, interaction states, and design-system usage.',
    risk: 'low',
  },
  'filesystem-read': {
    description: 'Read project files and local context.',
    risk: 'low',
  },
  'filesystem-write': {
    description: 'Write project files.',
    risk: 'high',
  },
  'git': {
    description: 'Inspect and prepare git changes.',
    risk: 'high',
  },
  'knowledge-search': {
    description: 'Search project knowledge bases.',
    risk: 'low',
  },
  'logs': {
    description: 'Read runtime logs.',
    risk: 'medium',
  },
  'network-diagnostics': {
    description: 'Inspect network and service reachability.',
    risk: 'medium',
  },
  'note-draft': {
    description: 'Draft notes or summaries.',
    risk: 'low',
  },
  'reporting': {
    description: 'Prepare operational reports.',
    risk: 'low',
  },
  'shell': {
    description: 'Run local shell commands.',
    risk: 'high',
  },
  'spreadsheet-draft': {
    description: 'Draft spreadsheet analysis and reports.',
    risk: 'low',
  },
  'task-tracking': {
    description: 'Draft task updates and status reports.',
    risk: 'low',
  },
  'test': {
    description: 'Run project test and quality gates.',
    risk: 'medium',
  },
  'ticket-draft': {
    description: 'Draft support tickets and customer-facing replies.',
    risk: 'low',
  },
}

export const BUILTIN_CAPABILITY_PACKS: Record<string, BuiltinCapabilityPackDefinition> = {
  'audit': { description: 'Audit evidence and traceability support.' },
  'code': { description: 'Code implementation and debugging support.' },
  'coordination': { description: 'Cross-person coordination and handoff support.' },
  'design-system': { description: 'Design-system consistency support.' },
  'finance': { description: 'Finance operations assistance.' },
  'general': { description: 'General project assistant capabilities.' },
  'hr-ops': { description: 'HR operations workflow support.' },
  'incident-response': { description: 'Incident response and runbook support.' },
  'interview': { description: 'Interview preparation and evaluation support.' },
  'knowledge-base': { description: 'Knowledge-base lookup and drafting support.' },
  'monitoring': { description: 'Monitoring and observability support.' },
  'ops': { description: 'Operations and deployment support.' },
  'planning': { description: 'Planning and task decomposition support.' },
  'product': { description: 'Product discovery and specification support.' },
  'qa': { description: 'QA planning and verification support.' },
  'reconciliation': { description: 'Reconciliation and mismatch analysis support.' },
  'recruiting': { description: 'Recruiting process support.' },
  'regression': { description: 'Regression analysis and test planning support.' },
  'release-gates': { description: 'Release gate verification support.' },
  'reporting': { description: 'Progress and operational reporting support.' },
  'repo-maintenance': { description: 'Repository maintenance support.' },
  'review': { description: 'Code and artifact review support.' },
  'support': { description: 'Support triage and response support.' },
  'triage': { description: 'Issue triage support.' },
  'ux': { description: 'UX workflow and interface review support.' },
}

export function isBuiltinCapabilityPack(id: string): boolean {
  return Object.hasOwn(BUILTIN_CAPABILITY_PACKS, id)
}

export function isBuiltinToolset(id: string): boolean {
  return Object.hasOwn(BUILTIN_TOOLSETS, id)
}

export function builtinToolsetRisk(id: string): BuiltinToolsetRisk | undefined {
  return BUILTIN_TOOLSETS[id]?.risk
}
