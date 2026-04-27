# FEAT-029 License decision + LICENSE file + 9 package.json `license` fields

- **status**: completed
- **priority**: P1
- **owner**: self
- **createdAt**: 2026-04-27 09:10
- **completedAt**: 2026-04-27 09:15
- **decision**: MIT (user-approved 2026-04-27 09:12)
- **commits**: (this commit)

## Description

All 9 `package.json` files currently declare `"license": "UNLICENSED"`.
This blocks `bun publish` (or `npm publish`) of `@zonease/aiworker-cli`
to the **public** npm registry — npm warns aggressively, downstream
consumers don't know the legal terms, and many security scanners flag
UNLICENSED public packages as unsafe.

Per FEAT-027 §Research Findings, the prerequisite checklist explicitly
calls this out:

> Decide license + write LICENSE file + update 9 package.json `license`
> field — FEAT-029 follow-up.

This task is a **decision task first, mechanical change second**:

### Acceptance criteria

1. License chosen from one of:
   - **MIT** — most permissive, no patent grant (default for most npm
     packages)
   - **Apache-2.0** — permissive + explicit patent grant + NOTICE file
     requirement (recommended for projects that touch ML / cryptography)
   - **BSD-3-Clause** — permissive, no patent grant, "no endorsement"
     clause
   - **Proprietary / source-available** (e.g. BSL, Elastic License v2,
     SSPL) — restricts commercial reuse; rules out npm public publish in
     practice
2. `LICENSE` file written at repo root with chosen license text.
3. All 9 `package.json` `license` fields updated to chosen SPDX
   identifier (e.g. `"MIT"` not `"UNLICENSED"`).
4. `apps/cli/scripts/build-publish-manifest.ts` carries the `license`
   into `dist/package.json`.
5. README.md adds a `## License` section pointing at LICENSE.
6. CONTRIBUTING.md (if exists or will be created) restates that
   contributions are accepted under the same license.
7. CHANGELOG entry under `[decision]` tag noting the choice + rationale.

### Decision factors to weigh

- **Goal**: maximise adoption (worker fleet runtime is plumbing —
  permissive is a fit), or constrain commercial fork (then BSL/SSPL).
- **Anthropic / Claude SDK constraints**: project depends on official
  SDKs. Their licenses are MIT (most), so MIT compatibility is fine.
- **Patent exposure**: agentic tool calls + WS protocol have no novel
  patentable surface; Apache-2.0's patent grant is helpful but MIT is
  enough for ZonEaseTech's stated intent (open source agent runtime).
- **Author preference**: ZonEase tech orientation — needs explicit
  user decision.

### Out of scope

- Multi-license dual licensing (e.g. AGPL + commercial) — a deeper
  business decision, separate task if needed.
- License compliance scanning of dependencies (each existing
  `node_modules` package is governed by its own license; that's a
  separate review).

## ActiveForm

Deciding license + writing LICENSE + updating 9 package.json

## Dependencies

- **blocked by**: user decision (which license)
- **blocks**: FEAT-027 first npm publish (UNLICENSED warns / scares
  consumers)

## Notes

- Recommended default: **MIT**. Aligns with project ethos (open agent
  runtime), zero-friction adoption, and Anthropic SDK / most npm peer
  conventions.
- Apache-2.0 is the safer choice if patent exposure is a concern — but
  for fleet-management tooling it's overkill.
- **Avoid** `UNLICENSED` for the published artifact even if the repo
  itself is "private code released for visibility" — npm public
  registry expects a real license.
- Once chosen, LICENSE file is a `cp` from the canonical text
  (e.g. https://opensource.org/licenses/MIT). Replace `[year]` with
  `2026` and `[fullname]` with `ZonEase Tech` (or final org name).
