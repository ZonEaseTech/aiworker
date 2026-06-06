import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
// G6 行为腿：经相对路径直接 import 控制契约源（worktree 根 node_modules 无该包符号链接，
// workspace 包名解析不到——故走源文件相对路径，仅触及本测试文件）。
import { parseWorkerAssignmentEnvelope, WORKER_CONTROL_PROTOCOL_VERSION } from '../../packages/worker-control-protocol/src/index'

const repoRoot = join(import.meta.dir, '..', '..')
function read(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8')
}

// 枚举 packages/ 与 apps/ 下以 prefix 开头的顶层包目录（新增同前缀包自动纳入守卫）。
function packageDirsWithPrefix(prefix: string): string[] {
  const dirs: string[] = []
  for (const base of ['packages', 'apps']) {
    for (const entry of readdirSync(join(repoRoot, base))) {
      if (entry.startsWith(prefix) && existsSync(join(repoRoot, base, entry, 'package.json')))
        dirs.push(`${base}/${entry}`)
    }
  }
  return dirs
}

// 读全 4 类 dependency（deps/devDeps/peerDeps/optionalDeps）——只读 deps+devDeps 会漏过
// peer/optional 形态的越界引用（如 worker-* 把 host-* 列为 peerDependencies），那条同样违反
// C2/C3/D6 边界却被旧 helper 漏掉。
function zonaseDependencyNames(dir: string): string[] {
  const pkg = JSON.parse(read(`${dir}/package.json`)) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
    optionalDependencies?: Record<string, string>
  }
  return [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
    ...Object.keys(pkg.optionalDependencies ?? {}),
  ].filter(name => name.startsWith('@zonease/'))
}

// 枚举 souls/ 下所有含 package.json 的顶层 Soul App 包目录（无前缀过滤——领域定义包不共享
// host-/worker- 命名前缀，故 packageDirsWithPrefix 抓不到，须独立枚举）。
function soulPackageDirs(): string[] {
  const base = join(repoRoot, 'souls')
  if (!existsSync(base))
    return []
  const dirs: string[] = []
  for (const entry of readdirSync(base)) {
    if (existsSync(join(base, entry, 'package.json')))
      dirs.push(`souls/${entry}`)
  }
  return dirs
}

// 递归枚举某目录下的非 test 源文件（.ts/.tsx），排除 node_modules/dist/.d.ts/.test。
function sourceFilesUnder(dir: string): string[] {
  const root = join(repoRoot, dir)
  if (!existsSync(root))
    return []
  const out: string[] = []
  const walk = (absDir: string, relDir: string): void => {
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist')
        continue
      const childRel = `${relDir}/${entry.name}`
      if (entry.isDirectory())
        walk(join(absDir, entry.name), childRel)
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts'))
        out.push(childRel)
    }
  }
  walk(root, dir)
  return out
}

// 剥离 // 行注释与 /* */ 块注释——避免合法边界注释（如 host-web「Soul owns domain UI」）误判。
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
}

describe('worker-autonomy inversion guards (Plan 1)', () => {
  test('G0: inversion vocabulary is no longer forbidden in active docs', () => {
    const checker = read('scripts/check-doc-contract.ts')
    const forbiddenBlock = checker.slice(
      checker.indexOf('const forbiddenActiveDocPhrases'),
      checker.indexOf('for (const file of activeDocs)'),
    )
    for (const allowed of ['gateway', 'control-plane', 'fleet'])
      expect(forbiddenBlock).not.toContain(`'${allowed}'`)
    // 仍保留的禁字
    for (const stillForbidden of ['Host auth is provider-backed', 'grant enforcement'])
      expect(forbiddenBlock).toContain(`'${stillForbidden}'`)
  })
})

