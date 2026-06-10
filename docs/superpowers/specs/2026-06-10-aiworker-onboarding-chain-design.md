# AIWorker 上手全链路设计蓝图（专家做 Soul → 分发 → 员工开箱即用）

- 日期：2026-06-10
- 状态：蓝图（whole-chain blueprint）。本文是总体设计存档，**不是**可直接执行的实现计划；实现计划按切片各自单独成文（writing-plans）。
- 范围：覆盖三个切片（v1 核心 + 两个 Phase 2 切片）。
- 触发：用户反馈「这个版本问题仍然很多——host 分发 worker 没走顺、选不到 soul、worker 启动了也跑不了（没有 LLM 配置）」。

---

## 1. 问题陈述（三个痛点 + 带代码证据的真因）

三个痛点不是孤立 bug，而是**同一条「第一个真实员工上手」链路**上的三段断裂。

| 痛点 | 真因（代码定位） | 性质 |
|---|---|---|
| **#3 worker 跑不了** | 默认引擎 = 扫描顺序里第一个 `installed` 的（`packages/worker-runtime/src/worker/local-engine-resolver.ts:29` 的 `LOCAL_ENGINE_DEFINITIONS` 把 **codex 排在第一、claude-code 第二**）；`defaultLocalSettings()`（`packages/worker-daemon/src/modes/worker/settings.ts:159-173`）取 `engines.find(e => e.installed)`，**只看装没装、不看登没登录**。doctor 的引擎检查（`apps/worker-cli/src/doctor-checks.ts:43`）同样只判 `installed`，装了就报 `ok` → **false-green**。失败时 `executor.ts:266-282` 只甩 `${command} exited with code N`，无可操作引导。无 `aiworker config` 命令选引擎/配 LLM。 | v1 缺陷 + Phase 2 缺口 |
| **#2 选不到 soul** | shipped catalog 只放 `aiworker-freeform`（`packages/worker-runtime/src/soul-app/official-definitions.ts` 的 `SHIPPED_OFFICIAL_SOUL_APPS` 过滤），4 个垂直 soul（google-ads / hr-manager / product-manager / software-support）藏在 `dev-sampling` 视图后，要设环境变量 `AIWORKER_INTERNAL_OFFICIAL_SOUL_CATALOG_VIEW=dev-sampling` 才出来。`worker create` 是 `--app <id>` **必填 flag、无交互选择器**。Host 侧 soul 列表来自 `host_soul_releases` 注册表，没 `soul publish` 过就是空。 | v1 产品策略 |
| **#1 分发不顺** | `apps/host-cli/src/provisioning-target-adapters.ts:33-51` 的 `deliverProvisioningTarget()` **只生成 aissh/docker/local 命令字符串、不真执行**，状态硬编码 `delivered`，实际命令要运营者手工跑。assignment 里的 `soulReleaseRef` 只是标签，`toSoulReleaseView()`（`host-server.ts:681-691`）**不返回 descriptorJson**，worker 启动用的是自带 bundle 的 descriptor、永不从 Host 拉取。所以「Host 分发 soul」目前只是记账，不是真投递。 | Phase 2 设计 |

> 关键观察：痛点 #3 在本地开发机不暴露（开发机 codex 恰好已登录），但在**分发出去的 worker**（无头机器、native 引擎未登录、给不懂技术的员工）上必然爆炸——这把 #3 和 #1 直接绑在一起：分发出去的 worker 没有可用的 LLM 凭证，而「让员工自己 `claude login`」对非技术用户不可行。

---

## 2. 北极星与产品边界对齐

- **北极星**：让一个懂行的人，把一套专业能力做成 Soul、快速迭代，再低成本复制给一群不懂技术的员工；每个员工因此拥有一个开箱即用的专属 AI 工作者。
- 当前形态**正好在三处违背这个承诺**：选不到真实垂直 soul（能力载体被藏）、worker 配不上 LLM 也没引导（开不了箱）、Host 分发是手工 best-effort（复制不低成本）。
- **产品边界约束**（来自 AGENTS.md，本蓝图严格遵守）：
  - v1 只发 standalone Worker；Host + control-protocol 全是 Phase 2，永不在运行热路径上。
  - Host/Soul 是 descriptor-only：Host 与 Workbench 只消费 `dist/soul.descriptor.json`。
  - secret 绝不复制进 descriptor / DB / receipt / log / 诊断输出 / OpenAPI 示例 / UI。

