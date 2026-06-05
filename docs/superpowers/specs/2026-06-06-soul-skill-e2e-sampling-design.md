# Soul Skill 真实 E2E 采样调优设计

- 状态: 用户已批准设计方向, 待用户 review 书面 spec 后进入 implementation plan
- 范围: 5 个官方 Soul 的 skill 真实 Codex engine 多轮采样, 输出质量评估, skill/资产调优, 复测闭环
- 主轴: 仿人类使用的质量闭环, 不是固定轮数 smoke

## 背景

AIWorker 已有官方 Soul 目录和 fleet worker 工具。当前官方 Soul 为:

| Soul | appId | skill 数 |
| --- | --- | --- |
| AIWorker Freeform | `aiworker-freeform` | 1 |
| 谷歌推广 | `google-ads` | 6 |
| 人事经理 | `hr-manager` | 5 |
| 产品经理 | `product-manager` | 5 |
| 软件客服 | `software-support` | 4 |

这 5 个 Soul 已进入 `OFFICIAL_SOUL_APPS`, 可以通过 descriptor bootstrap 和
`worker create --app <appId>` 创建独立 Worker。`bun run smoke:fleet` 已证明多
Worker 独立 home/DB/端口链路可用。Codex CLI 已安装, 可通过 worker runtime 的
`codex exec --json` 走真实 local engine。

当前基线有一个已确认漂移: `bun run test:contracts` 失败在退休目录
`packages/soul-workbench` 和 `packages/soul-app-runtime` 仍存在, 目录内只剩
`node_modules` 空壳。该漂移必须在进入长期采样前最小清理, 让 contract gate
重新可信。

用户目标不是审计这些 skill, 而是把它们调教到真实可用水准。任何 LLM engine
流程都必须真实调用, 不 fake、不用模拟 engine 代替质量判断。

## 目标

1. 为 5 个官方 Soul 建立真实 worker 采样环境, 每个 Soul 独立 Worker home。
2. 对每个 skill 做多轮、仿人类的真实 Codex 调用。
3. 用统一 rubric 采集输出质量问题, 区分 skill 文案问题、workspace 指挥问题、
   knowledge/template 缺口和平台运行问题。
4. 对前三类 Soul 资产问题做内循环修复, 并用新的 prompt 复测。
5. 形成可追踪的采样证据、评分、修复决策和复测结果。
6. 保持 AIWorker canonical 边界: Soul descriptor-only, Worker 拥有 Workbench、
   workspace、session、projection 和 engine 启动。

## 非目标

- 不使用 fake engine、mock LLM、静态 golden output 代替真实 Codex 调用。
- 不通过读取 Soul source 私有模块来影响运行时行为; 运行时只依赖 descriptor
  投影到 workspace 的 assets。
- 不引入 Host runtime、Host-rendered Workbench、Soul UI 或 app-owned API。
- 不把固定轮数作为成功标准。轮数是手段, 输出质量达标才是标准。
- 不把真实业务密钥、PII、支付商户号、候选人个人信息、shop 连接串写入 prompt、
  descriptor、DB、日志或采样记录。
- 不在本设计中定义完整发布门槛; 发布门槛仍以 canonical docs 和 release gates 为准。

## 采样原则

采样按「真实员工会怎么用」设计, 每个 skill 至少覆盖三类任务:

1. **信息充足任务**: 用户给出足够上下文, 期望 skill 直接产出具名成品。
2. **信息缺失或混乱任务**: 用户给的输入不完整、口径混杂或包含不可靠假设,
   期望 skill 先澄清、标假设, 而不是编造。
3. **边界或高压任务**: 涉及合规、资金、PII、冲突利益、承诺风险、质量门或紧急场景,
   期望 skill 明确边界并给可执行下一步。

轮数不预设上限。每个 skill 初始至少跑 2 轮; 任一核心质量项未达标时, 进入修复和追加复测。
复测必须使用新的 prompt 或改写后的场景, 防止 skill 只适配单个测试题。

## 执行拓扑

默认使用临时或显式指定的 `AIWORKER_HOME`, 不污染用户日常 home。

执行链路:

```text
soul build / validate
-> worker create --app <appId>
-> workspace create --worker <workerId>
-> session start --engine codex --model <model> --reasoning <effort>
-> session invoke 多轮 follow-up
-> session events / session show / workspace files 采集证据
-> rubric 评分
-> 修 Soul assets
-> build / validate / 复测失败项
```