// G6 ↔ C6：engine-secret 持久化在「两面」都被禁。re-home 为「行为 + 机制源码」断言——
// 删/改任一脱敏/拒绝机制即应变红（旧版纯文档字符串断言对 C6 行为 vacuous：删光脱敏代码、
// 留文档句仍绿）。证非空：把 worker-control-protocol 的 refine 改成恒真（neuter-while-keeping
// -the-name）即让行为腿变红；删 storage-sqlite/error-handler 机制即让源码腿变红；docs 句不动。
test('G6: docs forbid engine-secret persistence on both planes', () => {
  // (1) 行为腿——控制契约平面（Host→Worker assignment 信封）：
  //     字面密钥形态的 gatewayProfileRef 必须被 refine 拒绝（throw）；引用形态必须放行。
  //     这条经真实 import + invoke，故 refine 被 neuter（改成 return true）即变红——
  //     纯源码字符串断言抓不到「保留标识符名但改实现」的 vacuity，这条能抓。
  const baseEnvelope = {
    version: WORKER_CONTROL_PROTOCOL_VERSION,
    id: 'aiworker-freeform',
    connectors: [] as { id: string, authorized: boolean }[],
    permissions: [] as string[],
    gatewayProfileRef: 'env:GATEWAY_PROFILE',
  }
  // 隔离字段：base 在每个字段都合法（先确认 env: 引用整体放行），再只变 gatewayProfileRef，
  // 确保 throw 来自 refine 而非别的必填校验（否则删 refine 仍绿 = 假非空）。
  expect(() => parseWorkerAssignmentEnvelope(baseEnvelope)).not.toThrow()
  expect(() => parseWorkerAssignmentEnvelope({ ...baseEnvelope, gatewayProfileRef: 'sk-literal-engine-secret-abcdef123456' }))
    .toThrow(/gatewayProfileRef must be a reference/)

  // (2) 机制源码腿——storage / daemon 平面无法在本文件不接 DB 地 invoke，故断言「稳定标识符」
  //     存在（identifier 名 + throw 消息 + [REDACTED] token；不绑定正则 alternation 内容——
  //     兄弟 agent 正在硬化这些正则[ghp_/AKIA/AIza/JWT/PEM]，绑定内容会在 merge 冲突）。
  //     删任一机制（如 rename assertNoLiteralSecrets / 删 SECRET_VALUE_RE 脱敏）即变红。
  const storage = read('packages/storage-sqlite/src/worker/index.ts')
  expect(storage, 'storage-sqlite must keep the literal-secret rejection regex').toContain('LITERAL_SECRET_RE')
  expect(storage, 'storage-sqlite must keep the assertNoLiteralSecrets mechanism').toContain('assertNoLiteralSecrets')
  expect(storage, 'storage-sqlite must throw on literal secrets in Worker metadata')
    .toContain('Literal secrets are not allowed in Worker metadata')

  const errorHandler = read('packages/worker-daemon/src/shared/middleware/error-handler.ts')
  expect(errorHandler, 'worker-daemon error-handler must keep the secret-value redaction regex').toContain('SECRET_VALUE_RE')
  expect(errorHandler, 'worker-daemon error-handler must redact to [REDACTED]').toContain('[REDACTED]')

  const settings = read('packages/worker-daemon/src/modes/worker/settings.ts')
  expect(settings, 'worker settings must keep the safe-secret-reference gate').toContain('isSafeSecretReference')

  // (3) wiring 腿——既有行为测试文件存在（被 `bun run --filter '*' test` / release:check 执行），
  //     它们精确断言 throw / [REDACTED] 输出；本守卫确保它们不被悄悄删掉。
  for (const behavioralTest of [
    'packages/storage-sqlite/src/worker/index.test.ts',
    'packages/worker-daemon/src/shared/middleware/error-handler.test.ts',
  ])
    expect(existsSync(join(repoRoot, behavioralTest)), `${behavioralTest} (behavioral secret evidence) must exist`).toBe(true)

  // (4) 保留原 docs 双面句检查（两面禁 engine-secret 持久化的文档证据）。
  const runtime = read('docs/runtime.md')
  expect(runtime).toContain('any engine-secret persistence on either plane')
})

// G2 ↔ C2：engine 启动机制（engine-bridge）只被 worker-* 包依赖；host-* 不得引用 engine 启动。
// （包级断言，与 worker-runtime 内目录名无关——故 rename 与本守卫可分离。）
test('G2: engine launch symbols are imported only by worker-* packages', () => {
  const hostDirs = packageDirsWithPrefix('host-')
  expect(hostDirs.length, 'expected at least one host-* package directory').toBeGreaterThan(0)
  for (const dir of hostDirs) {
    const deps = zonaseDependencyNames(dir)
    expect(deps, `${dir} must not depend on the engine-launch package`).not.toContain('@zonease/aiworker-engine-bridge')
  }
})

