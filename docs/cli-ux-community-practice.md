# AIWorker CLI UX 社区实践决策 Ledger

> 本文件是 CLI UX 重构的证据 ledger，不是 AIWorker 产品边界的 canonical contract。
> 产品边界仍以 `docs/architecture.md`、`docs/protocol.md`、`docs/runtime.md`、
> `docs/soul-authoring.md`、`docs/testing.md` 为准。

日期：2026-06-14

## 目标

把 `@zonease/aiworker-cli` 从“内部测试驱动的薄层 demo CLI”收敛成管理员能理解、
脚本也能稳定调用的 CLI。所有命令名、flag、输出模式和诊断行为都必须有外部 CLI
实践证据和 AIWorker 本地边界约束支撑。

## 当前 CLI 审计

当前 `aiworker --help` 暴露 3 个公开命令：

| 当前命令 | 当前行为 | 审计结论 |
| --- | --- | --- |
| `plan-provision` | 生成完整 aissh provisioning plan，并默认输出大段 JSON / shell script | 功能正确，但命名偏实现细节；默认输出对人不友好。 |
| `provision` | 通过 aissh 真实执行 provisioning；`--dry-run` 打印 plan | 功能正确，但 preview/execute 模型不够清楚；真实执行缺少显式确认语义。 |
| `describe` | 裸命令输出 AIWorker/Paseo 产品边界 JSON | 不符合社区 `describe` 语义；应从普通公开命令面移除或改为真正资源详情命令。 |

当前实现和测试还存在这些 UX 问题：

- root help 只有命令列表，没有“这个工具解决什么问题”的人话描述和真实例子。
- 子命令 help 列出了很多 required option，但没有把常用路径和自动化路径讲清楚。
- `plan-provision` 和 `provision --dry-run` 默认输出完整结构化 JSON，适合测试和脚本，
  不适合人在终端快速判断“会对哪台机器、哪个 workspace、哪些文件做什么”。
- `describe` 测试把产品边界当成用户功能锁住了，后续应改为 docs/contract test，而不是
  继续把边界说明伪装成 CLI 命令。
- AIWorker 当前没有持久本地 assignment store，也不拥有 Paseo session/runtime，所以不能
  增加会让用户误会“AIWorker 可以查看 Paseo session 状态”的 status 类命令。

## 外部证据

