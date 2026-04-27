# FEAT-030 Zero-env-quickstart: dynamic CLI version + new default ports + first-run master-key auto-mint

- **status**: completed
- **priority**: P1
- **owner**: self
- **createdAt**: 2026-04-27 09:55
- **completedAt**: 2026-04-27 10:10
- **commits**: 853374d

## Description

Three coupled UX improvements driven by user feedback after the first
npm publish (`@zonease/aiworker-cli@0.1.0`):

1. **Dynamic CLI version**: `cli.version('0.3.0')` is hard-coded in
   `apps/cli/src/aiworker.ts`; published binary printed mismatched
   version (`aiworker/0.3.0` vs npm package `0.1.0`). Should read
   `package.json` at runtime.
2. **New default ports**: rotate worker `3001` → **`9217`** and gateway
   `3000` → **`9218`** to avoid collision with common dev defaults
   (Vite/Next/etc. squat on 3000-3001).
3. **Zero-env quickstart**: today a worker deployer must `export
   AIWORKER_MASTER_KEY=$(openssl rand -hex 32)` before `aiworker init`.
   This is friction. CLI should auto-mint on first run and persist to
   `~/.aiworker/.env` (chmod 600) — pattern matches `gh auth login` /
   `git config --global` first-run UX.

### Acceptance criteria

1. `aiworker --version` prints version from `apps/cli/package.json`,
   matching the npm-published version.
2. `aiworker --version` works equivalently in:
   - `bun apps/cli/src/aiworker.ts --version` (dev)
   - `bun apps/cli/dist/aiworker.js --version` (bundled)
   - `npm install -g @zonease/aiworker-cli && aiworker --version`
3. Worker default port = `9217` (no env set). `apps/cli/src/commands/serve.ts` + `packages/core/src/config/worker.ts` `PORT` default updated.
4. Gateway default port = `9218`. `apps/gateway/src/config.ts` `AIWORKER_GATEWAY_PORT` default updated.
5. `ops/caddy/Caddyfile.tmpl` `reverse_proxy` target updated to `:9218`.
6. Existing deployments (production / test server) **not affected**: explicit env (`AIWORKER_GATEWAY_PORT=3000` in `/etc/aiworker/gateway.env`) overrides default; no operational migration needed.
7. First-run `aiworker init` (or `aiworker serve` / `aiworker gateway start` if `init` not yet run) detects missing `~/.aiworker/.env`:
   - Auto-mints `AIWORKER_MASTER_KEY` (64 hex via `openssl rand`-equivalent)
   - Auto-mints `INTERNAL_SHARED_SECRET` (24 hex byte ≥48 chars)
   - Writes both to `~/.aiworker/.env` with mode `0600`
   - Prints master key **once** to stderr with a backup warning
   - Subsequent commands silently load `~/.aiworker/.env` into `process.env` (only fills missing vars; explicit env wins)
8. Existing user with `~/.aiworker/.env` already populated: no overwrite, silent load.
9. README.md Quickstart simplified — only `AIWORKER_GATEWAY_URL` (and optional `AIWORKER_DISPLAY_NAME`) remain user-required.
10. `npm publish` `0.2.0` with these UX improvements (minor bump because user-facing default behaviour changes).

## ActiveForm

Implementing zero-env quickstart UX improvements

## Dependencies

- **blocked by**: (none — pure UX layer)
- **blocks**: better worker-deployer onboarding documentation

## Notes

- Port 9217 / 9218: not in IANA well-known list; chose 9xxx to stay
  out of common dev squat range (3000-3999, 5000-5999, 8000-8999).
- First-run mint pattern: secret lives in `~/.aiworker/.env` only.
  CLI prints master key once to stderr (so `tee` capture works for
  scripting). User must manually back up — file loss = fleet.db
  unrecoverable, same hard constraint as today.
- `INTERNAL_SHARED_SECRET` mint: only used by gateway; worker doesn't
  need it. But minting both at first-run keeps state file flat and
  symmetric. Operator running `aiworker gateway start` reuses same env
  file.
- Implementation: small `~/.aiworker/.env` loader in
  `apps/cli/src/aiworker.ts` entry, before `cli.parse()`. Helper in
  `packages/core/src/config/dotenv.ts` (new). Bun has built-in `.env`
  parsing (`Bun.env`) but we need explicit dotenv path support →
  custom 30-LOC parser.