// G3 ↔ D6：worker-* 与 souls/* 均不得依赖 host-*——Worker 必须能脱离 Host 独立运行，且
// 领域定义包（souls/*）镜像同一方向：descriptor-producing Soul App 不依赖控制面。Plan 3 起可证。
test('G3: worker-* packages and souls never depend on host-* packages', () => {
  const workerDirs = packageDirsWithPrefix('worker-')
  expect(workerDirs.length, 'expected at least one worker-* package directory').toBeGreaterThan(0)
  for (const dir of workerDirs) {
    const hostDeps = zonaseDependencyNames(dir).filter(name => name.startsWith('@zonease/aiworker-host-'))
    expect(hostDeps, `${dir} must not depend on host-* packages`).toEqual([])
  }
  // souls/* 镜像 worker-* 方向：领域定义包同样不得跨向控制面（host-*）。
  const soulDirs = soulPackageDirs()
  expect(soulDirs.length, 'expected at least one souls/* package directory').toBeGreaterThan(0)
  for (const dir of soulDirs) {
    const hostDeps = zonaseDependencyNames(dir).filter(name => name.startsWith('@zonease/aiworker-host-'))
    expect(hostDeps, `${dir} (Soul App) must not depend on host-* packages`).toEqual([])
  }
})

// G4 ↔ C3：host-control 仅控制面——deps 不含 engine/worker 运行时包；且所有 host-* 控制面源
// （host-control + 壳 host-cli/host-web）剥注释后不出现 session/invocation/projection/engine/
// domain/secret 归属。子串匹配（非 \b）以抓 camelCase（createSession/EngineInvocation/startEngine），
// 全文件递归（非仅 index.ts），含 domain（C3 领域归属）。
test('G4: host-control deps + all host-* source carry no session/invocation/projection/engine/domain/secret ownership', () => {
  const deps = zonaseDependencyNames('packages/host-control')
  for (const forbiddenDep of [
    '@zonease/aiworker-engine-bridge',
    '@zonease/aiworker-engine-projection',
    '@zonease/aiworker-worker-runtime',
    '@zonease/aiworker-worker-daemon',
  ])
    expect(deps, `host-control must not depend on ${forbiddenDep}`).not.toContain(forbiddenDep)

  const forbiddenTokens = ['session', 'invocation', 'projection', 'engine', 'domain', 'secret']
  const ownershipDirs = ['packages/host-control/src', 'apps/host-cli/src', 'apps/host-web/src']
  for (const dir of ownershipDirs) {
    for (const file of sourceFilesUnder(dir)) {
      const code = stripComments(read(file)).toLowerCase()
      for (const token of forbiddenTokens)
        expect(code.includes(token), `${file} must not carry '${token}' ownership (host-* control plane)`).toBe(false)
    }
  }
})

// G5 ↔ C5：唯一 Host→Worker 契约是 worker-control-protocol——host-* 包除该契约外
// 不得依赖任何 worker-* 运行时包（worker-runtime/worker-daemon 等）。Plan 3 起可证。
test('G5: the only Host->Worker contract is worker-control-protocol', () => {
  const hostDirs = packageDirsWithPrefix('host-')
  expect(hostDirs.length, 'expected at least one host-* package directory').toBeGreaterThan(0)
  for (const dir of hostDirs) {
    const workerDeps = zonaseDependencyNames(dir).filter(name => name.startsWith('@zonease/aiworker-worker-'))
    for (const dep of workerDeps)
      expect(dep, `${dir} may only cross to worker-* via the control protocol`).toBe('@zonease/aiworker-worker-control-protocol')
  }
})

test('G5 phase-2 access: Worker may initiate only provisioning check-in and access tunnel signals', () => {
  const architecture = read('docs/architecture.md')
  const protocol = read('docs/protocol.md')
  const runtime = read('docs/runtime.md')
  const docs = [
    ['docs/architecture.md', architecture],
    ['docs/protocol.md', protocol],
    ['docs/runtime.md', runtime],
  ] as const

  expect(architecture).toContain('Worker may initiate Phase 2 check-in and Worker Access tunnel connections to Host')
  expect(protocol).toContain('POST   /api/provision/check-in')
  expect(protocol).toContain('GET    /api/provision/access')
  expect(runtime).toContain('Phase 2 provisioning check-in and Worker Access tunnel signals are distribution-plane signals')

  for (const [, doc] of docs) {
    expect(doc).toContain('Host must not read Worker chat, session, invocation, projection, workspace, artifact, or native engine secret data')
    expect(doc).toContain('Host must not mount, iframe, proxy-render, or inject chrome into the Worker Workbench')
  }

  const forbiddenWorkerToHostSync = /\bWorker\s+(?:may|can|must|should)\s+(?:initiate|push|sync|send|upload|stream|replicate)[^\n.]*(?:telemetry|session|invocation|projection|engine|chat|secret)[^\n.]*(?:to|with)\s+Host\b/i
  for (const [path, doc] of docs) {
    expect(forbiddenWorkerToHostSync.test(doc), `${path} must not broaden Worker->Host signals into telemetry/session/projection/engine/chat/secret sync`).toBe(false)
  }
})

