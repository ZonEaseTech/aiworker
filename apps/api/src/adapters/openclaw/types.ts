export interface OpenClawConfig {
  workspace: string
  gateway: {
    host: string
    port: number
  }
  tools: string[]
  env: Record<string, string>
}

export interface ConnectFrame {
  type: 'connect'
  payload: {
    client: string
    version: string
    capabilities?: string[]
  }
}

export interface ToolCallStartEvent {
  type: 'tool_call_start'
  payload: {
    id: string
    issueId: string
    toolName: string
    params: Record<string, unknown>
    timestamp: string
  }
}

export interface ToolCallEndEvent {
  type: 'tool_call_end'
  payload: {
    id: string
    issueId: string
    toolName: string
    result: Record<string, unknown>
    duration: number
    timestamp: string
  }
}

export interface LifecycleEvent {
  type: 'lifecycle'
  payload: {
    state: 'connected' | 'disconnected'
    timestamp: string
    reason?: string
  }
}

export interface ErrorEvent {
  type: 'error'
  payload: {
    code: string
    message: string
    timestamp: string
  }
}

export type OpenClawEvent
  = ToolCallStartEvent
    | ToolCallEndEvent
    | LifecycleEvent
    | ErrorEvent

export type OpenClawFrameType = OpenClawEvent['type'] | 'connect'

export interface OpenClawClientOptions {
  url: string
  clientName?: string
  clientVersion?: string
  reconnect?: boolean
  maxReconnectDelay?: number
}
