# REFACTOR-032 Add local worker daemon lifecycle commands

- **status**: completed
- **priority**: P1
- **owner**: local
- **createdAt**: 2026-05-09 18:13
- **claimedAt**: 2026-05-09 18:13
- **completedAt**: 2026-05-09 18:23
- **plan**: PLAN-198
- **relatesTo**: REFACTOR-026, PLAN-192, apps/cli/src/commands/worker/up.ts, apps/cli/src/commands/worker/serve.ts, apps/cli/src/aiworker.ts

## 背景

S1 已经让 CLI run 默认走本地 daemon run contract；S3 已经让 init 物化 OD-style
worker pack 资产。但 operator 仍然需要理解 `up` / `serve` / `run` 的关系：

- `serve` 是前台 worker HTTP/Admin 进程；
- `up` 是初始化、验证、启动前台 `serve` 的快捷路径；
- 只有 gateway 有 detached PID/log lifecycle；
- worker 只有 `serve --pid-file`，没有一组本地 daemon status / logs / check 命令。

这不符合 OD-style local-first daemon 体验，也让 `aiworker run` 的默认 daemon 依赖缺少
一条清晰启动路径。

## 目标

1. 增加本地 worker daemon lifecycle commands：
   - `aiworker daemon start/status/stop/logs/check/inspect`
   - `aiworker worker daemon start/status/stop/logs/check/inspect`
2. `daemon start` 复用现有 `up`，以 detached child process 启动，不重写 worker server。
3. daemon state 写在 active `AIWORKER_HOME` 下，包含 pid、log、port、host、cwd 和启动参数。
4. `daemon check` 基于 state 对 `/health` 做 HTTP 检查。
5. `daemon logs` 支持读取最近 N 行 log。
6. `up` 支持 `--pack`，使 `daemon start --soul ... --pack ...` 可创建 brand-new project。
7. root help / command index 展示 start / status / logs / check / inspect。

## 非目标

- 不实现 systemd install。
- 不实现 log follow。
- 不替换 foreground `serve`。
- 不重新实现 process supervisor 或 crash restart。
- 不触碰 gateway lifecycle。

## 验收标准

- command registration / help 覆盖 root 和 canonical worker daemon commands。
- `daemon start` 写入 pid、log 和 metadata；重复 start 被拒绝。
- `daemon status` 能识别 running / stopped，并清理 stale pid。
- `daemon check` 在 running 时检查 `/health`，未运行时返回非零。
- `daemon stop` 能停止 detached worker 进程。
- focused CLI tests、typecheck、diff check 和 CRG 审查通过。

## 实现记录

- 新增本地 worker daemon lifecycle：
  - `aiworker daemon start/status/stop/logs/check/inspect`
  - `aiworker worker daemon start/status/stop/logs/check/inspect`
- `daemon start` 复用 `up` / `init` / `serve`，以 detached child process 启动本地
  worker，并写入 active scope home 下的 pid、log 和 metadata。
- metadata 记录 pid、port、host、cwd、healthUrl、scope、home、projectRoot 和启动参数。
- `daemon check` 基于 metadata 检查 `/health`。
- `daemon logs` 支持 `--tail` 读取最近日志。
- `up` 增加 `--pack` 并透传给 `init`，便于 daemon first-run 创建 worker pack。
- daemon 命令加入 CLI help、command index、argv preprocess 和 dotenv bootstrap
  no-op 列表。

## 验证

- `bun run --filter '@zonease/aiworker-cli' test -- src/commands/worker/daemon.test.ts src/commands/worker/up.test.ts src/lib/bootstrap.test.ts src/aiworker.test.ts`
  passed: 59 pass / 0 fail。
- `bun run --filter '@zonease/aiworker-cli' typecheck` passed。
- `git diff --check` passed。
- CRG passed: `detect-changes` risk 0.40, 0 affected flows；static gaps 指向
  command registration 与 test helper，已由 CLI registration/help、bootstrap、真实
  detached daemon lifecycle test 覆盖。
