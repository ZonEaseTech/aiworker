# AIWorker Goals

> 状态：这是当前从零重构的产品北极星。默认 CLI/Web/daemon surface
> 必须服务垂直业务 Soul，而不是复制 Open Design 的视觉外壳，也不是再做一个
> developer engine。

AIWorker 的重构目的不是把旧 worker/admin/dashboard 换皮，也不是与一线 coding
engine、agent runtime 或创意生成工具竞争。AIWorker 要成为 **team/org 的垂直
Soul 工作台**：借助已经成熟的外部 engine，面向 HR、PM、QA、DevOps、finance、
legal、ops 等团队职能，提供可复用的 Soul、能力模板、领域系统、连接器、项目流和
组织记忆。

Open Design 的参考价值在于产品意图和信息架构，而不是图片/视频领域本身：

```text
Open Design: design skill -> design system -> template -> project/session -> artifact
AIWorker:    host daemon -> Soul worker -> workspace/project -> session/turn -> business artifact
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
host -> local daemon -> Soul worker -> workspace/project -> session
-> turn -> business artifact -> human review -> reusable org memory
```

## Open Design 映射

AIWorker 应借鉴 Open Design 的产品语法，而不是盲目复制 UI。

| Open Design | AIWorker |
| --- | --- |
| Designs home | Soul workspace home |
| Local daemon | Host-local AIWorker daemon |
| Project | Workspace/project under one Soul worker |
| Conversation | Session under one workspace |
| Chat turn | Turn under one session |
| Run / chat run | Engine invocation / internal audit attempt |
| Design skill | Capability template owned by a Soul worker |
| Design system | Domain system / rubric / policy owned by a Soul worker |
| Image/video template | Capability template / workspace template |
| Examples | Example artifacts / playbooks |
| Connectors | ATS / docs / issue tracker / CI / cloud / CRM connectors |
| Settings | Execution mode, engine scan/test, connector, MCP, language, and appearance configuration |
| Pet / companion | Optional ambient helper, never core workflow |

OD 没有 `worker` 这一层，因为它的领域是单一 design generation。AIWorker 必须新增
`worker = one Soul runtime` 作为隔离层；不能把 OD 的 `Project` 直接映射成 worker，
也不能把 Soul 塞进 project metadata 作为长期模型。

判断一个界面或 API 是否正确，不看它是否像 Open Design 截图，而看它是否让一个 HR、
PM、QA 或 DevOps 用户能马上选 Soul、选模板、接入上下文并产出业务 artifact。

## Host / Daemon / Worker Contract

AIWorker 的本地基础设施目标是：

```text
1 host
  -> 1 local daemon
    -> N Soul workers
      -> 1 Soul per worker
        -> N workspaces/projects
          -> N sessions
            -> N turns / artifacts
```

定义如下：

- **Host** 是承载环境：一台 laptop、workstation、VM 或 server。host 负责提供外部
  executor、文件系统、网络和 operator auth 环境，但不是产品对象。
- **Local daemon** 是 host 上唯一的 AIWorker 本地控制面。它负责端口、Web/API、
  SQLite、migration、engine scan/test、BYOK、connector inventory、MCP 配置、token、
  secret refs 和 worker registry。daemon 不代表任何一个 Soul。
- **Worker** 是 Soul 绑定的业务 runtime。一个 worker 只能绑定一个 Soul；一个 daemon
  可以管理多个 worker，例如 HR worker、PM worker、QA worker、DevOps worker。
- **Soul** 是 worker 的领域身份、边界、能力目录、review/admission 标准和 durable
  memory namespace。Soul 不是 project 上的一个下拉字段。
- **Workspace / project** 是某个 worker 下的业务作用域。HR 可以是岗位、候选人池或
  候选人；QA 可以是 release、test suite 或 defect queue；DevOps 可以是 service、
  environment、incident 或 runbook。
- **Session** 是 workspace 内的持续工作线程，也是 engine native session 的绑定点和
  接管点。开了一个 workspace/project 后，可以创建多个 session；每个 session 内多轮
  turn 逐步沟通并产出或修改 artifact。
- **Turn** 是 session 内的一次用户输入、engine 回复、tool/event 更新或 artifact 修改。
- **Engine invocation** 是内部审计对象，表示一次向 engine 发送消息、resume native
  session 或 provider request 的技术尝试。它不是产品对象，不要求用户创建或维护。

