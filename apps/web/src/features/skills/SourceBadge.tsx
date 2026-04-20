import type { SkillSource } from './types'
import { Badge } from '@/components/ui/badge'

const LABELS: Record<SkillSource, string> = {
  brain: 'Brain',
  executor: 'Executor',
  local: 'Local',
}

const CLASSES: Record<SkillSource, string> = {
  brain: 'border-transparent bg-sky-500/15 text-sky-700 dark:text-sky-400',
  executor: 'border-transparent bg-violet-500/15 text-violet-700 dark:text-violet-400',
  local: 'border-transparent bg-slate-500/15 text-slate-700 dark:text-slate-300',
}

export function SourceBadge({ source }: { source: SkillSource }) {
  return <Badge className={CLASSES[source]}>{LABELS[source]}</Badge>
}
