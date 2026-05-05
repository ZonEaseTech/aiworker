# PLAN-112 Doctor first-run UX（噪声收口 + 命名消歧）

- **status**: completed
- **createdAt**: 2026-05-05 04:25
- **approvedAt**: 2026-05-05 06:00
- **completedAt**: 2026-05-05 06:25
- **relatedTask**: TODO-015

## 现状

QA-005 调试在 fresh-init 项目上跑 `aiworker doctor` 与 `aiworker executor doctor`：

- `apps/cli/src/capabilities/validation.ts:283` `[info] skills.empty skills: No skill files are configured yet.` 在 fresh-init defaults 上必然触发（`.aiworker/skills/` 目录默认空）。
- `apps/cli/src/commands/worker/executor.ts:1118` `executor.capability_manifest_empty` 与 `:1127` `executor.mcp_empty` 在 fresh-init defaults 上必然触发（用户没显式声明任何 overlay）。
- 输出格式只有 PASS / WARN / FAIL，没有顶部 summary line；info 与 warning 视觉无区分；用户首次运行就看到一页混合 PASS+INFO+WARN，自我评估无信心。
- "skills" 一词在 doctor 输出里没有限定词，语义与 brain skill / executor MCP overlay / engine plugin 三层叠加（违反 AGENTS.md 重名概念限定词规则）。

涉及文件：

| 层 | 文件 |
|----|------|
| capability validation | `apps/cli/src/capabilities/validation.ts` |
| executor doctor | `apps/cli/src/commands/worker/executor.ts` |
| doctor printer | `apps/cli/src/commands/worker/doctor.ts` |
| 现有测试 | `doctor.test.ts`、`executor.test.ts`、`validation.test.ts`（如存在） |

## 方案

### A. Summary line + severity rollup

`apps/cli/src/commands/worker/doctor.ts` `runDoctor` 与 `apps/cli/src/commands/worker/executor.ts` `runExecutorDoctor` 两个入口，在打印任何 check 之前先 collect 全部 result，最后顶部 emit：

```
[aiworker doctor] OK — N checks PASS · I info · W warn · E err (fresh-init defaults)
```

或失败时：

```
[aiworker doctor] FAIL — N checks; E err / W warn / I info
```

具体 marker：
- 当所有 check 都是 PASS 且所有 detail 都是 info → 顶部 `OK`，可选附 `(fresh-init defaults)` 标注（只有当 fresh-init detect 命中时）。
- 至少一个 warn → 顶部 `WARN`，文案 "review warnings before production"。
- 至少一个 fail / err → 顶部 `FAIL`，exit code 1。

### B. fresh-init detection — 抑制 info noise

新增 `apps/cli/src/capabilities/fresh-init.ts` 提供 `detectFreshInitDefaults(projectRoot)` 返回 `boolean`：
- 项目存在 `.aiworker/scope.json`；
- 无 `.aiworker/skills/*.md`；
- 无 `.aiworker/executor-capabilities.json` 或文件存在但 `engines` map 为空 / `engines.<engine>.mcp` 全 empty；
- 无 `.aiworker/schedule.json` 或 cron 列表为空；
- worker.db 无任何 brain admission、cron、conversation 记录（best-effort：worker.db 可能不存在；不存在 = fresh）。

`runDoctor` 拿到 `freshInitDefaults: true` 时：
- skip 所有 `[info] X.empty` info-level message（`skills.empty`、`scope.brain.empty`、`overlay.mcp.empty` 等）。
- 在 summary line 后追加 `(fresh-init defaults; expected to be sparse)`。

如果用户**显式**声明了某个 capability（例如 `executor-capabilities.json` 存在但 `engines.claude-code.mcp = []`），就不再视为 fresh-init，而是 emit 更明确的 `[warning] declared but empty` warning（保留现 warning 行为）。

### C. Skill 命名消歧

按 AGENTS.md "重名概念必须显式加限定词"，把 doctor 输出里所有"skill"消息按层加 prefix：
- `apps/cli/src/capabilities/validation.ts:283` `skills.empty` → `brain-skills.empty .aiworker/skills/`，文案 "No brain skill files configured (optional). 见 'aiworker brain skills add --help' 添加。"
- `apps/cli/src/commands/worker/executor.ts:1127` `executor.mcp_empty` → `executor-overlay.mcp.empty engines.<engine>.mcp`，文案明示 "No executor MCP overlay declared (optional unless project pins MCP)."
- `executor.capability_manifest_empty` → `executor-overlay.capabilities.empty .aiworker/executor-capabilities.json`，文案"No project executor overlay entries declared (optional)."
- 文档 `docs/cli.md` `aiworker doctor` / `aiworker executor doctor` 段同步术语。

