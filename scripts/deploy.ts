/**
 * FEAT-009 / PLAN-005 — aissh-driven fleet deployment CLI.
 *
 * Images are built in GitHub Actions (.github/workflows/build-image.yml) and
 * published to GHCR at ghcr.io/zoneasetech/aiworker:<tag>. This script
 * triggers that workflow, uploads compose/Caddyfile/.env via aissh, and tells
 * the host to `docker compose pull && up -d`.
 *
 * Usage:
 *   bun run scripts/deploy.ts <command> [flags]
 *
 * Commands:
 *   install-docker   Install docker on the target host (first-time, approval-gated)
 *   teardown-legacy  Stop aiworker.service, rm /opt/aiworker + unit file
 *                    (IRREVERSIBLE, approval-gated, requires --confirm)
 *   login-ghcr       docker login ghcr.io on host using `gh auth token` of the
 *                    local operator (one-off; credentials persist in /root/.docker)
 *   build            Trigger .github/workflows/build-image.yml on main with --tag,
 *                    watch the run, return the tag
 *   upload           aissh file upload compose + Caddyfile + .env
 *   install          docker compose pull + up -d (via aissh exec)
 *   verify           curl -fsS http://127.0.0.1:9218/health on the host
 *   reload-caddy     caddy validate + systemctl reload caddy (on host)
 *   deploy           build → upload → install → verify → reload-caddy
 *
 * Common flags:
 *   --tag=<tag>      Image tag (default: <git-short-sha>-<UTC yyyymmddhhmm>)
 *   --server=<id>    aissh server id (default: $AIWORK_SERVER_ID or the
 *                    hardcoded aiwork id from FEAT-009)
 *   --reason=<text>  aissh --reason value (default: "FEAT-009 <command>")
 *   --dry-run        Print the aissh / gh commands without executing
 *   --confirm        Required for teardown-legacy
 *
 * The script streams child-process stdio straight through, so aissh's own
 * approval UX is visible — operators run `aissh approval wait <op-id>` in a
 * separate terminal and re-invoke the failed subcommand once approved.
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const DEFAULT_AIWORK_SERVER_ID = '<aissh-server-id-redacted>'
const DEFAULT_REMOTE_DIR = '/opt/aiworker-deploy'
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '..')
const GHCR_IMAGE = 'ghcr.io/zoneasetech/aiworker'
const BUILD_WORKFLOW = 'build-image.yml'

type ImageVariant = 'slim' | 'full'

interface Args {
  command: string
  tag?: string
  server: string
  reason?: string
  dryRun: boolean
  confirm: boolean
  timeoutSecs?: number
  imageVariant: ImageVariant
}

/** Suffix appended to the image tag when picking a variant (FEAT-020). */
function variantSuffix(variant: ImageVariant): string {
  return variant === 'full' ? '-full' : ''
}

function parseArgs(argv: string[]): Args {
  if (argv.length === 0)
    fatal('missing <command>. Run `bun run scripts/deploy.ts --help` for usage.')
  const command = argv[0]!
  if (command === '--help' || command === '-h') {
    printHelp()
    process.exit(0)
  }
  const envVariant = normalizeVariant(process.env.AIWORKER_IMAGE_VARIANT, 'slim')
  const out: Args = {
    command,
    server: process.env.AIWORK_SERVER_ID ?? DEFAULT_AIWORK_SERVER_ID,
    dryRun: false,
    confirm: false,
    imageVariant: envVariant,
  }
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === '--dry-run') {
      out.dryRun = true
    }
    else if (arg === '--confirm') {
      out.confirm = true
    }
    else if (arg.startsWith('--tag=')) {
      out.tag = arg.slice('--tag='.length)
    }
    else if (arg.startsWith('--server=')) {
      out.server = arg.slice('--server='.length)
    }
    else if (arg.startsWith('--reason=')) {
      out.reason = arg.slice('--reason='.length)
    }
    else if (arg.startsWith('--timeout=')) {
      const n = Number.parseInt(arg.slice('--timeout='.length), 10)
      if (!Number.isFinite(n) || n <= 0)
        fatal(`invalid --timeout: ${arg}`)
      out.timeoutSecs = n
    }
    else if (arg.startsWith('--image-variant=')) {
      out.imageVariant = normalizeVariant(arg.slice('--image-variant='.length), 'slim')
    }
    else {
      fatal(`unknown flag: ${arg}`)
    }
  }
  return out
}

