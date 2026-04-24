# AIWorker - Task List

> Updated: 2026-04-23 09:55

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
