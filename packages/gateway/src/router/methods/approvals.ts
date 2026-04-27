/**
 * `approval.list` / `approval.grant` 在 proto 里属于 operator-to-node：实现
 * 由 worker 侧（gateway-client dispatcher）持有，gateway 只透传请求与响应。
 *
 * 与 `chat.ts`/`config.ts` 一致——保留此文件以匹配 PLAN-014 F2 spec 目录骨架；
 * 转发逻辑集中在 `../forward.ts`，dispatch 路由到这两个方法时直接走通用
 * forward 分支即可。
 */
export {}