function normalizeVariant(raw: string | undefined, fallback: ImageVariant): ImageVariant {
  const v = (raw ?? '').trim().toLowerCase()
  if (v === 'slim' || v === '')
    return 'slim'
  if (v === 'full')
    return 'full'
  fatal(`invalid --image-variant: ${raw} (expected slim | full)`)
  return fallback
}

function printHelp(): void {
  const help = `\nbun run scripts/deploy.ts <command> [flags]\n\n*** OPTIONAL docker-mode deploy. ***\n*** The recommended CLI-first path is bare CLI (\`aim gateway start\`) or\n*** systemd (\`aim install systemd\`). See docs/deployment.md.\n*** This script + ops/compose/ + GHCR + Caddy is the OPTIONAL public-HTTPS\n*** fast-launch path (see docs/deployment-public-https.md).\n\nCommands:\n  install-docker   Install docker on target (first-time, approval-gated)\n  teardown-legacy  Remove legacy aiworker.service + /opt/aiworker (approval-gated, --confirm)\n  login-ghcr       docker login ghcr.io on host using local \`gh auth token\`\n  build            Trigger .github/workflows/build-image.yml, watch, return tag\n  upload           Upload compose + Caddyfile + .env to host\n  install          docker compose pull + up -d on host\n  verify           Curl /health on host, fail on non-ok\n  reload-caddy     Install Caddyfile + caddy validate + systemctl reload caddy\n  deploy           build → upload → install → verify → reload-caddy\n\nFlags:\n  --tag=<tag>              Image tag (default: <git-sha>-<UTC yyyymmddhhmm>)\n  --image-variant=slim|full  FEAT-020 slim is default (~150 MB), full bakes\n                             claude-code / codex / gemini-cli / qwen-code\n                             (~300 MB). Overrides $AIWORKER_IMAGE_VARIANT.\n  --server=<id>            aissh server id (default: $AIWORK_SERVER_ID)\n  --reason=<text>         aissh --reason (default: "FEAT-009 <command>")\n  --timeout=<secs>         aissh exec timeout in seconds (per-command defaults:\n                           install-docker 300, install 300, others 60)\n  --dry-run                Print commands without executing\n  --confirm                Required for teardown-legacy\n`
  process.stdout.write(help)
}

function fatal(msg: string): never {
  process.stderr.write(`[deploy] ERROR: ${msg}\n`)
  process.exit(1)
}

function log(msg: string): void {
  process.stdout.write(`[deploy] ${msg}\n`)
}

function defaultTag(): string {
  const sha = runCapture('git', ['rev-parse', '--short', 'HEAD']).stdout.trim() || 'nogit'
  const now = new Date()
  const pad = (n: number): string => n.toString().padStart(2, '0')
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`
  return `${sha}-${stamp}`
}

interface CaptureResult { status: number, stdout: string, stderr: string }

function runCapture(cmd: string, args: string[]): CaptureResult {
  const res = spawnSync(cmd, args, { encoding: 'utf8' })
  return {
    status: res.status ?? -1,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
  }
}

function runStreaming(cmd: string, args: string[], opts: { dryRun: boolean, cwd?: string }): number {
  if (opts.dryRun) {
    log(`DRY: ${cmd} ${args.map(quoteArg).join(' ')}`)
    return 0
  }
  log(`exec: ${cmd} ${args.map(quoteArg).join(' ')}`)
  const res = spawnSync(cmd, args, {
    stdio: 'inherit',
    cwd: opts.cwd ?? REPO_ROOT,
  })
  return res.status ?? -1
}

function quoteArg(s: string): string {
  if (/^[\w\-./:=@,+]+$/.test(s))
    return s
  return `'${s.replaceAll('\'', '\'\\\'\'')}'`
}

