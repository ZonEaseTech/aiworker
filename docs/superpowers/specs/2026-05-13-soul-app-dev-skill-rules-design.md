# Soul App 开发 Skill 与 Rules 设计

## 决策

Soul App 开发入口采用 **skill-first** 设计：把 agent 可执行的规程放进
`.agents/skills/aiworker-soul-app-dev/SKILL.md`，再由根 `AGENTS.md` 路由到这个
skill。暂不新增 `apps/AGENTS.md` 作为主机制，除非后续验证目标 agent runner 原生支持
按路径加载 nested `AGENTS.md`。

这个设计把规则放在 agent 会实际执行的位置，而不是只增加人类可读的说明文件。

## 当前发现

当前仓库已经具备 Soul App authoring 基础：

- `docs/architecture.md` 和 `GOALS.md` 定义 Host / Soul App 双自治。
- `docs/soul-app-developer.md` 记录 `app create`、`app validate`、`app smoke`
  与 Host / Soul App ownership。
- `apps/aiworker-hr` 和 `apps/aiworker-qa` 已经是参考 Soul App。
- `.agents/skills/` 已经承载 agent-native 项目技能，例如 PMA 与 validation。

缺口是：还没有一个专门面向 Soul App 贡献者的 agent skill，把架构边界、设计语言、
开发步骤和验证 gate 连接成可执行流程。

## 设计语言约束

Soul App 开发 skill 和相关 rules 必须严格沿用当前产品语法，不另起术语体系：

- 产品边界使用 `Host`、`Soul App`、`Soul worker`、`workspace`、`session`、
  `artifact`、`review`、`lesson`。
- 运行模式使用 `standalone`、`Host mounted`、`manifest`、`SDK`、`broker`。
- 默认产品路径仍是
  `local daemon -> Soul worker -> workspace -> session -> artifact -> review -> lesson`。
- Developer Soul 只能作为 supporting role，不把 repo、PMA、coding loop、admin dashboard
  或治理内核推回默认产品中心。

如果修改涉及 Web UI、README、prompt、review rubric 或 CLI 文案，也必须使用同一套词汇。

## 第一阶段范围

第一阶段只做仓库级 agent-native 入口，不修改 Soul App protocol/runtime：

1. 新增 `.agents/skills/aiworker-soul-app-dev/SKILL.md`。
2. 更新根 `AGENTS.md`，声明修改或新增 `apps/aiworker-*` Soul App 时必须使用该 skill。
3. 更新 `docs/soul-app-developer.md`，把人类可读 authoring 文档与 agent skill 串起来。
4. 不新增 `apps/AGENTS.md`，避免依赖未经验证的 nested AGENTS 加载行为。

## Skill 行为

`aiworker-soul-app-dev` 在以下场景使用：

- 新增生产级 Soul App。
- 修改 `apps/aiworker-*` 下的 manifest、domain UI/API、artifact schema、capability
  prompt、review rubric、standalone 或 Host mounted entry。
- 修改 Soul App authoring、validation、scaffold 或 protocol-facing 文档。

skill 必须引导 agent 按以下顺序工作：

1. 先读 `GOALS.md`、`docs/architecture.md`、`docs/soul-app-developer.md`、目标 app
   的 `soul-app.manifest.json`、`README.md` 和相关 review/capability/schema 文件。
2. 判断改动是否属于 Soul App 自治范围；如果需要 Host 私有能力，必须通过 protocol、
   SDK 或 broker 设计，而不是直接 import Host 模块。
3. 保持 standalone 与 Host mounted 两种模式共享同一份 manifest、domain definition
   和 handler 设计。
4. 改动文案、prompt、rubric、README 或 UI 时做设计语言检查。
5. 完成后按影响面运行 `aiworker app validate <path>`、`aiworker app smoke <path>`、
   app package typecheck/test，以及必要的 root gate。
6. 若改动代码文件，最终回复前运行 code-review-graph 审查，除非用户明确跳过。

## 边界规则

Soul App 代码可以依赖 public SDK 和公开共享类型，但不能绕过边界：

- 不 import `@zonease/aiworker-core`、`@zonease/aiworker-api`、
  `@zonease/aiworker-storage-sqlite`、`@zonease/aiworker-web` 等 Host 私有包。
- 不从一个 Soul App 直接 import 另一个 Soul App 的 `src`。
- 不把 secret 写入 manifest、app config、workspace metadata、DB metadata 或日志。
- 不让 Soul App 直接调度 executor、直接读写 Host DB、直接操作 connector credential 或
  直接写入全局 memory。
- Host mounted 访问共享资源时必须通过 scoped broker。

## 第二阶段范围

第二阶段再把验证稳定的规则下沉到 `aiworker app create`：

- 新建 app README 包含领域职责、artifact/review/schema 填写位置和 validate/smoke 命令。
- scaffold 输出中提示开发者使用 `aiworker-soul-app-dev` skill。
- 生成 manifest、capability、review、schema 和 scripts 时沿用同一套设计语言。
- 仍不生成 `apps/AGENTS.md`，除非已经证明 nested AGENTS 是目标 agent 的原生能力。

第二阶段需要单独 PMA plan，因为它会改 CLI scaffold 和测试。

## 非目标

- 不修改 Soul App runtime、Host registry、mounted proxy 或 broker 行为。
- 不把规则扩展为远程 marketplace、第三方 sandbox 或云控制面。
- 不新增只给人类阅读、agent 不会执行的 app-level rules 文件。
- 不重做 HR/QA app 的产品能力。

## 验收标准

- 新增 skill 能清楚指导 agent 如何开发、修改和验证 Soul App。
- 根 `AGENTS.md` 能把 `apps/aiworker-*` 修改路由到该 skill。
- `docs/soul-app-developer.md` 能解释何时读文档、何时使用 skill。
- 所有新增/修改文本使用统一产品语法，不引入 `plugin`、`module`、`admin dashboard`、
  `generic agent runtime` 等会误导当前产品方向的默认表述。
- 文档改动通过 `git diff --check`。