---

## 3. 全链路目标设计（脊柱：一条线，两阶段两片叶）

设计地基**不是网关**，而是这条脊柱：

> **Worker 指向一个能用的 LLM endpoint；「谁来供给这个 endpoint」按阶段不同。**

```
专家做好 Soul ──► 绑定到 Worker ──► 分发到员工 ──► 员工开箱即用
  (authoring)      (selection)      (distribution)   (zero-config run)
                       │                 │                 │
   痛点 #2 ◄──────────┘                 │                 │
   痛点 #1 ◄────────────────────────────┘                 │
   痛点 #3 ◄──────────────────────────────────────────────┘
                                                           │
                         ┌─────────────────────────────────┴─────────────────┐
                         │  LLM 供给（两片叶，同一脊柱）                       │
                         │  v1 standalone：native CLI 自己的登录（零配置）     │
                         │  Phase 2 分发： Host 注入受限可撤销短 TTL token     │
                         └───────────────────────────────────────────────────┘
```

- **v1 standalone（专家自己的机器）**：用 native CLI 自己的登录即可（claude 已登录 = 零配置）。修法不碰网关。
- **Phase 2 分发（员工无头机器）**：Host 在 provision 时注入受限凭证；native 引擎用环境变量被指向上游。

这条脊柱与代码里**已存在的** `engine.gatewayProfileRef` / BYOK secret-ref 模型一致——Phase 2 的注入是把已有占位接通，不是新造概念。

---

## 4. LLM 凭证模型（调研结论 + 诚实边界）

> 用户要求按业内最佳实践定，不拍脑袋。两路独立联网调研高度收敛，引用见 §9。

**业内默认范式（给非技术终端用户供给 LLM）= managed broker / 网关模式**：组织在中心持真 provider key，终端用户**从不持有 key**，每个 worker/seat 拿一把**受限、可即时撤销、短 TTL 的派生 token**；native 引擎被环境变量透明指向网关。GitHub Copilot / Cursor / Claude Teams / Windsurf 企业版默认全是「分配 seat 即开箱」，BYOK 是个人/低层级可选项、企业版主动收口。

**校正三点**：
1. 「集中 BYOK（模式 1）」与「网关（模式 2）」**不是对立，是同一件事**——网关就是把集中 BYOK 做对的机制。
2. 「每员工各自 OAuth 登录（模式 3）」在 B2B 非技术场景**基本不可行**：OpenAI 没有第三方替用户铸 API key 的 OAuth；Anthropic 订阅 OAuth token 绑个人账号、不可组织级分发。仅作极窄 fallback。
3. **诚实安全边界**：native CLI 默认会把凭证落盘（claude 写 `~/.claude/.credentials.json`，mode `0600`）。所以正确主张**不是**「worker 上零 secret」，而是「**master provider key 永不离开网关；worker 只持一把受限、可即时撤销、短 TTL 的派生 key**」——价值在爆炸半径有限 + 可撤销。可用 claude 的 `apiKeyHelper`（运行时拉短期 token）进一步避免静态 key 静止落盘。

**native 引擎注入通道（决定实现落点）**：
- Claude Code：`ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN`（作 `Authorization: Bearer`），或 `apiKeyHelper` 运行时拉取。
- Codex CLI：`OPENAI_BASE_URL` + `OPENAI_API_KEY`；注意 Codex 默认偏好 OAuth，需先 `/logout` 才用 env key。
- **cursor-agent：其 CLI 的 Agent/Edit 不让外部 key 路由 → 从「可走网关 BYOK 的引擎」名单中剔除**，只支持其原生订阅模式。
- 通用 BYOK 直连 OpenAI-compatible：`OPENAI_BASE_URL` + `OPENAI_API_KEY`。

**v1 不自建网关**：v1 只做「注入 + secret-ref + 撤销钩子」管线，集成现成网关（首选自托管 **LiteLLM**，或托管 **Portkey**）或一把 org key（文档化的 deviation）。自建网关是切片 3 的事。

---

