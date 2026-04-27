/**
 * `config.get` / `config.put` 在 proto 里属于 operator-to-node，由 worker 自
 * 持实现（`putConfig` + 乐观锁 + runtime reload 的路径全在 worker 侧）。
 * gateway 只透传请求与响应。
 *
 * 保留此文件以匹配 S2 spec 目录骨架；转发逻辑集中在 `../forward.ts`。
 */
export {}
