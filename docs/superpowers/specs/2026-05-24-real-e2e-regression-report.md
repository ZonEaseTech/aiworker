# AIWorker 真实 E2E 回归审计报告

## 环境

- 审计时间：2026-05-24。
- 源码基线：`af41464edd3e25606f60e136abc4c2b0c74c7a9e`，见 `tmp/real-e2e-regression-2026-05-24/README.md`。
- Run id：`20260524-220832`，见 `tmp/real-e2e-regression-2026-05-24/e2e-env.sh`。
- Source dev home：`~/.aiworker-dev`，dev daemon/Web 使用 `9217/5173`。
- Installed-home 抽检：`~/.aiworker`，installed daemon 使用 `9317`。
- Engine baseline：Bun `1.3.13`，Codex CLI `0.132.0`，Claude Code `2.1.148`。
- 最终状态已记录：`tmp/real-e2e-regression-2026-05-24/commands/final-state.txt`。

## 覆盖矩阵

| 范围 | 路径 | 结果 | 关键证据 |
| --- | --- | --- | --- |
| CLI + HR + Codex | `~/.aiworker-dev`，worker `e2e-hr-codex-20260524-220832` | 通过 | `commands/cli-session-start-codex.txt`，`workspaces/cli-hr-codex-artifact.txt` |
| Web + HR + Claude Code | Worker Web mounted HR workspace | 通过 | `commands/web-claude-session-summary.json`，`workspaces/web-hr-claude-artifact.txt`，`screenshots/web-claude-completed-session.png` |
| QA mounted locator | QA workspace mounted universal workbench | 通过 | `browser/web-qa-mounted-locator.json` 包含 `workerId`、`workspaceId`、`theme` |
| Worker Configuration boundary | HR/QA worker-scoped 配置入口与 dialog | 通过 | `browser/web-worker-config-task7-summary.json`，HR/QA `*-raw-dialog.json`，HR/QA `*-forbidden.json` |
| Web layout 深挖 | desktop 与 390px narrow | 通过并记录 P2 | Task 9 Playwright metadata 与 narrow layout/screenshot 文件 |
| Installed-home 抽检 | `~/.aiworker` on `9317` | 通过 | `commands/install-health.json`，`install-openapi.json`，`install-engine-readiness.json`，`install-apps.json` |

## 通过项

- CLI HR/Codex 创建 worker、workspace、session 成功；turn 和 invocation 均为 `succeeded`，artifact 写入 HR workspace 内：`tmp/real-e2e-regression-2026-05-24/workspaces/cli-hr-codex-artifact.txt`。
- Web HR/Claude Code 真实路径成功；session `6cf46cd3-8fe2-47c3-ac95-1ae4fa1c5253` 的 turn `3e223df6-553b-4e45-b9b8-3d0c5f6174d6` 为 `succeeded`，artifact 写入 `artifacts/e2e-claude-code.md`，留证于 `workspaces/web-hr-claude-artifact.txt`。
- QA mounted locator 回归通过：`browser/web-qa-mounted-locator.json` 中 mounted URL 明确包含 `workspaceId=d2c5f679-d8d8-4edb-9862-1b79eabf75c9`。
- Worker Configuration 边界通过：HR/QA 均只有 worker-scoped 触发入口和 dialog；raw dialog scan 未发现 `Projection`、`Run projection`、`Workspace scope` 等禁用边界文案。
- Installed-home 抽检通过：`~/.aiworker` 上 `9317` 的 `/health`、`/openapi.json`、`/api/local/settings/engines`、`/api/local/apps` 均有证据。
- Browser 截图曾遇到 CDP `Page.captureScreenshot` timeout；已按任务通过 Playwright fallback 补齐截图和 metadata，例如 `browser/web-claude-screenshot-fallback-metadata.json`、`browser/task9-playwright-capture-metadata.json`。

## 缺陷清单

