/**
 * PLAN-018 / FEAT-024 worker self-enrollment：connect 帧附带的 enroll 块
 * 形态。`apiToken` 由 worker bootstrap 产出（`state.tokenPlaintext`），gateway
 * 收到后会落到 `fleet.db.registered_workers.apiToken`。`displayName` 缺省时
 * gateway 用 `agentId` 兜底，与 fleet schema 默认一致。
 */
export interface GatewayNodeEnrollOptions {
  joinToken: string
  apiToken: string
  displayName?: string
}

/**
 * Gateway-client 运行参数：支持从 env / CLI flag / 手工 options 组装。
 * 所有字段都是显式的——本模块不读 process.env，由调用方（serve.ts /
 * smoke 脚本）在外层做 env 映射，方便单元测试与本地 smoke 干净隔离。
 */
export interface GatewayNodeOptions {
  /**
   * gateway WS URL，例如 `ws://127.0.0.1:7777/node` 或 `wss://gw.example/node`。
   * 必填；不做协议校验（允许 loopback、mock server 等非标准地址）。
   */
  url: string
  /**
   * node 身份 bearer token。gateway 侧会在 connect 帧里校验。
   * 可为空字符串（loopback 场景），但不能 undefined。
   */
  token: string
  /** 当前 worker 的 id，会填进 connect.agentId 以及出站 event payload.workerId。 */
  workerId: string
  /**
   * 设备 id：gateway 用它来区分"同 worker 多容器"或"同 worker 多副本"。
   * 默认用 workerId，避免调用方忘记传而被误判成不同设备。
   */
  deviceId?: string
  /** 面板展示名；可选。 */
  displayName?: string
  /** 断线是否自动重连。默认 true；smoke / 测试里常会关掉它。 */
  reconnect?: boolean
  /** 第一次重连延迟；默认 1s。 */
  initialReconnectDelayMs?: number
  /** 重连延迟上限；默认 16s（1→2→4→8→16 后封顶）。 */
  maxReconnectDelayMs?: number
  /**
   * 可选的 self-enroll 载荷。设置后 client 在 connect 帧里附带 `enroll`
   * 块，gateway 用 `AIWORKER_JOIN_TOKEN` 验签并 upsert fleet.db。未设则走
   * 现有路径（gateway 仅校验 `auth.token` / loopback）。
   */
  enroll?: GatewayNodeEnrollOptions
}

export interface ResolvedGatewayNodeOptions {
  url: string
  token: string
  workerId: string
  deviceId: string
  displayName: string | undefined
  reconnect: boolean
  initialReconnectDelayMs: number
  maxReconnectDelayMs: number
  enroll: GatewayNodeEnrollOptions | undefined
}

/**
 * 把 GatewayNodeOptions 填充成 ResolvedGatewayNodeOptions（补默认值）。
 * 非法输入直接抛错，让调用方在 startup 阶段 fail fast。
 */
export function resolveGatewayNodeOptions(options: GatewayNodeOptions): ResolvedGatewayNodeOptions {
  if (!options.url || options.url.length === 0)
    throw new Error('gateway-client: url is required')
  if (!options.workerId || options.workerId.length === 0)
    throw new Error('gateway-client: workerId is required')
  return {
    url: options.url,
    token: options.token,
    workerId: options.workerId,
    deviceId: options.deviceId ?? options.workerId,
    displayName: options.displayName,
    reconnect: options.reconnect ?? true,
    initialReconnectDelayMs: options.initialReconnectDelayMs ?? 1_000,
    maxReconnectDelayMs: options.maxReconnectDelayMs ?? 16_000,
    enroll: options.enroll,
  }
}
