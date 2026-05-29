[$aiworker-refactor-dev-loop](/Users/ben/projects/aiworker/.agents/skills/aiworker-refactor-dev-loop/SKILL.md)

请开启 goal 模式，长期推进 AIWorker 破坏性重构实现。

本次开启前先做一次全盘校验开发进度,上一轮出现了严重的漂移,可能出现误判开发已完成的现象.

Objective:
把 AIWorker 推进到 canonical architecture 可发布状态。Freeform v1 是第一条强验收纵切，不是重构终点。

工作目录：
/Users/ben/projects/aiworker

本 goal 显式授权：
- 使用规范的 Superpowers 流程；
- 使用 subagents 作为短生命周期 sidecar；
- 但必须严格遵守 Subagent Reclamation Contract：spawn 后登记，结果到手立即 close_agent，final / phase commit / 下一 slice 前 owned open subagents 必须为 0；
- 按 Phase Commit Contract 做阶段性 conventional commit；
- 每次启动和完成都按 Zero-Trust Review Contract 复查。

硬约束：
- canonical authority 只看 AGENTS.md 和 docs/architecture.md、docs/protocol.md、docs/runtime.md、docs/soul-authoring.md、docs/testing.md。
- 不得使用 tmp/refactor、旧 E2E、旧 changelog、旧 project-local skills 作为架构权威。
- 目标是开发推进，不是审计报告。
- 如果没有 P0/P1 drift，每轮必须完成一个最小可验证开发 slice。
- 不得因为完成单个 slice 就退出 goal。
- 只有满足 skill 的 Exit Criteria 才能 complete。
- 只有同一 blocker 连续多轮无法推进，且没有替代 slice，才允许 blocked。

每轮开始：
1. 读取 AGENTS.md、五份 canonical docs、aiworker-refactor-dev-loop skill。
2. 以零信任视角复查当前 git state、canonical contracts、P0/P1 drift。
3. Reconcile 已知 owned subagents，先 join/close，再考虑新 subagents。
4. 运行 docs:check 和 test:contracts。
5. 从当前代码证据选择下一个最小可验证 slice。

每轮执行：
- 按 skill 的 Slice Priority 选片。
- 需要设计/计划/TDD/debug/完成验证时，调用对应 Superpowers。
- subagent 只做独立 sidecar，主 agent 保持关键路径。
- 行为变化优先补 focused contract test。
- 完成后做零信任 completion review。
- 所有 owned subagents 必须 joined + closed。
- 验证通过后，按 conventional commit 做阶段性提交。
- 只 stage 当前 slice 文件，禁止 git add .。

最终汇报必须包含：
Goal / Preflight / Slice / Zero-Trust / Superpowers-Subagents / Changes / Verification / Drift / Commit / Next。