- P2：HR mounted micro-app 首次加载出现 React hydration mismatch。证据：`browser/web-desktop-console-errors.json`、`browser/web-desktop-shell.snapshot.md`。
- P2：390px narrow 下 HR/QA mounted workspace 与 selected session 的 workbench 多列布局被压缩，QA 主工作区约只剩 43px 可用宽度。证据：`screenshots/web-qa-mounted-narrow.png`、`browser/web-qa-mounted-narrow-deep-overflow-analysis.json`、`screenshots/web-hr-mounted-narrow.png`、`screenshots/web-session-detail-narrow.png`。
- P2：完成的 Claude Code session 历史 transcript 仍显示 `Session running` / `running` chips，容易误导为仍在执行。证据：`browser/web-claude-completed-session.snapshot.md`、`screenshots/web-claude-completed-session.png`、`commands/web-claude-session-summary.json`。
- P2：Worker Configuration 390px narrow dialog 中 selected overlay editor 被挤到右侧，`.gitignore` editor 只剩约 38px 可见条。证据：`screenshots/web-worker-config-narrow.png`、`browser/web-worker-config-narrow.layout.json`、`browser/web-worker-config-narrow-dialog-overflow.json`。

## 优化项

- 本轮未登记 P3 / optimization finding；`findings.md` 中 P3 仍为空。
- 建议后续把 Browser CDP 截图 timeout 的 fallback 记录标准化，避免人工判断截图是否完整。

## 未覆盖项

- 未触发 Task 11：本轮没有 P0/P1 blocker fix，因此没有执行产品代码修复和修复后 focused gate。
- Claude Code 成功后，follow-up textbox 可见且未 disabled，但未继续提交 follow-up turn。
- 未覆盖 Cursor、Gemini、OpenCode、Qwen 等未安装 engine 的真实执行路径。
- 未清理 `~/.aiworker-dev` 或 `~/.aiworker`，证据与运行数据按任务要求保留。

## 后续建议

- 优先修复 narrow mounted workbench / session / Worker Configuration 的 390px 可用性问题，这些已经影响真实移动宽度操作。
- 修复 HR hydration mismatch，避免真实 Web 路径加载时出现 console 产品错误。
- 修复 completed Claude transcript 的历史 running chips，区分 session container active 与 turn succeeded。
- 将 QA locator 的 `workspaceId` 回归加入稳定自动化检查，防止 mounted surface 退回 app-only 定位。

## 证据索引

- 总证据目录：`tmp/real-e2e-regression-2026-05-24/`。
- Baseline：`README.md`，`e2e-env.sh`。
- 最终状态：`commands/final-state.txt`。
- Findings ledger：`findings.md`。
- CLI HR/Codex：`commands/cli-session-start-codex.txt`，`commands/cli-session-list-after-codex.txt`，`workspaces/cli-hr-codex-artifact.txt`。
- Web HR/Claude：`commands/web-claude-session-summary.json`，`workspaces/web-hr-claude-artifact.txt`，`screenshots/web-claude-*.png`。
- QA mounted：`browser/web-qa-mounted-locator.json`，`browser/web-qa-mounted-*.json`，`screenshots/web-qa-mounted-*.png`。
- Worker Configuration：`browser/web-worker-config-task7-summary.json`，`browser/web-hr-worker-config-raw-dialog.json`，`browser/web-qa-worker-config-raw-dialog.json`，`browser/web-worker-config-narrow-dialog-overflow.json`。
- Installed-home：`commands/install-health.json`，`commands/install-openapi.json`，`commands/install-engine-readiness.json`，`commands/install-apps.json`，`commands/install-start.txt`。
- 截图 fallback：`browser/web-claude-submit-screenshot-error.txt`，`browser/web-claude-screenshot-fallback-metadata.json`，`browser/task9-playwright-capture-metadata.json`。

## 审计结论

本轮真实 E2E 回归没有发现 P0/P1；CLI、Web、mounted locator、Worker Configuration 边界和 installed-home 抽检均可完成。未修改产品代码；`code-review-graph` 按规则跳过，因为本轮只新增最终报告文档和 tmp 证据收口，不涉及 production code。