优先使用 CLI 编排, 因为它能直接证明 descriptor install、projection、session、
invocation 和 engine bridge。现有 `dev:fleet-web` harness 可作为人工浏览和 Web 复核入口,
但不是第一轮质量采样的必要前置。

## 证据目录

每次长任务创建一个采样目录:

```text
tmp/e2e-soul-sampling/<timestamp>/
  manifest.json
  prompts/
  runs/
  scorecards/
  findings.md
  fix-log.md
```

`manifest.json` 记录本轮 worker、workspace、session、invocation、engine metadata、
开始/结束时间、命令版本和 Git commit。`prompts/` 保存脱敏后的输入场景。
`runs/` 保存运行摘要、CLI JSON、session events 和最终输出摘要。`scorecards/`
保存逐 skill rubric。`findings.md` 汇总问题队列。`fix-log.md` 记录每次资产修改和复测结果。

采样记录可以保留 output 摘要和必要片段, 但必须避免写入密钥、PII 和未经脱敏的商户或候选人数据。

## 质量 Rubric

每个 skill 的输出按 0 到 2 分评分:

| 维度 | 0 | 1 | 2 |
| --- | --- | --- | --- |
| 触发与选路 | 未使用对应 skill 或跑偏 | 部分选对, 但混用/弱引用 | 准确进入对应 workflow |
| 澄清与假设 | 缺输入仍编造 | 有提问但不完整 | 必要时先问, 或显式标假设/待验证 |
| 资产引用 | 不读或乱引 knowledge/template | 引用泛化 | 正确使用对应 knowledge 和 template |
| 成品完整度 | 只有建议, 无具名交付物 | 有结构但缺关键项 | 符合 skill 产出物和模板 |
| 领域深度 | 泛泛而谈 | 有部分领域锚点 | 命中 TTPOS/餐饮/Google Ads 等领域硬约束 |
| 可执行性 | 难落地 | 有步骤但缺判据 | 有编号步骤、判据、下一步和责任边界 |
| 边界与合规 | 过度承诺或泄漏风险 | 有提醒但不稳定 | 明确边界、脱敏、合规、人审/法务/研发确认 |
| 自检能力 | 不做自检 | 自检口号化 | 按 skill 自检清单逐项收敛 |
| 语言与可读性 | 风格混乱 | 基本清楚 | 中文清楚、专业术语稳定、可直接编辑 |

核心失败条件:

- 伪造事实、市场数据、法律结论、薪酬数值、修复 ETA 或内部系统结果。
- 泄漏或要求输入真实密钥、token、支付商户号、候选人 PII。
- 对信息缺失任务不澄清且直接产出确定结论。
- 没有产出 skill 承诺的具名成品。
- 违反 canonical 边界, 例如暗示 Soul 提供 UI 或 Host 参与 runtime。

单轮达标线: 所有核心失败条件为 false, 且平均分不低于 1.6。核心 skill 的最终验收应至少有
2 个不同 prompt 达标。

## 问题分类

采样失败归为四类:

1. **skill 文案问题**: SKILL.md 缺步骤、缺约束、触发描述不清、自检不足。
2. **workspace 指挥问题**: AGENTS.md 选路、领域边界、资产索引或默认路径不清。
3. **knowledge/template 缺口**: playbook、benchmarks、integrations 或 templates 缺必要口径。
4. **平台运行问题**: descriptor、projection、CLI、session、engine bridge、event 采集或 worker 隔离问题。

前三类进入 Soul assets 修复。第四类单独记录为平台 bug, 不通过改 skill 掩盖。

## 内循环

每个 domain Soul 按以下循环推进:

1. 构建并验证 Soul。
2. 创建或复用独立 Worker。
3. 为一个 skill 跑初始采样任务。
4. 评分并记录失败原因。
5. 如果失败属于 Soul assets, 修改最小相关文件。
6. 重新 build / validate。
7. 用新 prompt 复测失败维度。
8. 达标后进入下一个 skill。

当多个 skill 暴露同一类问题时, 优先改共享 AGENTS、knowledge 或 template, 再复测受影响 skill。
当单个 skill 的 workflow 特别关键, 可以先深调到标杆水准, 再把模式迁移到同 Soul 的其他 skill。

## Soul 覆盖

### `google-ads`

