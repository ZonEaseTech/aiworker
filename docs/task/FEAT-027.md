# FEAT-027 Publish CLIs to npmjs.com (or compiled binaries via GH Releases)

- **status**: pending
- **priority**: P2
- **owner**: (unassigned)
- **createdAt**: 2026-04-27 07:30

## Description

Today the only way to install the CLIs is to clone the repo + `bun install`
+ `bun apps/cli/src/aiw.ts ...`. That's fine for the project itself but
makes onboarding a worker deployer (FEAT-026 OTP path) far harder than
necessary — they have to:

1. Install bun
2. Clone the repo (and have GH access)
3. `bun install` (~1000 packages)
4. Memorise full `bun apps/cli/src/aiw.ts ...` paths

Goal: make it possible to install the worker CLI in one step:

```sh
# any one of (final shape TBD):
bunx @aiworker/cli aiw serve
npm install -g @aiworker/cli && aiw serve
curl -fsSL https://github.com/.../releases/.../aiw -o /usr/local/bin/aiw && chmod +x /usr/local/bin/aiw
```

### Acceptance criteria

1. `apps/cli` published to npmjs.com (or equivalent) under
   `@aiworker/cli` (or whatever name FEAT-028 settles on); both binaries
   (`aiw` + `aim` — or rebranded names — exposed via `bin` map).
2. Version bump strategy documented (semver; tied to git tag releases).
3. CHANGELOG entries auto-generated from `docs/changelog.md` PLAN/BUG
   entries since last release.
4. GH Actions workflow `release.yml`:
   - Triggered on tag `v*`
   - Steps: `bun install` → `bun run typecheck && test` → `npm publish`
     with NPM_TOKEN secret
   - Optional: `bun build --compile` produces standalone single-file
     binaries for linux-x64 / linux-arm64 / darwin-x64 / darwin-arm64,
     attached to GH Release
5. README.md install section updated to use the published artifact
   instead of "git clone + bun install"
6. systemd unit template (`aim install systemd`) updated to point at the
   installed binary path (no longer `bun apps/cli/src/aim.ts ...`)
7. Migration guide for current users (everyone is local clone today)

### Out of scope (later)

- Homebrew tap
- Debian / RPM packages
- Bundling agent CLIs (claude-code etc.) into the binary

## ActiveForm

Publishing CLI to npmjs / GH Releases

## Dependencies

- **blocked by**: FEAT-028 (binary name decided first; otherwise we have
  to publish twice)
- **blocks**: README.md install section future-proofing; widespread
  external worker deployer adoption

## Notes

- GH Actions billing is still out (per session 2026-04-26). Either
  resolve billing first, or run release workflow on a self-hosted
  runner.
- npm scope `@aiworker` may already be taken — check and reserve early.
- `bun publish` is now production-ready and avoids the npm CLI; pick
  one and stick with it.
