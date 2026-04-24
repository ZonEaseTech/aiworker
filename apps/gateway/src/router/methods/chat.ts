/**
 * `chat.send` 在 proto 里属于 operator-to-node，gateway 只做透传。所以本模块
 * 不持有业务逻辑——真正的处理方在 worker 侧（S4 的 gateway-client dispatcher）。
 *
 * 预留此文件以满足 PLAN-013 S2 spec 约定的目录形态；转发路径的实现集中在
 * `../forward.ts`，dispatch 会在路由到此方法时走通用 forward 分支。本文件刻意
 * 不导出任何 handler，避免给调用方一个"似乎要本地处理"的错觉。
 */
export {}
