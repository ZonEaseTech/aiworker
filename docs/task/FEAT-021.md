# FEAT-021 Bake Cursor agent into the full image (optional)

- **status**: pending
- **priority**: P3
- **owner**: (unassigned)
- **createdAt**: 2026-04-23 06:05

## Description

Cursor agent has no npm package — the official install is a curl-to-bash
script (`curl https://cursor.com/install-agent | bash`) that drops a
`cursor-agent` binary in `~/.local/bin/`. Adding it to the `-full` image
from FEAT-020 requires an extra Dockerfile stage that runs the installer
at build time, verifies glibc compatibility against the `oven/bun:1-debian`
base, and normalises the install path into `/usr/local/bin/cursor-agent`
so it's on PATH for the worker process.

This FEAT is explicitly marked P3: only pursue if a user asks for Cursor
coverage, or if FEAT-020 ships cleanly and a tiny increment is desired.
Closing this task without shipping is a legitimate outcome.

Acceptance:

- Dockerfile's `runtime-full` stage runs the cursor installer and exits
  non-zero if the binary fails `--version` at build time (so broken
  installers break the image build, not production).
- Binary ends up on PATH at `/usr/local/bin/cursor-agent`.
- `docs/executor-engines.md#cursor` is updated: "shipped in `-full` image
  from FEAT-021 onwards, `--version` runs at image build as a sanity
  check".
- `availability.ts` cursor probe keeps working unchanged (PATH lookup +
  auth file mtime).
- Image size growth documented in `docs/deployment.md`.

Explicitly out of scope:

- Multi-arch installer compat (cursor-agent only ships amd64 + arm64
  macOS today; treat arm64 Linux as future work).
- Auth bootstrap.

## ActiveForm

Adding the cursor-agent installer to the full image.

## Dependencies

- **blocked by**: FEAT-020 (`runtime-full` stage must exist first)
- **blocks**: (none)

## Notes

- Related plan: `docs/plan/PLAN-009.md`.
- Because the Cursor installer hits the network at build time, CI failures
  are a real concern. Cache the installed binary into buildx cache or
  fallback to a committed installer script.
