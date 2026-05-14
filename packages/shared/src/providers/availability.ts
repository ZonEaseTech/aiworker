/**
 * Engine kinds the Host can probe for local session handoff.
 */
export type EngineKind = 'http' | 'mcp' | 'cli' | 'claude-code' | 'acp' | 'codex' | 'cursor'

/**
 * Engine availability shape shared by the local daemon API and Worker Web
 * picker.
 *
 * 三态语义：
 * - `ready`          PATH 命中 CLI 且 auth 文件存在
 * - `login-required` PATH 命中但 auth 文件缺失（"installed but not logged in"）
 * - `not-found`      PATH 未命中 CLI（对于 http / mcp / cli 不适用 —— 它们恒为 ready）
 *
 * 探测只读文件元数据，不读取内容、不 spawn CLI，因此绝不会把 secret 暴露到
 * 响应或日志中。详见 `apps/api/src/worker/executor/availability.ts`。
 */
export type EngineAvailabilityStatus = 'ready' | 'login-required' | 'not-found'

export interface EngineAvailability {
  kind: EngineKind
  /** 仅 `acp` 有多个 agent（gemini / qwen），其他引擎省略。 */
  agent?: string
  status: EngineAvailabilityStatus
  binaryPath?: string
  /** 短标签：`auth-file-present` / `auth-file-missing` / `binary-not-on-path` / `no-cli-required`。 */
  authHint?: string
  checkedAt: string
}

/** Wire shape of `GET /api/worker/engines`. */
export interface EngineAvailabilityResponse {
  engines: EngineAvailability[]
}
