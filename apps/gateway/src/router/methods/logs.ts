/**
 * `logs.tail` 是订阅式 RPC：operator 发一次 request 成功后，后续增量通过
 * `logs.line` event 帧由 worker 主动推送。gateway 对 request 做透传；对
 * event 做广播（所有 operator 都会收到，与 PLAN-013 S2 全量订阅策略一致，
 * S5 再细化按 workerId 过滤）。
 *
 * 不放 handler；转发与广播的通用路径在 `../forward.ts` 与 `../../events/broadcast.ts`。
 */
export {}
