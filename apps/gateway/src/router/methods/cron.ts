/**
 * `cron.list` / `cron.add` / `cron.remove` / `cron.update` 在 proto 里都是
 * operator-to-node，gateway 只做透传——真正的 CRUD 处理在 worker 侧
 * （`apps/api/src/worker/gateway-client/methods/cron.ts`，由 dispatcher 路由）。
 *
 * 与 `chat.ts` 一致：刻意不导出 handler，避免给调用方一个"似乎要本地处理"的
 * 错觉；dispatch 路由时自然走通用 forward 分支。
 */
export {}
