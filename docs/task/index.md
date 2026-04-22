# AIWorker - Task List

> Updated: 2026-04-22

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