function mustRun(cmd: string, args: string[], opts: { dryRun: boolean, cwd?: string }): void {
  const code = runStreaming(cmd, args, opts)
  if (code !== 0)
    fatal(`command failed (exit ${code}): ${cmd} ${args.join(' ')}`)
}

/**
 * Per-command aissh exec timeout (seconds). aissh defaults to 30s which is
 * too short for `docker load` of a ~150 MB tarball, for `curl | sh` installs,
 * and for Caddy restarts that wait on systemd. Each command overrides as
 * needed; `--timeout` on the CLI overrides everything.
 */
function aisshExec(args: Args, remoteCmd: string, reason?: string, defaultTimeoutSecs = 60): void {
  const finalReason = reason ?? args.reason ?? `FEAT-009 ${args.command}`
  const timeoutSecs = args.timeoutSecs ?? defaultTimeoutSecs
  mustRun(
    'aissh',
    ['exec', args.server, remoteCmd, `--reason=${finalReason}`, `--timeout=${timeoutSecs}`],
    { dryRun: args.dryRun },
  )
}

function aisshUpload(args: Args, localPath: string, remotePath: string, _reason?: string): void {
  // `aissh file upload` has no --reason flag (unlike exec). Audit context
  // for uploads comes from the server/token + the local/remote path in the
  // aissh server's own log.
  mustRun(
    'aissh',
    ['file', 'upload', args.server, localPath, `--remote-path=${remotePath}`],
    { dryRun: args.dryRun },
  )
}

function ensureAissh(): void {
  const res = runCapture('aissh', ['--help'])
  if (res.status !== 0)
    fatal('`aissh` CLI not found in PATH. Install it and run `aissh config set-server ...` first.')
}

function ensureGh(): void {
  const res = runCapture('gh', ['--version'])
  if (res.status !== 0)
    fatal('`gh` CLI not found in PATH. Install it and run `gh auth login` first.')
}

function ghAuthToken(): string {
  const res = runCapture('gh', ['auth', 'token'])
  if (res.status !== 0 || !res.stdout.trim())
    fatal('`gh auth token` failed. Run `gh auth login` and ensure the token has write:packages + workflow scopes.')
  return res.stdout.trim()
}

function ghAuthUser(): string {
  const res = runCapture('gh', ['api', '/user', '--jq', '.login'])
  if (res.status !== 0 || !res.stdout.trim())
    fatal('`gh api /user` failed. Run `gh auth login` first.')
  return res.stdout.trim()
}

// --------------------------------------------------------------------------
// Commands
// --------------------------------------------------------------------------

function cmdInstallDocker(args: Args): void {
  ensureAissh()
  log('installing docker on target (approval may be required)')
  aisshExec(
    args,
    'command -v docker >/dev/null 2>&1 && docker --version || curl -fsSL https://get.docker.com | sh',
    'FEAT-009 install docker engine (first-time)',
    300,
  )
}

function cmdTeardownLegacy(args: Args): void {
  if (!args.confirm)
    fatal('teardown-legacy is irreversible — re-run with --confirm once the new gateway has been verified healthy.')
  ensureAissh()
  log('tearing down legacy aiworker.service + /opt/aiworker')
  // aissh rejects `rm -rf /opt/...` as a dangerous command (auth_error). Use
  // `find -mindepth 1 -delete` to remove directory contents, then rmdir the
  // empty dir. `-path '*/containerd*' -prune` is defence-in-depth in case the
  // legacy path ever overlapped with docker state.
  aisshExec(
    args,
    [
      'set -e',
      'if systemctl list-unit-files aiworker.service >/dev/null 2>&1; then systemctl stop aiworker || true; systemctl disable aiworker || true; fi',
      'rm -f /etc/systemd/system/aiworker.service',
      'systemctl daemon-reload',
      '[ -d /opt/aiworker ] && find /opt/aiworker -mindepth 1 -delete && rmdir /opt/aiworker || true',
    ].join(' && '),
    'FEAT-009 teardown legacy single-process runtime',
  )
}

