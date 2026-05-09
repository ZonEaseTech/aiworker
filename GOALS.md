# AIWorker Goals

> 状态：这是当前 local worker 重构的产品北极星。默认 CLI/Web/daemon surface
> 必须服务 work order -> run -> artifact -> review -> lesson 主路径。

AIWorker 要重构为 local-first worker workbench：operator 在真实 workspace 中选择
业务 worker pack，提交 work order，由外部 executor 执行，AIWorker 负责流式展示、
捕获成功 run 的输出 artifact、索引产物 metadata、复盘结果，并把有价值的经验晋升为
可复用的本地 worker context。

参照的是 Open Design 的产品语法：

```text
choose a skill and system -> create a work order -> run in a local workspace
-> stream events and files -> review the artifact -> promote reusable lessons
```

AIWorker 不做图片/视频设计工具。领域差异通过 worker pack 表达：developer、HR、PM、
QA、finance、legal 等都走同一条 work order -> run -> artifact -> review -> lesson
主路径。

## 产品论点

AIWorker 应该像一个本地业务工作台，而不是一个可见的治理内核。

- developer worker 产出 patch、review、plan、release evidence、repo report；
- HR worker 产出 candidate screen、interview brief、role rubric、hiring note；
- project-manager worker 产出 spec、decision record、roadmap slice、status report；
- QA worker 产出 test plan、defect evidence、regression report、release gate。

这些 worker 的共同点不是同一个领域，而是同一个闭环：work order、run、artifact、
review、lesson。领域差异应存在于 worker skill、domain system、template、example 和
review rubric 中。

## AIWorker 负责什么

AIWorker 负责本地 worker 产品面：

- CLI：初始化 workspace、启动本地 daemon、提交 work order、检查 run 和 artifact；
- local daemon：提供 worker API、web、run service 和本地 metadata store；
- web workbench：展示 worker pack、work order、run event、files、artifact preview、
  review 和 lesson candidate；
- prompt composition：组合 worker skill、domain system、workspace state、
  recent run context 与 operator input；
- CLI、HTTP API、web 共享的 run/event 模型；
- artifact index 与 review/lesson promotion；
- worker pack、domain system、work-order template、durable lesson 的文件格式。

## AIWorker 不负责什么

AIWorker 不能变成另一个 executor platform。

- 不重建 executor 的 tool loop、native session、model routing、MCP/plugin/skill
  生态、sandbox、approval UX 或用户级 auth；
- 不声称自己是 executor effective capability source of truth；
- 不把明文 executor secret 写入 worker config、project file 或 SQLite metadata；
- 不在 runtime 里硬编码 HR、developer、PM、finance、legal 等领域 workflow；
- 不把 fleet/gateway 作为这次重构的默认第一体验。

外部 executor 是 bring-your-own local runtime。AIWorker 只设置 cwd、组合 work
order、通过薄 adapter 调用或启动 executor、观察事件流并记录本地证据。

## 核心产品闭环

1. `aiworker init` 在 operator workspace 内或旁边创建 local worker state。
2. operator 选择 worker pack 与 domain system。
3. operator 从 CLI 或 web 提交 work order。
4. daemon 创建 run，组合 prompt stack，在 workspace cwd 下调用外部 executor。
5. daemon 把 event、message 与 run output artifact metadata 推给 CLI/web。
6. operator review 产物，标记 accepted、needs follow-up 或 lesson candidate。
7. approved lesson 写回 durable local worker context。

这是默认产品闭环。不能直接改善这条闭环的能力，在本轮重构中都应保持 secondary。

## Durable Context 边界

Durable context 是本地 worker 的复用知识层，不是产品可见中心。

Durable context 可以承载：

- worker identity 与 domain posture；
- 可复用 lesson 和 example；
- 带 source tag 的 workspace fact；
- run 后晋升 lesson 时需要的 review/admission state；
- 维护本地 context 可信度所需的 redaction、provenance、rollback、audit metadata。

Durable context 不应成为：

- 外部 executor 的通用 memory layer；
- 硬编码领域 workflow engine；
- 每个有用动作之前的强制 gate；
- first-time operator 首屏必须理解的主概念。

稳定边界是：AIWorker 可以守本地 context 的质量和来源，但领域语义判断应交给外部
executor/LLM 基于 prompt 和 workspace evidence 完成。

## Worker Packs

Worker pack 是主扩展面。

一个 pack 可以包含：

- `SKILL.md`：worker 擅长什么、输出标准、工作姿态；
- `SYSTEM.md` 或等价 domain-system 文件：业务约定、rubric、style、policy、artifact
  预期；
- work-order templates；
- example artifacts 与 review rubrics；
- 可选 executor readiness check 或 bootstrap hint。

Pack 以文件为先。daemon 负责加载和组合它们，runtime 不因新增领域继续长分支。

## Fleet And Gateway

Fleet 与 gateway 暂缓。

它们以后可以作为 optional aggregation/control-plane 层回归，但必须等 local worker
loop 已经被证明可用。当前阶段它们不应牵引 API shape、CLI 默认入口、web navigation
或 README onboarding。

如果一个变更需要 fleet/gateway 才能解释 local worker 的价值，这个变更就是过早的。

## 决策测试

接受任何产品或架构变更前，先回答：

1. 它是否让 work order -> run -> artifact -> review -> lesson 更容易理解或验证？
2. first-time operator 能否知道产物会出现在哪里？
3. 真实业务文件是否仍留在 workspace，而不是隐藏进 metadata？
4. 它是否避免把 executor-native capability 说成 AIWorker-owned capability？
5. 同一机制是否能支持 developer、HR、PM、QA 等 pack，而不需要硬编码领域分支？
6. fleet/gateway 是否对这条路径保持 optional？
7. durable context 是否只在 review/lesson 真正有价值的位置出现？

任一答案是否定，都应先停下来简化方案。

## 实施优先级

`REFACTOR-026` 分 slice 落地：

1. 产品北极星与目标架构重置；
2. 统一 local run service；
3. workspace metadata 与 artifact index；
4. worker pack loader 和内置 packs；
5. CLI daemon lifecycle 与 root help；
6. web workbench 首屏；
7. review 与 lesson promotion；
8. cleanup、验证与发布证据。

验收终点不是把旧概念换名，而是得到一条可以解释、可以使用、可以验证的 local worker
loop。
