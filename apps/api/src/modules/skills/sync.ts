import type { HermesSkill } from '../../adapters/hermes/types'
import type { OpenClawSkill } from '../../adapters/openclaw'
import type { AppDatabase } from '../../db'

import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

import { eq } from 'drizzle-orm'

import { skillConflicts, syncEvents } from '../../db/schema'

export type SyncDirection = 'hermes-to-openclaw' | 'openclaw-to-hermes' | 'bidirectional'

export interface SkillDiffEntry {
  name: string
  status: 'added-hermes' | 'added-openclaw' | 'modified' | 'identical'
  hermesHash?: string
  openclawHash?: string
}

export interface SyncResult {
  synced: number
  conflicts: number
  errors: string[]
}

export interface ConflictRecord {
  id: number
  skillName: string
  hermesHash: string
  openclawHash: string
  resolution: 'pending' | 'hermes' | 'openclaw' | 'manual'
  createdAt: string
}

export function diffSkillSets(
  hermesSkills: HermesSkill[],
  openclawSkills: OpenClawSkill[],
): SkillDiffEntry[] {
  const hermesMap = new Map(hermesSkills.map(s => [s.name, s]))
  const openclawMap = new Map(openclawSkills.map(s => [s.name, s]))
  const allNames = new Set([...hermesMap.keys(), ...openclawMap.keys()])

  const diff: SkillDiffEntry[] = []

  for (const name of allNames) {
    const hermes = hermesMap.get(name)
    const openclaw = openclawMap.get(name)

    if (hermes && !openclaw) {
      diff.push({ name, status: 'added-hermes', hermesHash: hermes.hash })
    }
    else if (!hermes && openclaw) {
      diff.push({ name, status: 'added-openclaw', openclawHash: openclaw.hash })
    }
    else if (hermes && openclaw) {
      if (hermes.hash === openclaw.hash) {
        diff.push({ name, status: 'identical', hermesHash: hermes.hash, openclawHash: openclaw.hash })
      }
      else {
        diff.push({ name, status: 'modified', hermesHash: hermes.hash, openclawHash: openclaw.hash })
      }
    }
  }

  return diff
}

async function copySkillFile(sourcePath: string, targetDir: string, relativeName: string): Promise<void> {
  const sourceFile = Bun.file(sourcePath)
  const content = await sourceFile.arrayBuffer()
  const targetPath = `${targetDir}/${relativeName}`
  await mkdir(dirname(targetPath), { recursive: true })
  await Bun.write(targetPath, content)
}

function getRelativeName(filePath: string): string {
  // Extract the part after /skills/ in the path
  const idx = filePath.indexOf('/skills/')
  if (idx === -1)
    return filePath.split('/').pop() ?? 'unknown'
  return filePath.slice(idx + '/skills/'.length)
}

export async function performSync(
  direction: SyncDirection,
  hermesSkills: HermesSkill[],
  openclawSkills: OpenClawSkill[],
  hermesSkillsDir: string,
  openclawSkillsDir: string,
  db: AppDatabase,
): Promise<SyncResult> {
  const diff = diffSkillSets(hermesSkills, openclawSkills)
  const result: SyncResult = { synced: 0, conflicts: 0, errors: [] }

  for (const entry of diff) {
    try {
      if (entry.status === 'identical')
        continue

      if (entry.status === 'modified') {
        // Conflict: same skill, different content
        await db.insert(skillConflicts).values({
          skillName: entry.name,
          hermesHash: entry.hermesHash!,
          openclawHash: entry.openclawHash!,
          resolution: 'pending',
        })
        result.conflicts++
        continue
      }

      if (entry.status === 'added-hermes' && (direction === 'hermes-to-openclaw' || direction === 'bidirectional')) {
        const skill = hermesSkills.find(s => s.name === entry.name)
        if (skill) {
          const relativeName = getRelativeName(skill.filePath)
          await copySkillFile(skill.filePath, openclawSkillsDir, relativeName)
          result.synced++
        }
      }

      if (entry.status === 'added-openclaw' && (direction === 'openclaw-to-hermes' || direction === 'bidirectional')) {
        const skill = openclawSkills.find(s => s.name === entry.name)
        if (skill) {
          const relativeName = getRelativeName(skill.filePath)
          await copySkillFile(skill.filePath, hermesSkillsDir, relativeName)
          result.synced++
        }
      }
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      result.errors.push(`Failed to sync skill '${entry.name}': ${message}`)
    }
  }

  // Record sync event
  await db.insert(syncEvents).values({
    type: 'skill-sync',
    source: direction.includes('hermes') ? 'hermes' : 'bidirectional',
    target: direction.includes('openclaw') ? 'openclaw' : 'bidirectional',
    status: result.errors.length > 0 ? 'completed' : 'completed',
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
  resolution: 'hermes' | 'openclaw' | 'manual',
): Promise<ConflictRecord | null> {
  const result = await db
    .update(skillConflicts)
    .set({ resolution })
    .where(eq(skillConflicts.id, id))
    .returning()

  return (result[0] as ConflictRecord) ?? null
}