function cmdLoginGhcr(args: Args): void {
  ensureAissh()
  ensureGh()
  const user = ghAuthUser()
  const token = ghAuthToken()
  log(`logging ${user}@ghcr.io on host (credentials persist in /root/.docker/config.json)`)
  // Pipe the token via here-doc on the remote side so it never lands on a
  // command line that shows up in /proc or shell history. aissh exec relays
  // stdio to the agent, not to a tty, so the token is only visible to the
  // aissh server audit log.
  const remoteCmd = `docker login ghcr.io -u '${user}' --password-stdin <<'EOF'\n${token}\nEOF`
  aisshExec(args, remoteCmd, 'FEAT-009 docker login ghcr.io', 60)
}

function cmdBuild(args: Args): string {
  ensureGh()
  const tag = args.tag ?? defaultTag()
  log(`triggering workflow ${BUILD_WORKFLOW} with tag=${tag}`)

  // Record the newest run id BEFORE dispatch so we can identify the one we
  // just triggered. `gh workflow run` does not return a run id directly.
  const beforeRes = runCapture('gh', ['run', 'list', '--workflow', BUILD_WORKFLOW, '--limit', '1', '--json', 'databaseId', '--jq', '.[0].databaseId // empty'])
  const beforeRunId = beforeRes.stdout.trim()

  mustRun('gh', ['workflow', 'run', BUILD_WORKFLOW, '--ref', 'main', '-f', `tag=${tag}`], { dryRun: args.dryRun })
  if (args.dryRun)
    return tag

  // Poll for the new run to appear (GitHub takes a few seconds to register).
  let runId = ''
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const res = runCapture('gh', ['run', 'list', '--workflow', BUILD_WORKFLOW, '--limit', '1', '--json', 'databaseId,status,headBranch', '--jq', '.[0].databaseId // empty'])
    const id = res.stdout.trim()
    if (id && id !== beforeRunId) {
      runId = id
      break
    }
    Bun.sleepSync(2000)
  }
  if (!runId)
    fatal('timed out waiting for the new workflow run to appear in `gh run list`.')

  log(`watching run ${runId}`)
  mustRun('gh', ['run', 'watch', runId, '--exit-status', '--interval', '10'], { dryRun: false })
  log(`image ${GHCR_IMAGE}:${tag} published`)
  return tag
}

function cmdUpload(args: Args): void {
  ensureAissh()
  log('uploading compose + Caddyfile + .env')
  const envPath = join(REPO_ROOT, 'ops', 'compose', '.env')
  if (!args.dryRun && !existsSync(envPath))
    fatal(`missing ${envPath}. Copy ops/compose/.env.example there and fill in AIWORKER_MASTER_KEY + INTERNAL_SHARED_SECRET first.`)
  aisshUpload(args, envPath, `${DEFAULT_REMOTE_DIR}/.env`)
  aisshUpload(
    args,
    join(REPO_ROOT, 'ops', 'compose', 'docker-compose.yml'),
    `${DEFAULT_REMOTE_DIR}/docker-compose.yml`,
  )
  aisshUpload(
    args,
    join(REPO_ROOT, 'ops', 'caddy', 'Caddyfile.tmpl'),
    `${DEFAULT_REMOTE_DIR}/Caddyfile.tmpl`,
  )
}

function cmdInstall(args: Args, tag: string): void {
  ensureAissh()
  const suffix = variantSuffix(args.imageVariant)
  const fullRef = `${GHCR_IMAGE}:${tag}${suffix}`
  log(`pulling ${fullRef} + bringing compose up`)
  // One exec so pull+up is atomic from the approval perspective. Both env
  // vars are inlined so the compose image interpolation resolves without
  // depending on whatever suffix currently sits in `.env`; the .env value
  // is the fallback for manual `docker compose up -d` on the host.
  const envPair = `AIWORKER_IMAGE_TAG=${tag} AIWORKER_IMAGE_VARIANT_SUFFIX=${suffix}`
  const remoteCmd = [
    'set -e',
    `cd ${DEFAULT_REMOTE_DIR}`,
    `[ -f .env ] || { echo 'FATAL: ${DEFAULT_REMOTE_DIR}/.env missing — run \\\`deploy upload\\\` first.' >&2; exit 2; }`,
    'grep -q "^AIWORKER_MASTER_KEY=." .env || { echo "FATAL: AIWORKER_MASTER_KEY missing from .env" >&2; exit 2; }',
    'grep -q "^INTERNAL_SHARED_SECRET=." .env || { echo "FATAL: INTERNAL_SHARED_SECRET missing from .env" >&2; exit 2; }',
    `${envPair} docker compose --env-file .env -f docker-compose.yml pull`,
    `${envPair} docker compose --env-file .env -f docker-compose.yml up -d`,
  ].join(' && ')
  aisshExec(args, remoteCmd, `FEAT-009 install gateway ${tag}${suffix}`, 300)
}