## 5. 切片 1（v1 核心）—— standalone worker 能选真 soul 并真能跑

> 这是用户最流血、最便宜、与网关无关的一片。是后续切片的前提：分发一个跑不起来的 worker 没有意义。

### 5.1 — 1a 选 soul

**目标**：`worker create` 能选到**所有已 build / 已注册的 soul**（4 个样本 + 专家自建并 build 的任意 soul），不再只有 freeform。「开放 4 个内置」与「发布我自己的 soul」是**同一条 catalog 路径的两个入口**，用一个统一机制覆盖（用户裁决：两者都要）。

**机制**：
- `worker create` 增加 soul 选择能力：无 `--app` 时进入**交互选择器**列出可选 soul；有 `--app` 时按 id 选定（保留脚本/CI 用法）。
- 让内置 4 个垂直 soul 在面向用户的 catalog 中**可选**（不再只藏在 `dev-sampling` 环境变量后）。具体是把它们纳入 shipped catalog，还是引入一个「用户可选 vs dev 内部」的新分层，留实现计划定——**但必须建立在 peer `77901dfe` 刚落的 catalog-view 机制之上，不回退它的 shipped/dev-sampling 分离**。
- 专家自建 soul：`soul create` → `soul build` 产出 `dist/soul.descriptor.json` → 通过同一 catalog 机制变为 `worker create` 时可选（本地已存在 `app install <descriptor>` 安装路径，需打通到 create 选择面）。

**同步 canon/baseline（用户裁决「两者都要」要求一并改）**：
- `docs/architecture.md` 等 canon 与 product-baseline（现写「v1 只发 freeform」）需同步为新策略；canon 改动必须先于实现落地（AGENTS.md：tmp/refactor accepted decisions must be promoted to canonical docs or tests before implementation）。
- 既有契约测试（`tests/architecture/freeform-soul-contract.test.ts`、`scripts/check-soul-app-boundaries.ts`、`refactor-contract.test.ts`）需随策略更新，不得为旧断言而改新架构。

**协调点**：peer 在 `77901dfe`「收敛 v1 Worker 契约漂移」中刚动过 `official-definitions.ts` / `official.ts` / `orchestrator.ts` / 新增 `scripts/worker-create-catalog-view.ts` / 删 `micro-app.ts`。实现时以该 commit 为基线协调，避免撞车。

### 5.2 — 1b 能跑（auth-aware 默认 + doctor 真就绪 + config + 优雅失败）

**目标**：新 worker 第一次跑 session 时，默认就选一个**真正能用（已登录/有凭证）**的引擎；不能用时给**可操作**的引导，而不是天书报错或 false-green。

**四个改动方向**：
1. **默认引擎 auth-aware**：`defaultLocalSettings()` 不再「按写死顺序取第一个 installed」，而是优先选**已登录/有有效凭证**的引擎。引擎登录态探测：claude 看 `~/.claude/.credentials.json`、codex 看 `~/.codex/auth.json` 等（按各 CLI 文档的凭证位置）。多个可用时给稳定优先级；都不可用时进入引导态而非静默失败。
2. **doctor 查「可用」非只「装了」**：`doctor-checks.ts` 的 `engine` 检查从「installed → ok」升级为三级——已装且已登录 = ok；装了未登录 = warn（带 `claude login` / `codex login` 修复指引）；一个都没装 = error（现状）。
3. **`aiworker config` 命令**：新增 CLI 让用户查看/选择引擎与执行模式（local-cli 选哪个引擎 / byok 配 key ref），写入 daemon local-settings。补上目前只能靠 `POST /api/engine/targets` 或 Web Settings 才能改的空白。
4. **优雅失败**：local-cli 引擎以非 0 退出时，识别「未登录/无凭证」类失败，emit 一条**可操作**的 session 消息（指向 `aiworker config` / `claude login`），而不是裸 `exited with code N`。

**不做（v1 边界）**：不在 v1 引入网关、不注入远程凭证——那是分发场景（切片 2/3）。v1 的「能跑」= 复用 native CLI 自己的登录。

---

## 6. 切片 2（Phase 2）—— Host 真分发

> 独立 spec，本蓝图只定方向，不展开实现。

