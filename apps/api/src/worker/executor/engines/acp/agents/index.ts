import type { AcpAgentDefinition, AcpAgentId } from './types'
import { geminiAgent } from './gemini'
import { qwenAgent } from './qwen'

/**
 * Data-driven ACP agent registry. Adding a new ACP-speaking CLI (Copilot /
 * Aider / Amp / ...) is a pure data operation — drop a new declaration under
 * `agents/`, register it here, and extend the `agent` discriminator in the
 * shared `ExecutorConfig`. The harness does not branch on agent identity.
 */
const REGISTRY: Record<AcpAgentId, AcpAgentDefinition> = {
  gemini: geminiAgent,
  qwen: qwenAgent,
}

export function getAcpAgent(id: AcpAgentId): AcpAgentDefinition {
  const agent = REGISTRY[id]
  if (!agent)
    throw new Error(`unknown ACP agent: ${id}`)
  return agent
}

export function listAcpAgents(): AcpAgentDefinition[] {
  return Object.values(REGISTRY)
}

export type { AcpAgentDefinition, AcpAgentId, AvailabilityInfo, AvailabilityStatus } from './types'
