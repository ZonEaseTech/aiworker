# TODO-015 `aiworker doctor` emits noisy `[info] skills.empty` and `WARN executor.capability_manifest_empty` on first-run defaults

- **status**: pending
- **priority**: P3
- **owner**: unassigned
- **createdAt**: 2026-05-04 22:10
- **discoveredAt**: 2026-05-04 21:18
- **plan**: TBD
- **relatesTo**: doctor / first-run UX

## Observed Behavior

Right after `aiworker init --soul developer` (default state, no skills, no overlay), running:

```bash
aiworker doctor
```

emits:

```
PASS    skills/
  - [info] skills.empty skills: No skill files are configured yet.
```

and

```bash
aiworker executor doctor --engine claude-code
```

emits:

```
WARN    declared project executor overlay entries: 0
   - [warning] executor.capability_manifest_empty executor-capabilities.json: No project executor overlay entries are declared.
   - [warning] executor.mcp_empty engines.claude-code.mcp: No enabled executor MCP servers are declared for claude-code.
```

Both messages fire on fresh-init defaults where the user did nothing wrong. New operators have to scan a page of mixed PASS / INFO / WARN to figure out whether the project is healthy; INFO/WARN look like errors at a glance.

Compounded by AIWorker's deliberate naming overload — "skill" appears at brain-skill (`.aiworker/skills/`), executor MCP overlay, and engine plugin layers. The doctor message says "No skill files" without disambiguating which.

## Why this matters

- First-run UX heavily influences whether users continue past hello-world. Mixed-color noise undermines confidence
- The fix is purely text/heuristic — actual checks are correct, they just need different output classes
- Aligns with AGENTS.md "CLI、API、DB schema、文档里出现 `mcp`、`skill`、`plugin` 等重名概念时必须显式加限定词"

## Expected Behavior

A. **doctor summary line**: emit a top status line summarizing pass/warn/error counts, e.g.,

```
[aiworker doctor] OK — 8 checks PASS · 0 WARN · 0 ERR (fresh-init defaults)
```

B. **silence info on default state**: if the project state matches a known clean default (no skills, no overlay, no schedule, etc.), do **not** emit `[info] X.empty` messages; if the user explicitly declared skills/overlay but they're empty, then emit a more specific `[warning] X declared but missing`

C. **disambiguate skill messages**: prefix every "skill" message with the layer:

```
- [info] brain-skills.empty .aiworker/skills/: No brain skill files configured (optional). See `aiworker brain skills add --help` for adding one.
```

vs:

```
- [warning] executor-overlay.mcp.empty engines.claude-code.mcp: No executor MCP overlay entries declared (optional unless you need project-pinned MCP).
```

## Reproducer

```bash
mkdir /tmp/proj-fresh && cd /tmp/proj-fresh
aiworker init --soul developer

aiworker doctor 2>&1 | grep -E '\[info\]|WARN|PASS|FAIL'
aiworker executor doctor --engine claude-code 2>&1 | grep -E '\[warning\]|WARN|PASS|FAIL'
```

## Validation

After fix, fresh-init project's `aiworker doctor` and `aiworker executor doctor` should emit no INFO / WARN noise, and skill / overlay disambiguation messages must explicitly say "brain skill" or "executor overlay" not bare "skill".

## Evidence

`/home/ben/projects/debug-aiworker/qa-2026-05-04-v0.7.0/findings/UX-2-empty-skills-dir-warn-noise.md`