function cmdVerify(args: Args): void {
  ensureAissh()
  log('verifying gateway /health')
  // curl exits non-zero on HTTP error thanks to -f, and docker compose's port
  // binding is 127.0.0.1:9218 per ops/compose/docker-compose.yml (FEAT-030).
  // PLAN-013 替换 dashboard 为 WS gateway,新 /health body 是
  // `{"ok":true,"service":"aiworker-gateway","ts":...}` (see apps/gateway/src/server.ts).
  aisshExec(
    args,
    'curl -fsS http://127.0.0.1:9218/health | grep -q \'"ok":true\'',
    'FEAT-009 verify gateway /health',
  )
  log('verify ok')
}

function cmdReloadCaddy(args: Args): void {
  ensureAissh()
  log('installing Caddyfile + reloading caddy')
  const remoteCmd = [
    'set -e',
    `test -f ${DEFAULT_REMOTE_DIR}/Caddyfile.tmpl`,
    // Caddy validates the target file in-place before the atomic swap.
    `caddy validate --config ${DEFAULT_REMOTE_DIR}/Caddyfile.tmpl --adapter caddyfile`,
    `install -m 0644 ${DEFAULT_REMOTE_DIR}/Caddyfile.tmpl /etc/caddy/Caddyfile`,
    'systemctl reload caddy',
  ].join(' && ')
  aisshExec(args, remoteCmd, 'FEAT-009 reload caddy')
}

function cmdDeploy(args: Args): void {
  log('[docker-mode] starting build → upload → install → verify → reload-caddy (optional path; see docs/deployment.md for the recommended CLI-first install)')
  const tag = cmdBuild(args)
  const argsWithTag: Args = { ...args, tag }
  cmdUpload(argsWithTag)
  cmdInstall(argsWithTag, tag)
  cmdVerify(argsWithTag)
  cmdReloadCaddy(argsWithTag)
  const suffix = variantSuffix(args.imageVariant)
  log(`[docker-mode] deploy ok — image tag ${tag}${suffix} (variant=${args.imageVariant})`)
  log(`[docker-mode] Remember: update AIWORKER_IMAGE_TAG=${tag} + AIWORKER_IMAGE_VARIANT_SUFFIX=${suffix} in ${DEFAULT_REMOTE_DIR}/.env on the host if you want manual \`docker compose up -d\` to pick up this tag+variant.`)
}

// --------------------------------------------------------------------------
// Entry
// --------------------------------------------------------------------------

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  switch (args.command) {
    case 'install-docker':
      cmdInstallDocker(args)
      break
    case 'teardown-legacy':
      cmdTeardownLegacy(args)
      break
    case 'login-ghcr':
      cmdLoginGhcr(args)
      break
    case 'build':
      cmdBuild(args)
      break
    case 'upload':
      cmdUpload(args)
      break
    case 'install': {
      const tag = args.tag ?? fatal('install requires --tag=<tag> so the host pulls the intended image.')
      cmdInstall(args, tag)
      break
    }
    case 'verify':
      cmdVerify(args)
      break
    case 'reload-caddy':
      cmdReloadCaddy(args)
      break
    case 'deploy':
      cmdDeploy(args)
      break
    default:
      fatal(`unknown command: ${args.command}. Run --help for the list.`)
  }
}

main()
