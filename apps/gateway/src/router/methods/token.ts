/**
 * `token.rotate` 在 proto 里属于 operator-to-gateway，按语义应该由 gateway
 * 本地重签 deviceToken（旧 token 立即失效）。PLAN-013 S2 阶段没有 pair 流程
 * 产生初始 deviceToken，所以也没有可轮换对象——handler 的 stub 实现集中放在
 * `./launch-stub.ts`（pair/launch/token-rotate 统一 501）。
 *
 * 保留此文件以匹配 S2 spec 目录骨架。
 */
export {}