| 来源 | 证据点 | 对 AIWorker 的约束 |
| --- | --- | --- |
| CLI Guidelines, https://clig.dev/ | 默认/help 输出应包含描述、少量例子、flag 描述和进一步 help 指引；`-h` / `--help` 和子命令 help 必须可用；人类可读输出优先，复杂结构可用显式 JSON。 | root/subcommand help 必须讲人话并给例子；默认输出不能只服务测试；机器可读输出用显式 `--json`。 |
| Terraform `plan`, https://developer.hashicorp.com/terraform/cli/commands/plan | `plan` 创建执行计划，用来预览将要做的改变，本身不执行改变。 | AIWorker provisioning preview 应用 `plan` 语义：生成计划，不连接目标机、不写文件。 |
| Terraform `apply`, https://developer.hashicorp.com/terraform/cli/commands/apply | `apply` 执行 plan；没有 saved plan 时会先生成 plan，并在交互场景请求确认；自动化需要显式跳过确认。 | AIWorker 真实执行应有显式执行/确认语义；自动化执行需要清楚的 `--yes` / `--auto-approve` 等 flag，而不是悄悄执行。 |
| Kubernetes `kubectl describe`, https://kubernetes.io/docs/reference/kubectl/generated/kubectl_describe/ | `describe` 是“显示某个具体资源或资源组详情”，典型形状是 `describe TYPE NAME_PREFIX`。 | 裸 `aiworker describe` 不能继续作为产品边界 dump；除非未来有真实 resource details，否则不要暴露。 |
| GitHub CLI manual, https://cli.github.com/manual/ | GitHub CLI 按资源/动作分组，如 `auth login`、`auth status`、`config set`。 | 如果 AIWorker 未来加入 auth/config，应按资源分组；当前不要为了显得完整添加空壳命令。 |
| GitHub CLI `auth status`, https://cli.github.com/manual/gh_auth_status | `status` 报告 GitHub CLI 确实拥有的认证状态，并用 `--json` 显式进入机器输出。 | AIWorker 只应报告自己拥有的状态；当前不应新增 runtime/session status。 |
| Salesforce CLI `doctor`, https://developer.salesforce.com/docs/platform/salesforce-cli-reference/guide/cli_reference_doctor.html | `doctor` 用于收集 CLI 配置并运行诊断测试，发现环境问题。 | `doctor` 可加入，但只能做本地 CLI / env / aissh / descriptor 诊断，不得联系生产目标或检查 Paseo session。 |
| Docker `info`, https://docs.docker.com/reference/cli/docker/system/info/ | `info` 展示系统级安装/daemon 信息。 | AIWorker 当前无自有 daemon，不应新增让人误会有 AIWorker runtime 的 `info`。 |
| Docker `version`, https://docs.docker.com/reference/cli/docker/version/ | `--version` 是 CLI 版本，`version` 命令可展示多个组件版本。 | 保留 `--version`；只有当 AIWorker 真能检查 aissh/Paseo/provider CLI 版本时，才考虑 `version` 子命令。 |
| Prisma Studio, https://www.prisma.io/docs/studio/getting-started | `npx prisma studio` 是 CLI 显式子命令；它启动本地 Studio server 并在默认浏览器打开 `http://localhost:5555`。 | AIWorker Web 应该由显式 `aiworker web` 拉起，而不是藏在 `plan/apply` 副作用里；默认可以打开浏览器。 |
| Playwright HTML report, https://playwright.dev/docs/test-reporters | `npx playwright show-report` 会 serve 本地报告；官方暴露 open/host/port 配置和环境变量。 | Web UI 启动命令应明确 host/port/open 行为，并给 `--browser none` / host / port 控制。 |
| Vite CLI, https://vite.dev/guide/cli | dev/preview CLI 支持 `--host`、`--port`、`--open`、`--strictPort`。 | AIWorker Web 启动器应直接传 Vite 的标准参数，不自创端口探测语义。 |
| Vite server.host, https://vite.dev/config/server-options | `0.0.0.0` / `true` 会监听 LAN 和 public addresses；官方把 host 暴露作为显式配置。 | AIWorker Web 默认必须绑定 loopback；非 loopback 要显式 `--allow-remote`，并保持 Web 自身认证边界。 |
| Bun `Bun.spawn`, https://bun.com/docs/guides/process/spawn | `Bun.spawn()` 支持 `cwd` / `env` 并可等待 `proc.exited`。 | CLI 可以用 Bun 子进程启动发布包内置 Web server；源码 checkout fallback 可启动 Vite，并等待 server 生命周期。 |
| Bun stdout inherit, https://bun.com/docs/guides/process/spawn-stdout | 子进程输出可用 `stdout: "inherit"` 直接传给父进程。 | 长跑 dev server 的日志应继承到 CLI 终端，而不是被 CLI 捕获后重排。 |

## 决策表

