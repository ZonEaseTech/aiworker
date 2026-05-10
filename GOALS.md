# AIWorker Goals

> 状态：这是当前从零重构的产品北极星。默认 CLI/Web/daemon surface
> 必须服务垂直业务 Soul，而不是复制 Open Design 的视觉外壳，也不是再做一个
> developer engine。

AIWorker 的重构目的不是把旧 worker/admin/dashboard 换皮，也不是与一线 coding
engine、agent runtime 或创意生成工具竞争。AIWorker 要成为 **team/org 的垂直
Soul 工作台**：借助已经成熟的外部 engine，面向 HR、PM、QA、DevOps、finance、
legal、ops 等团队职能，提供可复用的 Soul、能力模板、领域系统、连接器、案例流和
组织记忆。

Open Design 的参考价值在于产品意图和信息架构，而不是图片/视频领域本身：

```text
Open Design: design skill -> design system -> template -> project/run -> artifact
AIWorker:    Soul -> domain system -> capability template -> case/run -> business artifact
```

AIWorker 不做图片/视频设计，不做 coding engine，不做 executor 平台。它把 Open
Design 已经验证过的“选能力、套系统、从模板开始、在项目中产出”的思路，迁移到组织
垂直职能。

## 产品论点

一线 developer 领域已经百家争鸣。完整的软件开发不应该成为 AIWorker 的默认中心，
因为成熟 engine 已经覆盖了大量 coding loop、tool loop、approval、session、MCP、
plugin 和模型生态。AIWorker 可以有 developer Soul，但它应是辅助型：release
readiness、代码审查、证据汇总、变更风险、handoff、repo knowledge extraction，而
不是“再造一个开发平台”。

AIWorker 的第一性价值应落在 team/org 更需要垂直沉淀的角色：

- HR Soul：岗位画像、候选人筛选、面试计划、面评归纳、招聘风险、talent pool 记忆；
- PM Soul：PRD、决策记录、路线图切片、需求澄清、状态报告、跨团队同步；
- QA Soul：测试计划、回归矩阵、缺陷证据、release gate、风险复盘；
- DevOps Soul：变更窗口、部署检查、事故复盘、runbook、容量和告警总结；
- Finance / legal / ops Soul：各自领域的审查、模板化输出、证据链和复用经验。

这些 Soul 的共同点不是同一个任务名，而是同一种产品结构：

```text
Soul catalog -> capability template -> domain system -> case -> engine run
-> business artifact -> human review -> reusable org memory
```

## Open Design 映射

AIWorker 应借鉴 Open Design 的产品语法，而不是盲目复制 UI。

| Open Design | AIWorker |
| --- | --- |
| Designs home | Soul workspace home |
| Design skill | Soul capability |
| Design system | Domain system / rubric / policy |
| Image/video template | Capability template / case template |
| Project | Domain case / team workspace |
| Examples | Example artifacts / playbooks |
| Connectors | ATS / docs / issue tracker / CI / cloud / CRM connectors |
| Settings | Execution mode, engine scan/test, connector, MCP, language, and appearance configuration |
| Pet / companion | Optional ambient helper, never core workflow |

判断一个界面或 API 是否正确，不看它是否像 Open Design 截图，而看它是否让一个 HR、
PM、QA 或 DevOps 用户能马上选 Soul、选模板、接入上下文并产出业务 artifact。

## AIWorker 负责什么

AIWorker 负责垂直 Soul 产品面：

- Soul catalog：内置和自定义 Soul 的浏览、选择、版本和能力说明；
- domain systems：岗位、产品线、发布线、事故域、财务/legal policy 等领域系统；
- capability templates：面试筛选、PRD、release gate、incident review 等模板；
- local daemon：提供本地 API、Web、run service、metadata store 和静态资源；
- prompt composition：组合 Soul、domain system、template、workspace/case context、
  connector evidence 与 operator input；
- business artifacts：把 engine 输出变成可定位、可审查、可复用的业务产物；
- review/admission：由人确认 artifact 质量，再把有价值经验晋升为组织记忆；
- connector boundary：接入团队系统时保留来源、权限边界和证据链。

## AIWorker 不负责什么

AIWorker 不能变成另一个 executor platform，也不能变成 coding-only 项目管理器。

- 不重建外部 engine 的 tool loop、native session、model routing、MCP/plugin/skill
  生态、sandbox、approval UX 或用户级 auth；
- 不声称自己是 executor effective capability source of truth；
- 不把明文 executor secret 写入 worker config、project file 或 SQLite metadata；
- 不把 developer 设为默认中心，不把 repo/PMA 作为产品主语；
- 不在 runtime 里硬编码 HR、PM、QA、DevOps 等领域 workflow；
- 不把 Open Design 的 desktop chrome、品牌、宠物、图片/视频文案照搬进 Web；
- 不把 fleet/gateway 作为这次重构的默认第一体验。

