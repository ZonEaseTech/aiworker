# FEAT-028 CLI naming redesign (aiw / aim too cryptic)

- **status**: completed
- **priority**: P1
- **completedAt**: 2026-04-27 08:55
- **owner**: (unassigned)
- **createdAt**: 2026-04-27 07:30
- **decided**: 2026-04-27 07:35 — 方案 B + binary 名 `aiworker` + npm 包 `@zonease/aiworker-cli`；no backwards-compat shim（用户明确不需要：aiw/aim 从未发布过）

## Description

Current bin names `aiw` (worker side) and `aim` (operator side) are
cryptic abbreviations of "AI worker" / "AI manage". Two issues:

1. **Discoverability**: a new operator reading docs has to memorise two
   3-letter strings whose distinction is non-obvious (`m` vs `w`).
2. **Typo sensitivity**: `aiw` and `aim` differ by 1 character → easy
   to type the wrong one + run an unintended command.
3. **`aim` collides** with the [popular text editor](https://github.com/Aircoookie/AIM-Anki)
   and several other niche tools — `which aim` ambiguity in shared
   environments.

Now is the right time to rebrand: FEAT-027 (npm publish) hasn't shipped
yet, so we can change names before they're locked into install
instructions, systemd templates, GH Releases asset names, etc.

### Acceptance criteria

1. New names settled across:
   - `apps/cli/package.json` `bin` map
   - `apps/cli/src/{aiw,aim}.ts` source file names (or just keep file
     names, change export names)
   - All commits / docs / changelog references (CLAUDE.md, all `docs/`
     files, all `BUG-*.md` / `FEAT-*.md` / `PLAN-*.md` historical
     references stay as-is — only forward-looking docs change)
   - systemd unit template `aim install systemd`
   - `~/.aiworker/aim.json` filename — or rename the state file too
   - README.md
2. **No backwards-compat shim** — `aiw.ts` / `aim.ts` files removed
   entirely; `apps/cli/package.json` only exposes `aiworker` bin
   (decision 2026-04-27: never published, clean break).
3. `bun run typecheck && test` clean.
4. Smoke: full PLAN-019 OTP e2e using new names.

### Candidate name sets — pick one

#### A. `aiwork` + `aifleet` (verbose, role-clear)

- Pros: spells out role (one runs the work, one manages the fleet)
- Cons: 6-7 char each; longer than current; no convention

#### B. Single binary `aiworker` + subcommand split (Cargo / git style)

- `aiworker serve / init / config-set / ...` (was `aiw ...`)
- `aiworker fleet list / chat / approve / pair / ...` (was `aim ...`)
- Pros: one binary in $PATH; mental model "aiworker is THE tool"
- Cons: command lines get longer; have to invent a non-confusing
  top-level subcommand split (`serve` vs `fleet`?)

#### C. `aiw` + `fleet` (keep aiw — it's the worker side; rename only operator)

- Pros: minimal disruption; `fleet` is descriptive on its own
- Cons: `fleet` may collide with Mozilla project / TerminusDB CLI / other
  tools; doesn't fix the `aiw` cryptic problem

#### D. `aiworkerd` (worker daemon) + `fleetctl` (operator) — k8s style

- Pros: industry-familiar pattern (`kubectl` / `etcdctl` / `consul-ctl`)
- Cons: `fleetctl` was the name of CoreOS's deprecated tool — collision

#### E. `worker` + `fleet` — short, but dangerous

- Pros: shortest possible
- Cons: too generic; `worker` is in many other projects; high collision

#### F. `agent` + `agentctl` — agent-runtime industry term

- Pros: matches the actual product positioning ("Agent Runtime"); short
- Cons: `agent` is also generic; collides with ssh-agent, a thousand
  AI/agent CLIs in 2025

### LOCKED: **B (`aiworker` single binary)** — user-approved 2026-04-27 07:35

- Single binary keeps `$PATH` clean.
- "aiworker is THE tool" is good marketing alignment with the project name.
- Subcommand split:
  - `aiworker serve / init / run / config-show / config-set / token-rotate / approvals-* / schedule-*`
    — what `aiw` does today
  - `aiworker fleet list / info / launch / stop / remove`
    — what `aim workers ...` does today
  - `aiworker pair / chat / config get/set / token rotate / approvals list/grant / schedule list/add/remove / enroll list/approve/reject / logs / install systemd`
    — what `aim ...` does today
- Implementation: replace `aiw.ts` + `aim.ts` with single `aiworker.ts`
  entry that registers all subcommands via cac. The two existing files
  can either be deleted or kept as internal modules imported by
  `aiworker.ts` (whichever keeps cac registration cleaner — likely
  collapse to one file given cac top-level command count is moderate).
- **No backwards-compat** (decision 2026-04-27): `aiw` / `aim` are not
  in `bin` map of any published artifact, so dropping them costs zero
  downstream users.
- npm package name: `@zonease/aiworker-cli` (FEAT-027). `bin` entry:
  `aiworker`. Install + use:
  ```
  npm install -g @zonease/aiworker-cli
  aiworker serve --port 3001
  aiworker fleet list
  aiworker chat <workerId> 'hello'
  ```

## ActiveForm

Redesigning CLI names

## Dependencies

- **blocked by**: (none — pure design + refactor)
- **blocks**: FEAT-027 (don't publish under one name then rename)

## Notes

- Whatever names land, `apps/cli/package.json` `bin` map is the only
  hard blocker — npm install -g will install whatever bin entries
  declare.
- File names inside `apps/cli/src/` can stay if they're stable —
  consumers only see the bin names.
- This task does NOT touch any business logic — it's purely entry-point
  + docs + tests + systemd unit text.
- Coordinator should sweep the entire repo for hardcoded `aiw ` /
  `aim ` strings (with trailing space to avoid false positives in
  comments) before declaring done.
- ⚠️ **Historical docs do not change** — `BUG-NNN.md` / `FEAT-NNN.md`
  / `PLAN-NNN.md` / `docs/changelog.md` 内出现的 `aiw` / `aim`
  references 留作历史记录，只改"forward-looking"文档（README.md /
  architecture.md / cli.md / deployment.md / CLAUDE.md）。