| 决策 | 结论 | 依据 | 本地约束 |
| --- | --- | --- | --- |
| 公开 preview 命令 | 引入 `aiworker plan` 作为主要 preview 命令。 | Terraform `plan` 明确是 preview / execution plan。 | 现有 `createProvisionPlan` 已能无副作用生成计划。 |
| 公开执行命令 | 引入 `aiworker apply` 作为主要真实执行命令。 | Terraform `apply` 是执行已计划操作的社区惯例。 | 现有 `executeProvisionPlan` 通过 aissh 执行；必须保持 neutral cwd 和 redaction。 |
| 旧 `plan-provision` | 不作为最终推荐命令；可在一个 RC 周期保留为隐藏/弃用 alias，前提是 help 不展示、测试覆盖弃用提示或兼容行为。 | CLI Guidelines 要避免让用户面对实现细节；Terraform `plan` 更清晰。 | README 当前使用它；迁移 docs/tests 时要显式处理兼容。 |
| 旧 `provision` | 不作为最终推荐命令；可保留为隐藏/弃用 alias 到 `apply`，但不能绕过新执行确认策略。 | `apply` 对 preview/execute 模型更清晰；真实执行应有显式确认。 | 现有行为直接执行；若保留 alias，测试必须证明不会悄悄扩大风险。 |
| 裸 `describe` | 从普通公开命令面移除；产品边界放入 help/README/contract tests。 | Kubernetes `describe` 是具体资源详情，不是产品介绍。 | 当前没有 AIWorker-owned resource read API；边界 JSON 应由测试覆盖而不是用户命令。 |
| `doctor` | 加入 `aiworker doctor`，但范围限定为本地诊断。 | Salesforce CLI `doctor` 是诊断 CLI 环境问题。 | 可检查 CLI package、aissh resolution、`AISSH_TOKEN` 是否存在、source checkout `.env` 结构、可选 Soul descriptor/template；不得连接目标机或读取 secret 值。 |
| `web` | 加入 `aiworker web` 作为 AIWorker Web admin console 的一键启动命令。 | Prisma Studio / Playwright show-report 都把本地 Web UI 做成显式 CLI 子命令；Vite 提供标准 host/port/open 参数。 | Web 源码仍是 private app；发布后的 CLI 包内置 `web/server.js` 与 `web/static/**`，源码 checkout 里的 Vite 仅作为开发 fallback。 |
| `status` | 暂不加入。 | GitHub CLI `status` 报告它拥有的 auth 状态。 | AIWorker 当前不存 runtime/session 状态；加入会暗示 AIWorker 可观察 Paseo runtime。 |
| `info` | 暂不加入。 | Docker `info` 是 daemon/system-wide 信息。 | AIWorker 没有 employee runtime/daemon；容易复活旧 Worker 心智。 |
| 默认输出 | 改为人类可读摘要。 | CLI Guidelines：human-readable output is paramount。 | 当前 plan JSON 很大；人类默认应只显示目标、workspace、provider、文件数、必需 env、下一步。 |
| 机器输出 | 给会产生结构化数据的命令加显式 `--json`。 | CLI Guidelines 和 GitHub CLI 都把 JSON 作为显式机器接口。 | 现有 JSON plan 可复用，但不应是人类默认输出。 |
| 完整 shell script | 默认不展示；用 `--json` 或 `--show-script` 查看。 | CLI Guidelines 要简洁成功输出。 | script 包含大段 base64 文件内容，默认展示会淹没关键信息。 |
| 执行确认 | `apply` 在交互场景应先展示摘要并要求确认；自动化用 `--yes` 或 `--auto-approve`。 | Terraform `apply` 默认确认，自动化显式跳过确认。 | aissh 会写远端文件/启动 Paseo daemon；不能继续让误操作太容易。 |
| 错误信息 | 缺参数、缺 descriptor、缺 aissh、缺 token、provider 不完整、secret 拒绝都要给下一步。 | CLI Guidelines 强调帮助和可理解输出。 | redaction 逻辑必须保留；错误里不得出现 provider key/token，也不能默认 dump 生成的 shell script / base64 workspace 内容。 |

## 建议的最终公开命令面

```text
aiworker --help
aiworker --version
aiworker plan [options] [--json] [--show-script]
aiworker apply [options] [--yes|--auto-approve] [--json]
aiworker web [--host <host>] [--port <port>] [--browser none|<name>] [--control-plane-dir <path>]
aiworker doctor [--soul <dist/soul.descriptor.json>] [--json]
```

兼容 alias 仅作为迁移手段，不进入 help 的普通命令列表：

```text
aiworker plan-provision   # hidden/deprecated alias to plan, only if tests justify keeping it
aiworker provision        # hidden/deprecated alias to apply, only if it follows apply safety semantics
```

不进入当前最终命令面：

```text
aiworker describe
aiworker status
aiworker info
aiworker version          # 暂不加；保留 --version
```

## 后续实现验收点

- `aiworker --help` 显示一句话描述和 1-2 个真实例子。
- `aiworker plan --help` 说明“只生成计划，不连接目标机，不写文件”。
- `aiworker apply --help` 说明“会通过 aissh 写目标 workspace”，并解释 `--yes`。
- `aiworker doctor --help` 说明“只做本地诊断，不连接生产目标”。
- `describe` 不再出现在普通 help；如保留，必须隐藏并/或明确弃用。
- 默认人类输出不包含完整 base64 shell script。
- `--json` 输出结构化数据，并且继续通过 secret redaction 测试。
- `apply` 失败输出不得包含生成的 shell script、可逆 workspace base64 内容或 literal provider secret。
- README、`docs/testing.md` 和 CLI 单测不再把 `describe` 当作正式产品功能。
