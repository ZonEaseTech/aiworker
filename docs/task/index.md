# AIWorker - Task List

> Updated: 2026-04-27 06:40

## Usage

Each task is a single line linking to its detail file. All detailed information lives in `docs/task/PREFIX-NNN.md`.

### Format

- [ ] [**PREFIX-001 Short imperative title**](PREFIX-001.md) `P1`

### Status Markers

| Marker | Meaning |
|--------|---------|
| `[ ]`  | Pending |
| `[-]`  | In progress |
| `[x]`  | Completed |
| `[~]`  | Closed / Won't do |

### Priority: P0 (blocking) > P1 (high) > P2 (medium) > P3 (low)

### Rules

- Only update the checkbox marker; never delete the line.
- New tasks append to the end.
- See each `PREFIX-NNN.md` for full details.

---

## Tasks

- [x] [**FEAT-001 Build AIWorker middleware product**](FEAT-001.md) `P1`
- [x] [**REFACTOR-001 Refactor AIWorker into a self-hosted Agent Runtime**](REFACTOR-001.md) `P1`
- [x] [**REFACTOR-002 Refactor AIWorker into a multi-worker fleet runtime**](REFACTOR-002.md) `P1`
- [ ] [**FEAT-002 Executable skills runtime (sandbox)**](FEAT-002.md) `P3`
- [x] [**FEAT-003 Telegram channel adapter**](FEAT-003.md) `P2`
- [x] [**FEAT-004 Lark channel adapter**](FEAT-004.md) `P2`
- [x] [**FEAT-005 WhatsApp channel adapter (Meta Cloud API)**](FEAT-005.md) `P2`
- [x] [**FEAT-006 Evolution generator (Hermes-style skill self-learning)**](FEAT-006.md) `P2`
- [ ] [**FEAT-007 M:1 channel routing (multiple workers, one chat)**](FEAT-007.md) `P3`
- [ ] [**FEAT-008 Host-level HA and multi-host fleet**](FEAT-008.md) `P3`
- [x] [**FEAT-009 Deployment automation (aissh-driven fleet deploy)**](FEAT-009.md) `P1`
- [ ] [**FEAT-010 Publish registry routes into OpenAPI spec**](FEAT-010.md) `P3`
- [x] [**FEAT-011 Normalize AgentEvent schema and refactor OpenAI-compat executor**](FEAT-011.md) `P1`
- [x] [**FEAT-012 Claude Code executor with git worktree workspace**](FEAT-012.md) `P1`
- [x] [**FEAT-013 ACP harness plus Gemini and Qwen adapters**](FEAT-013.md) `P1`
- [x] [**FEAT-014 Three-tier ExecutorConfig and frontend picker**](FEAT-014.md) `P1`
- [x] [**FEAT-015 Process manager replacing AsyncQueue**](FEAT-015.md) `P2`
- [x] [**FEAT-016 Codex and Cursor agent adapters (optional)**](FEAT-016.md) `P3`
- [x] [**FEAT-017 Register worker UX improvements**](FEAT-017.md) `P1`
- [x] [**FEAT-018 Engine availability discovery**](FEAT-018.md) `P1`
- [x] [**FEAT-019 Model picker with known-model catalog per engine**](FEAT-019.md) `P1`
- [x] [**FEAT-020 Bake npm agentic CLIs into the worker image**](FEAT-020.md) `P1`
- [x] [**FEAT-021 Bake Cursor agent into the full image (optional)**](FEAT-021.md) `P3`
- [x] [**FEAT-022 Auth mount recipe + Register dialog hint**](FEAT-022.md) `P2`
- [x] [**FEAT-023 Manager-driven worker creation**](FEAT-023.md) `P1`
- [x] [**REFACTOR-003 CLI-first lightweight runtime (aiw / aim / gateway)**](REFACTOR-003.md) `P1`
- [x] [**BUG-001 Decouple dev defaults for WORKER_DATA_ROOT and WORKER_MIGRATIONS_FOLDER**](BUG-001.md) `P1`
- [x] [**BUG-002 aim pair must persist gatewayUrl to aim.json**](BUG-002.md) `P1`
- [x] [**BUG-003 Wire config.put handler in aiw serve gateway-client**](BUG-003.md) `P2`
- [x] [**BUG-004 Refresh gateway-client subscriber after runtime hot-reload**](BUG-004.md) `P1`
- [x] [**BUG-005 aiw run waits for orchestrator.task.* but runtime emits orchestrator.finished**](BUG-005.md) `P2`
- [ ] [**BUG-006 Make reloadRuntime serialisation explicit (in-process mutex)**](BUG-006.md) `P3`
- [x] [**BUG-007 Public Caddy ingress bypasses gateway authN (loopback misidentification)**](BUG-007.md) `P0`
- [x] [**FEAT-024 Worker self-enrollment via shared join token**](FEAT-024.md) `P2`
- [x] [**BUG-008 workerSummarySchema rejects self-enrolled worker (empty baseUrl)**](BUG-008.md) `P1`
- [x] [**FEAT-026 Worker OTP-attended enrollment (operator-approved join)**](FEAT-026.md) `P2`
- [x] [**BUG-009 OTP approve does not upgrade ws to NodeRegistry**](BUG-009.md) `P1`
- [x] [**FEAT-027 Publish CLIs to npmjs.com (or compiled binaries via GH Releases)**](FEAT-027.md) `P2`
- [x] [**FEAT-028 CLI naming redesign (aiw / aim too cryptic)**](FEAT-028.md) `P2`
- [ ] [**BUG-010 Runtime log strings still reference `aiw` / `aim` / `aim.json` after PLAN-020 rename**](BUG-010.md) `P3`
- [x] [**FEAT-030 Zero-env-quickstart: dynamic CLI version + new default ports + first-run master-key auto-mint**](FEAT-030.md) `P1`
- [x] [**FEAT-029 License decision + LICENSE file + 9 package.json `license` fields**](FEAT-029.md) `P1`
- [x] [**BUG-011 Worker quickstart 仍要求显式 WORKER_DB_PATH / WORKER_MIGRATIONS_FOLDER（与 FEAT-030 README 承诺不符）**](BUG-011.md) `P3`
- [x] [**REFACTOR-004 测试服部署迁移：源码 systemd → 已发布 npm cli + `aiworker install systemd`**](REFACTOR-004.md) `P1`
- [x] [**BUG-012 `aiworker gateway start` 在 npm install 场景下不能启动（仓库布局假设）**](BUG-012.md) `P1`
- [ ] [**BUG-013 `workers.info` / `workers.stop` 在 node-side dispatcher 显式 stub `method_not_implemented`**](BUG-013.md) `P2`
- [ ] [**BUG-014 `aiworker install systemd` 渲染的 unit 缺 `EnvironmentFile` + 全部安全加固**](BUG-014.md) `P2`
- [x] [**BUG-017 Lark verificationToken + WhatsApp verifyToken 非常量时间比较**](BUG-017.md) `P0`
- [x] [**BUG-019 Gateway loopback bypass fail-closed 启动断言**](BUG-019.md) `P1`
- [x] [**BUG-020 gateway WebSocket maxPayloadLength + idleTimeout + connect 限频**](BUG-020.md) `P1`
- [x] [**REFACTOR-006 orchestrator API 入参 zod 校验 + 历史消息分页窗口**](REFACTOR-006.md) `P2`
- [x] [**REFACTOR-007 杂项小修：bus 异常吞 / lark cache / fleet count / secrets key**](REFACTOR-007.md) `P2`