// G5 clause-2 ↔ C5：唯一 Host→Worker 契约 worker-control-protocol 必须 transport-agnostic——
// 契约源不得 hardcode transport（往 schema 加 httpUrl/wsEndpoint 等不该被任何测试漏过）。
// 剥注释后断言不出现 transport token（注释合法地提到 "transport"，故须剥注释，与 G4 同法）。
// 证非空：往任一 schema 加 `httpUrl: z.string()` 字段即变红。
test('G5 clause-2: the control protocol contract type hardcodes no transport', () => {
  const contractPath = 'packages/worker-control-protocol/src/index.ts'
  const code = stripComments(read(contractPath))
  // 子串 token（大小写不敏感）——抓 camelCase 字段名如 httpUrl/wsEndpoint/baseUrl。
  for (const token of ['httpUrl', 'wsUrl', 'wsEndpoint', 'baseUrl', 'endpoint', 'socket']) {
    expect(code.toLowerCase().includes(token.toLowerCase()), `${contractPath} must not hardcode transport token '${token}'`).toBe(false)
  }
  // 词边界 / scheme：\bport\b（避免误伤 import/export/transport）、http:// 与 ws:// scheme 字面量。
  expect(/\bport\b/i.test(code), `${contractPath} must not hardcode a 'port' field`).toBe(false)
  expect(/https?:\/\//i.test(code), `${contractPath} must not hardcode an http(s):// transport literal`).toBe(false)
  expect(/wss?:\/\//i.test(code), `${contractPath} must not hardcode a ws(s):// transport literal`).toBe(false)
})

test('G6 phase-2 provisioning uses target adapters instead of hard-coded aissh servers', () => {
  const architecture = read('docs/architecture.md')
  const protocol = read('docs/protocol.md')

  expect(architecture).toContain('Provisioning Target Adapter')
  expect(architecture).toContain('aissh production')
  expect(architecture).toContain('docker preview')
  expect(architecture).toContain('local dev')
  expect(protocol).toContain('hostBrowserBaseUrl')
  expect(protocol).toContain('hostControlBaseUrl')
  expect(protocol).toContain('adapterRuntimeControlBaseUrl')
})

test('G7 remote aissh development cannot use loopback callback URLs', () => {
  const protocol = read('docs/protocol.md')
  const testing = read('docs/testing.md')

  expect(protocol).toContain('remote aissh target must not use localhost, 127.0.0.1, or ::1 as its adapter runtime callback URL')
  expect(testing).toContain('remote aissh target rejects loopback callback URLs')
})

// G1 ↔ C1：worker standalone 金路径行为证据存在、host-free、且被 release:check 执行（经 test:cli）。
// 与 G3（包依赖方向）区分：锚定「自治行为证据存在且 host-free 且真的跑」。
test('G1: worker standalone golden path passes with Host absent', () => {
  const goldenPath = 'apps/worker-cli/src/freeform-golden-path.test.ts'
  // (1) 行为自治证据存在
  expect(existsSync(join(repoRoot, goldenPath)), `${goldenPath} must exist`).toBe(true)
  // (2) 金路径 host-free：不引用任何 host-* 控制面包 / host-control / aiworker-host 二进制
  const source = read(goldenPath)
  for (const hostRef of ['@zonease/aiworker-host-', 'host-control', 'aiworker-host '])
    expect(source, `golden path must not reference Host plane via ${hostRef}`).not.toContain(hostRef)
  // (3) wired 进 test:cli（release:check 真的会跑这条自治证据）
  const rootPkg = JSON.parse(read('package.json')) as { scripts?: Record<string, string> }
  expect(rootPkg.scripts?.['test:cli'] ?? '', 'test:cli must run the standalone golden path').toContain('freeform-golden-path.test.ts')
})
