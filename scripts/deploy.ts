/**
 * FEAT-009 / PLAN-005 — aissh-driven fleet deployment CLI.
 *
 * Wraps `aissh exec` / `aissh file upload` to deliver the dashboard image +
 * compose + Caddyfile to the production host and bring the stack up.
 *
 * Usage:
 *   bun run scripts/deploy.ts <command> [flags]
 *
 * Commands:
 *   install-docker   Install docker on the target host (first-time, approval-gated)
 *   teardown-legacy  Stop aiworker.service, rm /opt/aiworker + unit file
 *                    (IRREVERSIBLE, approval-gated, requires --confirm)
 *   build            bun run build + docker build + docker save → ops/dist/aiworker-<tag>.tar.zst
 *   upload           aissh file upload image tarball + compose + Caddyfile
 *   install          docker load + docker compose up -d (via aissh exec)
 *   verify           curl -fsS http://127.0.0.1:3000/health on the host
 *   reload-caddy     caddy validate + systemctl reload caddy (on host)
 *   deploy           build → upload → install → verify → reload-caddy
 *
 * Common flags:
 *   --tag=<tag>      Image tag (default: <git-short-sha>-<UTC yyyymmddhhmm>)
 *   --server=<id>    aissh server id (default: $AIWORK_SERVER_ID or the
 *                    hardcoded aiwork id from FEAT-009)
 *   --reason=<text>  aissh --reason value (default: "FEAT-009 <command>")
 *   --dry-run        Print the aissh / docker commands without executing
 *   --confirm        Required for teardown-legacy
 *
 * The script streams child-process stdio straight through, so aissh's own
 * approval UX is visible — operators run `aissh approval wait <op-id>` in a
 * separate terminal and re-invoke the failed subcommand once approved.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const DEFAULT_AIWORK_SERVER_ID = '<aissh-server-id-redacted>'
const DEFAULT_REMOTE_DIR = '/opt/aiworker-deploy'
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '..')
const OPS_DIST_DIR = join(REPO_ROOT, 'ops', 'dist')

interface Args {
  command: string
  tag?: string
  server: string
  reason?: string
  dryRun: boolean
  confirm: boolean
  timeoutSecs?: number
}

function parseArgs(argv: string[]): Args {
  if (argv.length === 0)
    fatal('missing <command>. Run `bun run scripts/deploy.ts --help` for usage.')
  const command = argv[0]!
  if (command === '--help' || command === '-h') {
    printHelp()
    process.exit(0)
  }
  const out: Args = {
    command,
    server: process.env.AIWORK_SERVER_ID ?? DEFAULT_AIWORK_SERVER_ID,
    dryRun: false,
    confirm: false,
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
    else {
      fatal(`unknown flag: ${arg}`)
    }
  }
  return out
}

function printHelp(): void {
  const help = `\nbun run scripts/deploy.ts <command> [flags]\n\nCommands:\n  install-docker   Install docker on target (first-time, approval-gated)\n  teardown-legacy  Remove legacy aiworker.service + /opt/aiworker (approval-gated, --confirm)\n  build            Build image + save to ops/dist/aiworker-<tag>.tar.zst\n  upload           Upload image tarball + compose + Caddyfile to host\n  install          docker load + docker compose up -d on host\n  verify           Curl /health on host, fail on non-ok\n  reload-caddy     Install Caddyfile + caddy validate + systemctl reload caddy\n  deploy           build → upload → install → verify → reload-caddy\n\nFlags:\n  --tag=<tag>       Image tag (default: <git-sha>-<UTC yyyymmddhhmm>)\n  --server=<id>     aissh server id (default: $AIWORK_SERVER_ID or hardcoded)\n  --reason=<text>  aissh --reason (default: "FEAT-009 <command>")\n  --timeout=<secs>  aissh exec timeout in seconds (per-command defaults:\n                    install-docker 300, install 300, others 60)\n  --dry-run         Print commands without executing\n  --confirm         Required for teardown-legacy\n`
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
    fatal('teardown-legacy is irreversible — re-run with --confirm once the new dashboard has been verified healthy.')
  ensureAissh()
  log('tearing down legacy aiworker.service + /opt/aiworker')
  // One exec so the whole teardown is a single approval.
  aisshExec(
    args,
    [
      'set -e',
      'if systemctl list-unit-files aiworker.service >/dev/null 2>&1; then systemctl stop aiworker || true; systemctl disable aiworker || true; fi',
      'rm -f /etc/systemd/system/aiworker.service',
      'systemctl daemon-reload',
      'rm -rf /opt/aiworker',
    ].join(' && '),
    'FEAT-009 teardown legacy single-process runtime',
  )
}

function cmdBuild(args: Args): string {
  const tag = args.tag ?? defaultTag()
  log(`building aiworker-runtime:${tag}`)

  mkdirSync(OPS_DIST_DIR, { recursive: true })

  mustRun('bun', ['run', 'build'], { dryRun: args.dryRun })
  mustRun('docker', ['build', '-t', `aiworker-runtime:${tag}`, '.'], { dryRun: args.dryRun })

  const tarPath = join(OPS_DIST_DIR, `aiworker-${tag}.tar.zst`)
  // `docker save | zstd` keeps the upload under ~150 MB for our tight 1 GiB host.
  mustRun('sh', ['-c', `docker save aiworker-runtime:${tag} | zstd -T0 -19 -q -o '${tarPath}'`], { dryRun: args.dryRun })

  log(`built tarball at ${tarPath}`)
  return tag
}

function cmdUpload(args: Args, tag: string): void {
  ensureAissh()
  const tarPath = join(OPS_DIST_DIR, `aiworker-${tag}.tar.zst`)
  if (!args.dryRun && !existsSync(tarPath))
    fatal(`image tarball not found: ${tarPath}. Run \`deploy build --tag=${tag}\` first.`)

  log(`uploading artifacts for tag ${tag}`)
  aisshUpload(args, tarPath, `${DEFAULT_REMOTE_DIR}/`, `FEAT-009 upload image ${tag}`)
  aisshUpload(
    args,
    join(REPO_ROOT, 'ops', 'compose', 'docker-compose.yml'),
    `${DEFAULT_REMOTE_DIR}/`,
    'FEAT-009 upload docker-compose.yml',
  )
  aisshUpload(
    args,
    join(REPO_ROOT, 'ops', 'caddy', 'Caddyfile.tmpl'),
    `${DEFAULT_REMOTE_DIR}/`,
    'FEAT-009 upload Caddyfile.tmpl',
  )
}

function cmdInstall(args: Args, tag: string): void {
  ensureAissh()
  log(`loading image + bringing compose up for tag ${tag}`)
  const tarName = `aiworker-${tag}.tar.zst`
  // One exec so load+up is atomic from the approval perspective.
  const remoteCmd = [
    'set -e',
    `cd ${DEFAULT_REMOTE_DIR}`,
    `[ -f .env ] || { echo 'FATAL: ${DEFAULT_REMOTE_DIR}/.env missing — copy ops/compose/.env.example and fill it in before install.' >&2; exit 2; }`,
    'grep -q "^AIWORKER_MASTER_KEY=." .env || { echo "FATAL: AIWORKER_MASTER_KEY missing from .env" >&2; exit 2; }',
    'grep -q "^INTERNAL_SHARED_SECRET=." .env || { echo "FATAL: INTERNAL_SHARED_SECRET missing from .env" >&2; exit 2; }',
    `zstd -d -q -f -o aiworker-${tag}.tar ${tarName}`,
    `docker load -i aiworker-${tag}.tar`,
    `rm -f aiworker-${tag}.tar`,
    `AIWORKER_IMAGE_TAG=${tag} docker compose --env-file .env -f docker-compose.yml up -d`,
  ].join(' && ')
  aisshExec(args, remoteCmd, `FEAT-009 install dashboard ${tag}`, 300)
}

function cmdVerify(args: Args): void {
  ensureAissh()
  log('verifying dashboard /health')
  // curl exits non-zero on HTTP error thanks to -f, and docker compose's port
  // binding is 127.0.0.1:3000 per ops/compose/docker-compose.yml.
  aisshExec(
    args,
    'curl -fsS http://127.0.0.1:3000/health | grep -q \'"status":"ok"\'',
    'FEAT-009 verify dashboard /health',
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
  const tag = cmdBuild(args)
  const argsWithTag: Args = { ...args, tag }
  cmdUpload(argsWithTag, tag)
  cmdInstall(argsWithTag, tag)
  cmdVerify(argsWithTag)
  cmdReloadCaddy(argsWithTag)
  log(`deploy ok — image tag ${tag}`)
  log(`Remember: update AIWORKER_IMAGE_TAG=${tag} in ${DEFAULT_REMOTE_DIR}/.env on the host if you want manual \`docker compose up -d\` to pick up this tag.`)
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
    case 'build':
      cmdBuild(args)
      break
    case 'upload': {
      const tag = args.tag ?? readLastTagFromDist() ?? fatal('upload requires --tag=<tag> (or a previously-built tarball in ops/dist/).')
      cmdUpload(args, tag)
      break
    }
    case 'install': {
      const tag = args.tag ?? fatal('install requires --tag=<tag> so the host knows which tarball to load.')
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

function readLastTagFromDist(): string | undefined {
  if (!existsSync(OPS_DIST_DIR))
    return undefined
  const names = readdirSync(OPS_DIST_DIR)
    .filter(n => n.startsWith('aiworker-') && n.endsWith('.tar.zst'))
  if (names.length === 0)
    return undefined
  let newest: { name: string, mtime: number } | undefined
  for (const name of names) {
    const mtime = statSync(join(OPS_DIST_DIR, name)).mtimeMs
    if (!newest || mtime > newest.mtime)
      newest = { name, mtime }
  }
  const m = newest?.name.match(/^aiworker-(.+)\.tar\.zst$/)
  return m?.[1]
}

main()