**目标**：运营者一个动作，让一个**已绑定 soul、已配好 LLM 凭证**的 worker 真正落到员工那一侧、并自己跑通第一回合。

**三个子目标**：
1. **真投递（而非只生成命令）**：`deliverProvisioningTarget()` 从「返回命令字符串」升级为可选的真执行（aissh/docker/local），或至少把「一条命令 = 一个开箱即用 worker」做实——命令里同时带上 soul 与 LLM 凭证注入，使运营者/员工跑一条命令就得到能跑的 worker。
2. **soul 真下发**：打通 Host 存的 descriptorJson → worker。可选两条路线（实现计划定）：(a) Host 暴露取 descriptor 的 endpoint，worker provision 时按 `soulReleaseRef` 拉取并安装；(b) provision 命令直接携带 descriptor。保持 descriptor-only 边界：Host 把 descriptor 当不透明产物，不解释领域字段。
3. **LLM token 注入（managed-broker 注入管线）**：provision 时把一把**受限、可撤销、短 TTL 的派生凭证**（§4）注入 worker 的 native 引擎环境（`ANTHROPIC_BASE_URL`+`ANTHROPIC_AUTH_TOKEN` / `OPENAI_BASE_URL`+`OPENAI_API_KEY`）。v1 阶段对接现成网关或 org key 的 secret-ref，不自建网关。严守 secret 不落 descriptor/DB/log。

**已就绪、可复用**：连接链路（assignment → provisionToken → check-in → access token → WS reverse tunnel → ready）已全部实现（`provision-client.ts` / `host-server.ts` / `host/index.ts`）。切片 2 是在已连通的管道上补「真投递 + soul 下发 + 凭证注入」三件语义层的事，不是从零搭连接。

---

## 7. 切片 3（Phase 2 完整体）—— 托管网关

> 独立 spec，本蓝图只定方向。

**目标**：组织中心持一把/几把真 provider key，给每个 worker 程序化签发**受限 virtual key**，并支持即时撤销、per-worker 限额与审计。

**实现方向**：对接 LiteLLM（OSS 自托管，与 Host→Worker 控制面最同构）或 Portkey（托管 + guardrails）。Host 在 provision worker 时调网关 `/key/generate` 铸 per-worker key（绑 worker identity、设 budget/rpm/TTL）；撤销一个员工 = 调 `/key/block`，不动他人、不轮换 master key。per-worker 审计/限额由网关内建提供，正好补上「Worker 不进 native 引擎热路径」之外缺的组织级可见性。

**取舍**：要托管 + 强 guardrails/合规 → Portkey 替 LiteLLM。这一片把切片 2 的「注入受限凭证」从「对接外部网关/org key」升级为「自有签发闭环」。

---

## 8. 横切关注点

- **Secret-guard**：所有切片严守 AGENTS.md——secret 不入 descriptor / DB / receipt / log / 诊断 / OpenAPI 示例 / UI。Phase 2 注入的凭证以 secret-ref 形式存储与流转，真值只在运行时进内存。
- **Canon/baseline 同步**：切片 1a 改 catalog 策略需同步 canon（architecture/protocol/runtime/testing）与 product-baseline，并先于实现落地。
- **Testing forcing functions**：每切片配 scope 相应的 contract 测试；切片 1b 的 auth-aware 探测与 doctor 三级须有注入 fake 的单测（不真 spawn / 不真读凭证）；切片 2/3 须有真实 Host stop/restart、真 provision、真注入的 e2e gate。
- **诚实失败 over false-green**：贯穿全链路——doctor、首回合、分发状态都不得在「装了但不可用」「生成了命令但没真投递」时谎报绿。

---

## 9. 风险、开放项、协调