外部 engine 是 bring-your-own runtime。AIWorker 只设置 cwd/context、组合 Soul prompt
stack、通过薄 adapter 调用或启动 engine、观察事件流并记录本地证据。

## 核心产品闭环

1. operator 打开 Web 或 CLI，选择一个 Soul，例如 HR、PM、QA 或 DevOps。
2. operator 选择 domain system：岗位、产品线、发布线、事故域或团队规范。
3. operator 选择 capability template：candidate screen、PRD、release gate、
   incident review、runbook update 等。
4. daemon 组合 Soul、template、domain context、connector evidence 和用户输入。
5. 外部 engine 执行，AIWorker 记录 run、事件、来源和输出文件。
6. AIWorker 展示业务 artifact，而不是只展示日志或聊天。
7. operator review artifact，决定 accepted、needs follow-up 或 memory candidate。
8. approved memory 带 provenance 写回 Soul / domain 的 durable context。

这是默认产品闭环。不能直接改善这条闭环的能力，在本轮重构中都应保持 secondary。

## Durable Context 边界

Durable context 是 Soul 和组织工作方式的复用知识层，不是产品可见中心。

Durable context 可以承载：

- Soul identity、domain posture、rubric 和输出标准；
- 可复用 lesson、example、template refinement；
- 带 source tag 的候选人/需求/缺陷/事故/发布事实；
- artifact review 后晋升 memory 时需要的 admission state；
- redaction、provenance、rollback、audit metadata。

Durable context 不应成为：

- 外部 executor 的通用 memory layer；
- 硬编码领域 workflow engine；
- 每个有用动作之前的强制 gate；
- first-time operator 首屏必须理解的主概念。

稳定边界是：AIWorker 守 context 的质量和来源；领域语义判断交给 Soul prompt 和外部
engine 基于 evidence 完成。

## Soul Packs

Soul 是用户理解的产品单位；pack 是文件和运行时投影。

一个 Soul pack 可以包含：

- `SKILL.md`：Soul 擅长什么、边界、输出标准、工作姿态；
- `SYSTEM.md` 或等价 domain-system 文件：业务约定、rubric、policy、artifact 预期；
- capability templates；
- example artifacts、case templates 和 review rubrics；
- connector descriptors 和 readiness checks；
- 可选 executor bootstrap hint。

Pack 以文件为先。daemon 负责加载和组合它们，runtime 不因新增领域继续长分支。

## Fleet And Gateway

Fleet 与 gateway 暂缓。

它们以后可以作为 optional aggregation/control-plane 层回归，但必须等单个 Soul
workspace 已经被证明可用。当前阶段它们不应牵引 API shape、CLI 默认入口、web
navigation 或 README onboarding。

如果一个变更需要 fleet/gateway 才能解释 AIWorker 的价值，这个变更就是过早的。

## 决策测试

接受任何产品或架构变更前，先回答：

1. 它是否让 HR/PM/QA/DevOps 等垂直 Soul 更容易开始工作？
2. first-time operator 能否立刻理解 Soul、domain system 和 capability template？
3. 它是否借助外部 engine，而不是把 AIWorker 做成 engine？
4. 它是否避免 developer/coding-only 牵引默认产品面？
5. 真实业务 evidence 是否保留来源和边界，而不是隐藏进无来源 metadata？
6. artifact 是否可见、可审查、可晋升为 memory？
7. 同一机制是否能支持多个 Soul，而不需要 runtime 硬编码领域分支？
8. fleet/gateway 是否对这条路径保持 optional？
9. durable context 是否只在 review/admission 真正有价值的位置出现？

任一答案是否定，都应先停下来简化方案。

## 实施优先级

当前重构应重新排优先级：

1. 产品北极星与目标架构重置为 vertical Soul workspace；
2. Soul catalog 与内置 HR/PM/QA/DevOps 优先级；
3. capability template / domain system 文件模型；
4. local daemon 的 Soul/template/case API；
5. Web 首屏：Soul catalog + capability templates + case/run/artifact；
6. Settings：Local CLI / BYOK、engine scan/test、connectors、MCP、language、
   appearance、autosave；
7. business artifact preview；
8. review/admission -> reusable org memory；
9. developer Soul 降级为 supporting role；
10. cleanup、验证与发布证据。

验收终点不是把旧概念换名，也不是把 Open Design 外壳搬过来，而是得到一条垂直团队
能理解、能使用、能验证、能沉淀的 Soul 工作流。