### D. Severity 重分类

- `brain-skills.empty` 在 fresh-init 下 → suppressed；显式声明空 → `info`（不再 warn）。
- `executor-overlay.*.empty` 在 fresh-init 下 → suppressed；显式声明空 → `warning`（保持现行）。
- 默认 fresh-init 路径下 doctor 应该 0 noise。

## 风险

1. **fresh-init detection false negative**：用户已经做过 brain memory 操作但还没调过 capability → 我们仍可能把它误判为 fresh-init。本轮 conservative 实现：只在所有 check 同时 minimal 时才 detect freshInitDefaults。如果 worker.db 已存在 brain admission 记录，按非 fresh 判断。
2. **summary line 计数**：JSON output mode 仍需支持（`--json`）；summary line 仅在 human-readable 输出添加。
3. **测试快照**：现有 doctor / executor doctor snapshot test 会被改动，需要更新；同步追加新 fresh-init suppression 测试。

## 范围

- `apps/cli/src/capabilities/{validation,fresh-init}.ts`
- `apps/cli/src/commands/worker/{doctor,executor}.ts`
- `apps/cli/src/commands/worker/{doctor,executor}.test.ts`
- `docs/cli.md`（doctor / executor doctor 段术语 sweep）

## 非范围

- `aiworker brain doctor` 这个新子命令（留 follow-up；当前没有这个命令）
- web admin doctor 视图（fleet UI 还未接入此源）

## 验证

- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run typecheck` / `bun run lint` 全量
- 手工 smoke：`mkdir /tmp/proj && cd /tmp/proj && aiworker init --soul developer && aiworker doctor && aiworker executor doctor --engine claude-code` —— 0 info / 0 warn 输出，summary line `OK — N checks PASS · 0 info · 0 warn · 0 err (fresh-init defaults)`。

## 进度

- 2026-05-05 04:25：plan created。
- 2026-05-05 06:25：实施完成。
  - `apps/cli/src/capabilities/validation.ts` `skills.empty` 重命名为
    `brain-skills.empty`，message 显式带上 `.aiworker/skills/` 路径
    和 `aiworker brain skills add --help` 引导。
  - `apps/cli/src/commands/worker/executor.ts` `executor.capability_
    manifest_empty` → `executor-overlay.capabilities.empty`、
    `executor.mcp_empty` → `executor-overlay.mcp.empty`，文案显式
    标注与 brain skills 的边界，并指出 overlay 在大多数项目下是可选
    的。
  - `apps/cli/src/commands/worker/doctor.ts` 新增
    `detectFreshInitDefaults` 与顶层 summary line（`OK / WARN / FAIL
    — N checks; pass / info / warn / fail` + fresh-init 注解）；
    fresh-init 模式抑制 `*.empty` info 噪声。`runDoctor` 的检测仅
    依赖 `scope.json` + `.aiworker/skills/` 是否空，避免与 executor
    overlay 检测耦合。
  - `apps/cli/src/commands/worker/executor.ts` `runExecutorDoctor`
    增加 `detectFreshInitForExecutorDoctor`（`scope.json` 存在 +
    manifest engines 集合为空），fresh-init 时把
    `executor-overlay.*.empty` warning 折叠成 PASS 行带 hint，并在
    summary line 标注 `(fresh-init defaults; overlay declarations are
    optional)`。
  - 测试更新：`apps/cli/src/commands/worker/doctor.test.ts` 新增 2
    条 fresh-init / 命名消歧用例；`executor.test.ts` 把旧的
    `executor.capability_manifest_empty` 检查替换为新代码 +
    fresh-init 行为断言 + 显式声明 engine 后 warning 重新出现的非
    fresh-init 用例。
- 2026-05-05 06:25：验证通过：fs-layout 20 / shared 140 / gateway-proto
  19 / storage-sqlite 19 / gateway 148 / core 592 / api 86 / cli 171
  全 pass；workspace typecheck 9/9；root lint 0 violation。TODO-015
  completed。
