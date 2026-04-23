# FEAT-021 Bake Cursor agent into the full image (optional)

- **status**: completed
- **priority**: P3
- **owner**: BKD subtask s306n1zj
- **createdAt**: 2026-04-23 06:05
- **completedAt**: 2026-04-23 08:56

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

### Implementation notes (2026-04-23 08:56)

Landed as `bkd/s306n1zj` commit `2dae80a`, merged to main in `7928639`.
GHCR double-tag build `24826143375` passed in 3m41s (slim cached → only
the full stage paid the cursor curl fetch), with `cursor-agent --version`
as the build-time sanity gate.

Key design decisions the subtask made:

1. **Installer URL correction** — the task prompt suggested `cursor.com/install-agent`, which returned 404 in real tests. The actual endpoint is `cursor.com/install`. Subtask committed the corrected URL.
2. **Bash wrapper + symlink over copy** — `cursor-agent` is a bash wrapper that resolves its sibling `node` binary via `realpath $0`. Copying the single file to `/usr/local/bin/` breaks path resolution. Solution: `ln -sf "$(readlink -f /root/.local/bin/cursor-agent)" /usr/local/bin/cursor-agent`, so `/usr/local/bin/cursor-agent` points at the versioned binary under `/root/.local/share/cursor-agent/versions/<ver>/`, and realpath traversal still finds the sibling `node`.
3. **`bash -euo pipefail -c '...'`** wrapping the `curl | bash` so a CDN failure on the curl side of the pipe fails the RUN instead of silently executing empty stdin (dash's default behaviour).
4. **glibc compatibility confirmed** — `oven/bun:1-debian` is based on Debian trixie (glibc 2.41); cursor requires 2.28+. No libc compatibility work needed.

Remaining items:

- P3: image size estimate of `~320 MB` in docs is a rough guess (curl tarball ~64 MB, unpacked ~130 MB node binary + JS assets). After a merge-time GHCR build, the actual layer size can be measured and docs updated.
- P2: the cursor tarball includes a bundled Node.js runtime, not shared with bun — this is wasteful but unavoidable given cursor's distribution model. Multi-arch support beyond amd64 is out of scope.

Verification (coordinator-run after merge):

- `bun run typecheck` — shared / api / web all green.
- `bun test` — shared 18 / api 429 / web 37.
- `bun run lint` — 0 errors.
- GHCR double-tag build `24826143375` → slim and `-full` both published; `cursor-agent --version` gate passed.