重点验证本地餐饮代运营闭环:

- onboarding 是否能先锁定餐厅画像、AOV/毛利、GBP 状态和预算。
- GBP、campaign、copy、tracking、review 是否能引用本地动作、归因缺口、PDPA 和多客户冲突。
- 泰语/中文字符计数、Google Ads policy 和本地化文案是否稳健。

### `hr-manager`

重点验证 TTPOS 中国团队 HR 工作:

- JD、面试、offer、onboarding、OKR 是否围绕同一岗位族/职级对齐。
- 技术岗是否命中 Go/Flutter/Melos/GORM/多终端等真实能力维度。
- 薪酬和劳动合规是否使用占位、脱敏、法务/公司实际调研边界。

### `product-manager`

重点验证 TTPOS 产品 PM 工作:

- PRD/机会评估是否回溯 Job、门店经营指标、多租户、多终端和泰国市场。
- backlog 是否使用 ttpos-bot sprint 评分和超期阈值, 不退回泛 RICE。
- experiment/metrics 是否写清指标口径、MDE、数据源、时区和判定规则。

### `software-support`

重点验证商家支持和升级质量:

- ticket triage 是否先共情再采集复现五要素, 输出能过质量门的 issue。
- incident comms 是否谨慎处理资金、ETA、人审和时间线。
- runbook/KB 是否区分商家语言与工程语言, 有明确升级出口和维护标记。

### `aiworker-freeform`

Freeform 作为平台链路 sanity:

- 验证 open-ended session 能遵守 workspace root、使用 projected files、不乱套 domain workflow。
- 用它区分平台运行问题和 domain skill 质量问题。

## 安全与红线

- 所有输入场景使用合成但真实感强的脱敏数据。
- 明确禁止 literal secret、token、支付密钥、候选人真实联系方式、商户号和 shop 连接串进入采样记录。
- MCP 文件只作为 projected placeholder 验证, 不接真实凭据。
- 输出中若出现敏感值样式, 记为失败并修复提示或 redaction 相关资产。
- 人审边界必须保留: 法律文件、对外事故公告、薪酬承诺、资金处置、真实发布广告、Lark/GitHub 写入都只能产草稿或建议。

## 验证策略

每个资产修改后至少运行:

```text
bun run --filter '<soul package>' build
bun run --filter '<soul package>' validate
```

每个实施 slice 收尾至少运行:

```text
bun run docs:check
bun run test:contracts
git diff --check
```

涉及代码或 runner 逻辑时, 追加:

```text
bun test <focused test>
bun run smoke:fleet
bun run crg:review
```

最终完整信心门槛取决于实际改动范围; 若改动进入 CLI/runtime/web, 需要追加对应
`test:cli`、browser gate、typecheck 或 release smoke。

## 验收标准

本长任务达成时应满足:

1. `docs:check` 和 `test:contracts` 通过。
2. 5 个官方 Soul 均完成真实 worker + Codex engine 采样。
3. 21 个 skill 均至少有达标复测记录; 未达标项必须有明确剩余问题和下一步。
4. 每个 domain Soul 至少有 1 个代表性 skill 被深调为标杆, 且同 Soul 其他 skill 没有明显结构性短板。
5. 采样目录包含 manifest、prompt、scorecard、findings 和 fix-log。
6. 所有修改后的 Soul assets 均 build/validate 通过。
7. 未引入 Host runtime、Soul UI、fake engine 或密钥/PII 泄漏。

## 实施顺序建议

1. 最小清理 contract gate 漂移, 删除退休空目录, 证明 `test:contracts` 通过。
2. 写采样 runner 或脚本化命令序列, 先覆盖 Freeform + 1 个 domain skill。
3. 建立 rubric 和采样证据格式。
4. 逐 Soul 运行真实采样, 从失败最集中的 domain 开始修。
5. 每次修复后做 focused build/validate + 新 prompt 复测。
6. 收敛 5 个 Soul 后跑最终 gate 和 `crg:review`。

## 设计自检

- 无占位词。
- 范围聚焦在 skill 真实 e2e 采样与调优, 未扩展到 Host/发布产品面。
- 运行链路明确使用 worker CLI + real Codex engine。
- 成功标准以质量达标和复测为准, 不以固定轮数为准。
- 安全边界覆盖密钥、PII、资金、法律、对外发布和 canonical architecture。
