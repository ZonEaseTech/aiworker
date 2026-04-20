import type { ConflictRecord, SkillDiffEntry, SyncDirection, SyncResult } from './sync'
import type { Skill } from './types'

import { join } from 'node:path'

import { scanSkills } from '../../adapters/hermes/fs-scanner'
import { scanOpenClawSkills } from '../../adapters/openclaw'
import { config } from '../../config'
import { getDb } from '../../db'
import { diffSkillSets, getConflicts as getConflictsFromDb, performSync, resolveConflict as resolveConflictInDb } from './sync'

function hermesSkillsDir(): string {
  return join(config.HERMES_HOME, 'skills')
}

function openclawSkillsDir(): string {
  return join(config.OPENCLAW_HOME, 'skills')
}

export async function listSkills(): Promise<{ skills: Skill[], total: number }> {
  const [hermesSkills, openclawSkills] = await Promise.all([
    scanSkills(config.HERMES_HOME),
    scanOpenClawSkills(config.OPENCLAW_HOME),
  ])

  const skills: Skill[] = [
    ...hermesSkills.map(s => ({
      id: `hermes-${s.name}`,
      name: s.name,
      description: s.description,
      version: s.version,
      capabilities: s.capabilities,
      source: 'hermes' as const,
    })),
    ...openclawSkills.map(s => ({
      id: `openclaw-${s.name}`,
      name: s.name,
      description: s.description,
      version: s.version,
      capabilities: s.capabilities,
      source: 'openclaw' as const,
    })),
  ]

  return { skills, total: skills.length }
}

export async function getSkill(name: string): Promise<Skill | null> {
  const [hermesSkills, openclawSkills] = await Promise.all([
    scanSkills(config.HERMES_HOME),
    scanOpenClawSkills(config.OPENCLAW_HOME),
  ])

  const hermes = hermesSkills.find(s => s.name === name)
  if (hermes) {
    return {
      id: `hermes-${hermes.name}`,
      name: hermes.name,
      description: hermes.description,
      version: hermes.version,
      capabilities: hermes.capabilities,
      source: 'hermes',
    }
  }

  const openclaw = openclawSkills.find(s => s.name === name)
  if (openclaw) {
    return {
      id: `openclaw-${openclaw.name}`,
      name: openclaw.name,
      description: openclaw.description,
      version: openclaw.version,
      capabilities: openclaw.capabilities,
      source: 'openclaw',
    }
  }

  return null
}

export async function diffSkills(): Promise<SkillDiffEntry[]> {
  const [hermesSkills, openclawSkills] = await Promise.all([
    scanSkills(config.HERMES_HOME),
    scanOpenClawSkills(config.OPENCLAW_HOME),
  ])

  return diffSkillSets(hermesSkills, openclawSkills)
}

export async function syncSkills(direction: SyncDirection = 'bidirectional'): Promise<SyncResult> {
  const [hermesSkills, openclawSkills] = await Promise.all([
    scanSkills(config.HERMES_HOME),
    scanOpenClawSkills(config.OPENCLAW_HOME),
  ])

  const db = getDb()
  return performSync(
    direction,
    hermesSkills,
    openclawSkills,
    hermesSkillsDir(),
    openclawSkillsDir(),
    db,
  )
}

export async function getConflicts(): Promise<ConflictRecord[]> {
  const db = getDb()
  return getConflictsFromDb(db)
}

export async function resolveConflict(id: number, resolution: 'hermes' | 'openclaw' | 'manual'): Promise<ConflictRecord | null> {
  const db = getDb()
  return resolveConflictInDb(db, id, resolution)
}
