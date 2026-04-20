import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { AllSkillsTab } from '@/features/skills/AllSkillsTab'
import { ConflictsTab } from '@/features/skills/ConflictsTab'
import { DiffTab } from '@/features/skills/DiffTab'
import { cn } from '@/lib/utils'

type Tab = 'all' | 'diff' | 'conflicts'

const TABS: { id: Tab, label: string }[] = [
  { id: 'all', label: 'All Skills' },
  { id: 'diff', label: 'Diff' },
  { id: 'conflicts', label: 'Conflicts' },
]

function SkillsPage() {
  const [tab, setTab] = useState<Tab>('all')

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Skills</h1>
        <p className="text-sm text-muted-foreground">Manage skills synchronized between Hermes and OpenClaw.</p>
      </div>

      <div className="flex gap-1 border-b">
        {TABS.map(t => (
          <Button
            key={t.id}
            variant="ghost"
            size="sm"
            onClick={() => setTab(t.id)}
            className={cn(
              'rounded-none border-b-2 border-transparent px-3',
              tab === t.id && 'border-primary text-foreground',
            )}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {tab === 'all' && <AllSkillsTab />}
      {tab === 'diff' && <DiffTab />}
      {tab === 'conflicts' && <ConflictsTab />}
    </div>
  )
}

export const Route = createFileRoute('/skills')({
  component: SkillsPage,
})
