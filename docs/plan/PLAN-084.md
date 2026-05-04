# PLAN-084 Product positioning docs refresh

- **status**: completed
- **createdAt**: 2026-05-04 11:22
- **approvedAt**: 2026-05-04 11:22
- **completedAt**: 2026-05-04 11:22
- **relatedTask**: FEAT-048

## 现状

1. `docs/architecture.md` 仍把 AIWorker 主要描述为 Brain provider + Executor provider 的自托管 Agent Runtime。
2. `README.md` 顶部卖点仍强调多 LLM engine，与轻量 Project Brain + Worker/Fleet 聚合定位不够一致。
3. `docs/cli.md` 中 executor 章节把 `.aiworker/executor-capabilities.json` 表述为 engine project config 的期望状态，容易被误读为完整 capability source of truth。
4. changelog 需要记录这次产品决策，后续 release / refactor 可引用。

## 方案

1. 在架构文档增加产品定位、拓扑图和 AIWorker-owned / executor-owned 边界。
2. 更新 project layout 中 `executor-capabilities.json` 的说明为 optional project overlay / bootstrap hints。
3. 更新 README 的首屏定位与 project worker 说明。
4. 更新 CLI 文档中的 `up`、`init` next steps、executor mcp/sync/doctor/capability 语义。
5. 在 changelog 追加 `[decision]` 记录。

## 范围

- `docs/architecture.md`
- `README.md`
- `docs/cli.md`
- `docs/changelog.md`

## 非范围

- 不改 CLI 输出。
- 不改 schema 或命令行为。
- 不重命名 `.aiworker/executor-capabilities.json`。

## 风险

1. 文档语义先行，代码仍保留旧命令名称和部分 projection 行为。FEAT-049 后续负责代码和输出收口。
2. “不做 executor isolation” 必须同时说明安全责任：AIWorker 隔离 brain/worker/fleet，executor 环境由 operator 自己管理。

## 验证

- 相关 markdown 中不再把 project executor overlay 表达为完整 effective capability truth。
- 拓扑图能表达 Project Brain、Worker/Fleet、External Executor、Ambient Capabilities 的关系。
- `git diff --check`

## 完成记录

- 2026-05-04 11:22：已更新 architecture、README、CLI 文档和 changelog 的产品定位。
