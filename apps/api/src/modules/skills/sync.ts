import type { BrainSkill } from '@aiworker/shared'
import type { AppDatabase } from '../../db'

import { eq } from 'drizzle-orm'

import { skillConflicts, syncEvents } from '../../db/schema'

export type SyncDirection = 'brain-to-executor' | 'executor-to-brain' | 'bidirectional'

export interface SkillDiffEntry {
  name: string
  status: 'added-brain' | 'added-executor' | 'modified' | 'identical'
  brainHash?: string
  executorHash?: string
}

export interface SyncResult {
  synced: number
  conflicts: number
  errors: string[]
}

export interface ConflictRecord {
  id: number
  skillName: string
  brainHash: string
  executorHash: string
  resolution: 'pending' | 'brain' | 'executor' | 'manual'
  createdAt: string
}

function skillFingerprint(skill: BrainSkill): string {
  return skill.version || skill.id
}

export function diffSkillSets(
  brainSkills: BrainSkill[],
  executorSkills: BrainSkill[],
): SkillDiffEntry[] {
  const brainMap = new Map(brainSkills.map(s => [s.name, s]))
  const executorMap = new Map(executorSkills.map(s => [s.name, s]))
  const allNames = new Set([...brainMap.keys(), ...executorMap.keys()])

  const diff: SkillDiffEntry[] = []

  for (const name of allNames) {
    const brain = brainMap.get(name)
    const executor = executorMap.get(name)

    if (brain && !executor) {
      diff.push({ name, status: 'added-brain', brainHash: skillFingerprint(brain) })
    }
    else if (!brain && executor) {
      diff.push({ name, status: 'added-executor', executorHash: skillFingerprint(executor) })
    }
    else if (brain && executor) {
      const brainHash = skillFingerprint(brain)
      const executorHash = skillFingerprint(executor)
      const status = brainHash === executorHash ? 'identical' : 'modified'
      diff.push({ name, status, brainHash, executorHash })
    }
  }

  return diff
}

export async function performSync(
  direction: SyncDirection,
  brainSkills: BrainSkill[],
  executorSkills: BrainSkill[],
  db: AppDatabase,
): Promise<SyncResult> {
  const diff = diffSkillSets(brainSkills, executorSkills)
  const result: SyncResult = { synced: 0, conflicts: 0, errors: [] }

  for (const entry of diff) {
    if (entry.status === 'identical')
      continue

    if (entry.status === 'modified') {
      await db.insert(skillConflicts).values({
        skillName: entry.name,
        brainHash: entry.brainHash!,
        executorHash: entry.executorHash!,
        resolution: 'pending',
      })
      result.conflicts++
    }
  }

  await db.insert(syncEvents).values({
    type: 'skill-sync',
    source: direction.includes('brain') ? 'brain' : 'bidirectional',
    target: direction.includes('executor') ? 'executor' : 'bidirectional',
    status: 'completed',
    metadata: {
      direction,
      synced: result.synced,
      conflicts: result.conflicts,
      errors: result.errors,
    },
  })

  return result
}

export async function getConflicts(db: AppDatabase): Promise<ConflictRecord[]> {
  const rows = await db
    .select()
    .from(skillConflicts)
    .where(eq(skillConflicts.resolution, 'pending'))

  return rows as ConflictRecord[]
}

export async function resolveConflict(
  db: AppDatabase,
  id: number,
  resolution: 'brain' | 'executor' | 'manual',
): Promise<ConflictRecord | null> {
  const result = await db
    .update(skillConflicts)
    .set({ resolution })
    .where(eq(skillConflicts.id, id))
    .returning()

  return (result[0] as ConflictRecord) ?? null
}
