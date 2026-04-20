import type { BrainSkill, ExecutorTool } from '@aiworker/shared'

import type { ConflictRecord, SkillDiffEntry, SyncDirection, SyncResult } from './sync'
import type { Skill } from './types'

import { getDb } from '../../db'
import { getBrainProvider, getExecutorProvider } from '../../providers'
import { diffSkillSets, getConflicts as getConflictsFromDb, performSync, resolveConflict as resolveConflictInDb } from './sync'

function executorToolToSkill(tool: ExecutorTool): BrainSkill {
  return {
    id: tool.name,
    name: tool.name,
    description: tool.description,
    version: '0',
    tags: [],
  }
}

async function getExecutorSkills(): Promise<BrainSkill[]> {
  const tools = await getExecutorProvider().listTools()
  return tools.map(executorToolToSkill)
}

function toApiSkill(skill: BrainSkill, source: 'brain' | 'executor'): Skill {
  return {
    id: `${source}-${skill.name}`,
    name: skill.name,
    description: skill.description,
    version: skill.version,
    capabilities: skill.tags ?? [],
    source,
  }
}

export async function listSkills(): Promise<{ skills: Skill[], total: number }> {
  const [brainSkills, executorSkills] = await Promise.all([
    getBrainProvider().listSkills(),
    getExecutorSkills(),
  ])

  const skills: Skill[] = [
    ...brainSkills.map(s => toApiSkill(s, 'brain')),
    ...executorSkills.map(s => toApiSkill(s, 'executor')),
  ]

  return { skills, total: skills.length }
}

export async function getSkill(name: string): Promise<Skill | null> {
  const [brainSkills, executorSkills] = await Promise.all([
    getBrainProvider().listSkills(),
    getExecutorSkills(),
  ])

  const brain = brainSkills.find(s => s.name === name)
  if (brain)
    return toApiSkill(brain, 'brain')

  const executor = executorSkills.find(s => s.name === name)
  if (executor)
    return toApiSkill(executor, 'executor')

  return null
}

export async function diffSkills(): Promise<SkillDiffEntry[]> {
  const [brainSkills, executorSkills] = await Promise.all([
    getBrainProvider().listSkills(),
    getExecutorSkills(),
  ])

  return diffSkillSets(brainSkills, executorSkills)
}

export async function syncSkills(direction: SyncDirection = 'bidirectional'): Promise<SyncResult> {
  const [brainSkills, executorSkills] = await Promise.all([
    getBrainProvider().listSkills(),
    getExecutorSkills(),
  ])

  const db = getDb()
  return performSync(direction, brainSkills, executorSkills, db)
}

export async function getConflicts(): Promise<ConflictRecord[]> {
  const db = getDb()
  return getConflictsFromDb(db)
}

export async function resolveConflict(id: number, resolution: 'brain' | 'executor' | 'manual'): Promise<ConflictRecord | null> {
  const db = getDb()
  return resolveConflictInDb(db, id, resolution)
}