- **R1 — 与 peer 活跃改动撞车**：`77901dfe` 刚落在 soul catalog 路径，且工作树持续被并发 session 改动。切片 1a 实现前先对齐该 commit 现状，遵循「并发共享工作树」原则：不 stage / 不 revert 他人改动，提交前重新核对 git status。
- **R2 — 引擎登录态探测的脆弱性**：各 native CLI 凭证位置/格式随版本变；探测应「保守可用判定 + 失败降级为 warn 引导」，不要硬断言。需按各 CLI 当前文档核实凭证路径。
- **R3 — catalog 策略改动牵动 canon 与多处契约测试**：范围比「删个 filter」大；必须 canon 先行 + 契约测试同步，避免为旧断言改新架构。
- **R4 — Phase 2 凭证注入与 secret-guard 的张力**：注入路径最易把 secret 带进 log/diagnostic；切片 2 须有针对性的 redaction/guard 测试。
- **开放项**：切片 1a「开放 4 个内置 soul」具体落点（提进 shipped vs 新增用户可选分层）留实现计划定；切片 2 soul 下发走「Host endpoint 拉取」还是「provision 命令携带」留实现计划定；切片 3 网关选型（LiteLLM vs Portkey）留实现计划定。

---

## 10. 切片顺序与 v1 / Phase 2 归属

| 切片 | 内容 | 阶段 | 依赖 |
|---|---|---|---|
| **1** | 1a 选 soul（统一 catalog + 选择器 + canon 同步） + 1b auth-aware 能跑（默认引擎 + doctor + config + 优雅失败） | **v1** | 无（最先做） |
| **2** | Host 真投递 + soul 真下发 + LLM 受限 token 注入（对接外部网关/org key） | Phase 2 | 切片 1（分发的 worker 必须先能跑） |
| **3** | 托管网关：per-worker virtual key 签发/撤销/限额（LiteLLM/Portkey） | Phase 2 | 切片 2（注入管线） |

依赖逻辑：**worker 自己先能选 soul 并真能跑（1）→ 才谈得上 Host 把它顺畅分发（2）→ 才值得上自有网关闭环（3）**。

---

## 11. 参考来源（LLM 凭证调研，§4）

- Claude Code Authentication（凭证优先级、`ANTHROPIC_AUTH_TOKEN`、`apiKeyHelper`、落盘位置/权限）：https://code.claude.com/docs/en/authentication.md
- Claude Code Bedrock/Vertex/Gateway 企业部署 env：https://code.claude.com/docs/en/bedrock-vertex-proxies ・ https://code.claude.com/docs/en/llm-gateway
- LiteLLM Virtual Keys（`/key/generate`、`duration` TTL、`/key/block` 撤销、per-key budget、master key 不出服务端）：https://docs.litellm.ai/docs/proxy/virtual_keys ・ Enterprise（vault/rotation）：https://docs.litellm.ai/docs/enterprise
- Codex Advanced Config（`OPENAI_BASE_URL` / 自定义 provider）：https://developers.openai.com/codex/config-advanced
- Cursor CLI 配置 + BYOK 限制：https://cursor.com/docs/cli/reference/configuration ・ https://cursor.com/docs/enterprise/model-and-integration-management
- GitHub Copilot Enterprise BYOK（org 层注入、仅静态凭证）：https://github.blog/changelog/2025-11-20-enterprise-bring-your-own-key-byok-for-github-copilot-is-now-in-public-preview/
- GitHub Copilot seat 分配/SCIM：https://docs.github.com/copilot/managing-github-copilot-in-your-organization/granting-access-to-copilot-for-members-of-your-organization
- Windsurf/Codeium 企业团队模型管理 + BYOK 仅 Free/Pro：https://windsurf.com/enterprise
- OpenAI project key / service account / RBAC：https://platform.openai.com/docs/guides/rbac ・ 无 user-OAuth-to-API：https://community.openai.com/t/openai-oauth-for-saas-ai-tools/367955
- Azure OpenAI keyless / Entra managed identity：https://learn.microsoft.com/en-us/azure/developer/ai/keyless-connections
- Cloudflare AI Gateway（Authenticated Gateway + BYOK/Secrets Store）：https://developers.cloudflare.com/ai-gateway/configuration/bring-your-own-keys/
- 边缘 worker 短期凭证：HashiCorp Vault dynamic secrets https://www.hashicorp.com/en/blog/managing-openai-api-keys-with-hashicorp-vault-s-dynamic-secrets-plugin ・ OIDC workload identity federation（GCP/OpenAI WIF）
- 网关对比：https://lushbinary.com/blog/ai-gateway-llm-routing-comparison-litellm-portkey-cloudflare/ ・ https://klymentiev.com/blog/llm-gateway-guide
