/** Where a skill binding originates — Brain-hosted or a worker-local declarative skill. */
export type SkillBindingSource = 'brain' | 'local'

/**
 * A worker's enable/disable decision for a single skill, along with optional
 * per-skill config and ordering priority. Replaces the old "top N brain skills"
 * system prompt assembly.
 */
export interface WorkerSkillBinding {
  id: number
  source: SkillBindingSource
  /** `id` of the `BrainSourceConfig` the skill came from, when `source === 'brain'`. */
  brainName?: string
  skillName: string
  enabled: boolean
  priority: number
  config?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}