能力归属规则：

- Soul 声明 capability catalog；
- worker 实例化 Soul 后拥有 enabled capabilities；
- workspace 默认继承 worker 的 capabilities，可按 workspace type 推荐、隐藏或限制；
- session 可以有 active capability，也可以由 intent router 建议 capability；
- turn、engine invocation 和 artifact 必须记录 `capabilityTemplateId` 或
  `workflowTemplateId`，review/memory 必须能追溯到 capability version。

这意味着默认产品路径不是“一个 worker 内切换多个 Soul”，而是“选择 Soul 时进入或创建
该 Soul worker”。project/workspace 不再长期持有 `selectedSoulId` 作为核心隔离字段。

## AIWorker 负责什么

AIWorker 负责垂直 Soul 产品面：

- Soul catalog：内置和自定义 Soul 的浏览、选择、版本和能力说明；
- domain systems：岗位、产品线、发布线、事故域、财务/legal policy 等领域系统；
- capability templates：面试筛选、PRD、release gate、incident review 等模板；
- local daemon：提供本地 API、Web、worker registry、session service、metadata store
  和静态资源；
- prompt composition：组合 Soul、domain system、template、workspace/project context、
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

外部 engine 是 bring-your-own runtime。AIWorker 只在 session 层设置 cwd/context、组合
Soul prompt stack、通过薄 adapter 调用或启动 engine native session、观察事件流并记录
本地证据。

## 核心产品闭环

1. operator 打开 Web 或 CLI，local daemon 已经是同源入口，不要求手动分开启动 API 和
   Web 作为产品路径。
2. operator 选择或创建一个 Soul worker，例如 HR、PM、QA 或 DevOps。
3. operator 在该 worker 下选择 workspace/project：岗位、产品线、发布线、事故域或团队
   业务作用域。
4. operator 打开或创建 session；session 选择 capability template，或由 intent router
   推荐并显示可改的 capability。
5. daemon 在 session 层组合 worker Soul、template、domain context、workspace/session
   context、connector evidence 和用户输入，并绑定 engine native session。
6. operator 在 session 中多轮 turn 沟通；外部 engine 逐步执行，AIWorker 记录 turn、
   session event、invocation 审计、来源和输出文件。
7. AIWorker 展示业务 artifact，而不是只展示日志或聊天。
8. operator review artifact，决定 accepted、needs follow-up 或 memory candidate。
9. approved memory 带 provenance 写回该 Soul worker 的 durable context。

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
- example artifacts、project templates 和 review rubrics；
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

## 架构遵循规则

本轮确认的合同是：`host -> daemon -> worker -> workspace/project -> session -> turn ->
artifact/review/memory`，engine 从 session 层开始接管，run 只允许作为内部
`engine_invocation` 审计概念存在。后续实现必须严格遵循这个模型。

只有当真实实现证据证明该模型无法落地，或产品体验明显不如期望时，才考虑架构调整。
调整前必须重新 proposal，说明触发原因、证据、替代方案、影响面和迁移成本；不得在实现
中静默回退到旧 project-scope、case/run 主对象、template runner local engine 或文件自嗨
模型。

## 实施优先级

当前重构应重新排优先级：

1. 产品北极星与目标架构重置为 vertical Soul workspace；
2. Soul catalog 与内置 HR/PM/QA/DevOps 优先级；
3. host daemon / Soul worker / workspace / session / turn / invocation 对象模型；
4. capability template / domain system 文件模型；
5. local daemon 的 worker registry、Soul/template/workspace/session/turn/artifact API；
6. Web 首屏：Soul worker catalog + capability templates + workspace/session/artifact；
7. CLI/Web 调试入口收敛为单 daemon lifecycle，不把两步 API+Web 启动当成产品路径；
8. Settings：Local CLI / BYOK、engine scan/test、connectors、MCP、language、
   appearance、autosave；
9. business artifact preview；
10. review/admission -> reusable org memory；
11. developer Soul 降级为 supporting role；
12. cleanup、验证与发布证据。

验收终点不是把旧概念换名，也不是把 Open Design 外壳搬过来，而是得到一条垂直团队
能理解、能使用、能验证、能沉淀的 Soul 工作流。
