# AIWorker - Plan Index

> Updated: 2026-04-21

## Usage

Each plan is a single line linking to its detail file. All detailed information lives in `docs/plan/PLAN-NNN.md`.

### Format

- [ ] [**PLAN-001 Short plan title**](PLAN-001.md) `YYYY-MM-DD`

### Status Markers

| Marker | Meaning |
|--------|---------|
| `[ ]`  | Draft / Pending review |
| `[-]`  | Approved / Implementing |
| `[x]`  | Completed |
| `[~]`  | Rejected / Abandoned |

### Rules

- Only update the checkbox marker; never delete the line.
- New plans append to the end.
- See each `PLAN-NNN.md` for full details.

---

## Plans

- [x] [**PLAN-001 AIWorker product build — monorepo scaffold and core modules**](PLAN-001.md) `2026-04-20`
- [x] [**PLAN-002 Refactor AIWorker into self-hosted Agent Runtime**](PLAN-002.md) `2026-04-20`
- [x] [**PLAN-003 Refactor AIWorker into multi-worker fleet runtime**](PLAN-003.md) `2026-04-21`
- [x] [**PLAN-004 Self-sufficient worker + manager-as-registry**](PLAN-004.md) `2026-04-21`
- [x] [**PLAN-005 aissh-driven fleet deployment automation**](PLAN-005.md) `2026-04-21`
