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

// G12 ↔ 三线拓扑（docs/superpowers/specs/2026-06-12-three-line-dev-orchestration.md §1）：把「每个包
// 属于哪条线」与「共享底座 / wire leaf 绝不反向 depend up 进某条线的 runtime/app」升级成机器强制契约，
// 补齐 G2–G5（针对*已知*包/符号的具体规则）之外两个洞：
//   ① 新包没被任何线认领——塞个新包连错边，具体守卫未必抓得到；G12 强制一次「这包归哪条线」的 review。
//   ② 共享底座 / leaf depend up——让底座绑死一条线、无法被另一条线复用，违背「Worker 必须能脱离 Host」。
// 与 G3（worker↛host）/ G5（host→worker 仅 worker-control-protocol）正交互补：G3/G5 管*横向*跨线耦合，
// G12 管*纵向*分层 + 拓扑完整性。worker-control-protocol 名为 worker- 但是两 plane 共享的 wire 契约
// leaf（G5），归共享底座类。
test('G12: every package is line-assigned and shared base / wire leaf never depends up into a line', () => {
  const WORKER_LINE = ['packages/worker-runtime', 'packages/worker-daemon', 'apps/worker-cli', 'apps/worker-web']
  const HOST_LINE = ['packages/host-control', 'apps/host-cli', 'apps/host-web']
  const SHARED_BASE = [
    'packages/cli-doctor',
    'packages/engine-bridge',
    'packages/engine-projection',
    'packages/fs-layout',
    'packages/soul-descriptor',
    'packages/soul-sdk',
    'packages/storage-sqlite',
    'packages/ui',
    'packages/worker-control-protocol',
  ]

  const packageName = (dir: string): string => (JSON.parse(read(`${dir}/package.json`)) as { name: string }).name

  // ① 未认领网：packages/* 与 apps/* 下每个含 package.json 的包都必须显式归线（新增未列入 → 红，
  // 强制显式归线 review，而不是悄悄塞进来连错边）。
  const classified = new Set([...WORKER_LINE, ...HOST_LINE, ...SHARED_BASE])
  const allPackageDirs: string[] = []
  for (const base of ['packages', 'apps']) {
    for (const entry of readdirSync(join(repoRoot, base))) {
      if (existsSync(join(repoRoot, base, entry, 'package.json')))
        allPackageDirs.push(`${base}/${entry}`)
    }
  }
  const unclassified = allPackageDirs.filter(dir => !classified.has(dir))
  expect(unclassified, 'every packages/* and apps/* package must be line-assigned in G12 (worker / host / shared base)').toEqual([])

  // ② 共享底座 / wire leaf / souls 绝不 depend up 进任何一条线的 runtime/app 包（纵向分层不可反转）。
  const lineRuntimeNames = new Set([...WORKER_LINE, ...HOST_LINE].map(packageName))
  for (const dir of [...SHARED_BASE, ...soulPackageDirs()]) {
    const dependsUp = zonaseDependencyNames(dir).filter(name => lineRuntimeNames.has(name))
    expect(dependsUp, `${dir} (shared base / wire leaf / soul) must not depend up into a worker/host line package`).toEqual([])
  }
})

// G4 ↔ C3：host-control 仅控制面——deps 不含 engine/worker 运行时包；且所有 host-* 控制面源
// （host-control + 壳 host-cli/host-web）剥注释后不携带 **Worker 的** session/invocation/
// projection/engine/native-secret/domain-业务态归属。Host **自身**的 Logto 登录 session /
// OIDC 凭证 / email 域门是 Phase 2.1 钦定的合法职责，按下方显式可审计 allowlist 排除——这缩小
// 误报、不削弱守卫。权威设计：docs/superpowers/specs/2026-06-07-g4-host-auth-reconciliation-design.md。
//
// 严扫类（invocation/projection/engine）：无歧义的 Worker-runtime 归属，Host 无合法用法，保持
// 裸子串 includes 严扫（改前全量扫描 host-* 源对这三个零命中）。
const STRICT_OWNERSHIP_TOKENS = ['invocation', 'projection', 'engine'] as const
// 歧义类（session/secret/domain）：Host-auth 与 Worker-归属共用词根。改为 word-token 精确
// allowlist——把源切成 [\w$]+ 词元，只放行*精确等于*某 Host-auth 词元的项。子串删除法对裸
// `session`（session.email / "Host session" 字面量 / './host-session-cookie' import）无解：删裸
// 'session' 会连 `workerChatSession` 一起消掉=开后门；word-token 下 `workerchatsession` 是单独
// 词元 ≠ `session`，仍被抓（见 G4 negative 测试）。一个*恰好*命名为 session/secret/domain 的
// Worker-owned 变量本身只是名字，真要操纵 Worker 运行时须 import worker-*，那条由 G2/G3/G5 依赖
// 守卫兜底——本源扫描与依赖守卫互补。
const AMBIGUOUS_OWNERSHIP_TOKENS = ['session', 'secret', 'domain'] as const
// 显式 Host-auth allowlist（全小写 word-token；新增 auth 标识符*必须*显式加入=强制一次 review，
// 这正是 spec 的防后门目标）。标准：仅放行 Host *自身* 的 Logto 登录 session / OIDC 凭证 /
// email 域门 / provision-secret 脱敏。来源=对 host-* 源全量枚举（见 spec）。
const HOST_AUTH_ALLOWLIST = new Set<string>([
  // —— 登录 session（Host 管理员的 Logto 登录态：cookie / payload / env / 校验）——
  'session',
  'hostsession',
  'hostsessionpayload',
  'ishostsessionpayload',
  'sessionauth',
  'hostsessionauthoptions',
  'hostlifecyclesessionauthoptions',
  'hostsessionauthenv',
  'sessionsecret',
  'asserthostsessionsecret',
  'aiworker_host_session_secret',
  'sessioncookieattributes',
  'readuserfromsessioncookie',
  'aiworker_session',
  'logtosessionrequiredenvkeys',
  'buildsessionauthfromenv',
  'hasanysessionenv',
  // —— OIDC 凭证（Logto client / application / m2m secret）——
  'secret',
  'secrets',
  'clientsecret',
  'client_secret',
  'logto_client_secret',
  'm2mappsecret',
  'logto_m2m_app_secret',
  'deprecatedsecret',
  'readapplicationsecret',
  'missing_application_secret',
  'invalid_secret_response',
  // —— email 域门（允许登录的企业邮箱域）——
  'domain',
  'emaildomain',
  'alloweddomains',
  'allowedemaildomains',
  'emailbelongstoalloweddomain',
  'aiworker_host_allowed_email_domains',
  // —— provision-secret 脱敏（把 provisionToken 从 receipt/command 中*清除*的防泄漏函数，
  //    携带零 Worker secret；见 provisioning-target-adapters.ts:93 scrubProvisionSecret）——
  'scrubprovisionsecret',
])

// 返回命中的 forbidden token 列表（空=干净）。rawCode 期望已 stripComments（未小写也可，内部小写）。
function scanHostOwnership(rawCode: string): string[] {
  const code = rawCode.toLowerCase()
  const hits: string[] = []
  // 严扫类：裸子串（最大严格度，不经 allowlist）。
  for (const token of STRICT_OWNERSHIP_TOKENS) {
    if (code.includes(token))
      hits.push(token)
  }
  // 歧义类：word-token 精确 allowlist——任一*含*该 token 且*不在* allowlist 的词元=违规。
  const words = code.match(/[\w$]+/g) ?? []
  for (const token of AMBIGUOUS_OWNERSHIP_TOKENS) {
    if (words.some(word => word.includes(token) && !HOST_AUTH_ALLOWLIST.has(word)))
      hits.push(token)
  }
  return hits
}

test('G4: host-control deps + all host-* source carry no Worker session/invocation/projection/engine/domain/secret ownership', () => {
  const deps = zonaseDependencyNames('packages/host-control')
  for (const forbiddenDep of [
    '@zonease/aiworker-engine-bridge',
    '@zonease/aiworker-engine-projection',
    '@zonease/aiworker-worker-runtime',
    '@zonease/aiworker-worker-daemon',
  ])
    expect(deps, `host-control must not depend on ${forbiddenDep}`).not.toContain(forbiddenDep)

  const ownershipDirs = ['packages/host-control/src', 'apps/host-cli/src', 'apps/host-web/src']
  for (const dir of ownershipDirs) {
    for (const file of sourceFilesUnder(dir)) {
      const hits = scanHostOwnership(stripComments(read(file)))
      expect(hits, `${file} must not carry Worker ownership (host-* control plane): ${hits.join(', ')}`).toEqual([])
    }
  }
})

// 负向断言（A1）：证明 Host-auth allowlist 排除*没有*削弱守卫、没开后门。每条都是只含一个
// 歧义 token 的伪造 Worker-归属标识符（单 word-token，多数不带伴随 strict token）——最能验证
// word-token allowlist 不因复合词漏放（`workerChatSession` 是单独词元 ≠ allowlisted 的裸 `session`）。
test('G4 negative: Worker-ownership identifiers stay caught despite the Host-auth allowlist', () => {
  // spec 钦定的两个基线
  expect(scanHostOwnership('const workerChatSession = 1')).toContain('session')
  expect(scanHostOwnership('const engineSecret = 2')).toEqual(expect.arrayContaining(['engine', 'secret']))
  // 纯歧义单 token（不带 strict token、不是 allowlisted 裸词）——证明复合词不漏
  expect(scanHostOwnership('createWorkerSession()')).toContain('session')
  expect(scanHostOwnership('const workerSessionStore = {}')).toContain('session')
  expect(scanHostOwnership('type WorkerDomainState = unknown')).toContain('domain')
  expect(scanHostOwnership('function readWorkerInvocationSecret() {}')).toEqual(expect.arrayContaining(['invocation', 'secret']))
  // 反向：纯 Host-auth 词元集合必须干净（不误报）
  expect(scanHostOwnership('const session = readUserFromSessionCookie(); const clientSecret = x; const allowedEmailDomains = []')).toEqual([])
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

test('G9 phase-2 access: Worker may initiate only provisioning check-in and access tunnel signals', () => {
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

test('G8 phase-2 managed access does not make Worker runtime depend on Host', () => {
  const architecture = read('docs/architecture.md')
  const protocol = read('docs/protocol.md')
  const runtime = read('docs/runtime.md')

  expect(architecture).toContain('Host-only applies only to managed employee remote access')
  expect(architecture).toContain('Worker Web and CLI remain locally operable without Host')
  expect(protocol).toContain('WebSocket is the only Worker Access tunnel transport in Phase 2.1')
  expect(protocol).toContain('Do not add AIWORKER_WORKER_ACCESS_LOCAL_URL')
  expect(runtime).toContain('Host or tunnel outage makes managed remote access unavailable, but does not make the Worker runtime unusable')
})

// G10 ↔ C5 clause-2：唯一 Host→Worker 契约 worker-control-protocol 必须 transport-agnostic——
// 契约源不得 hardcode transport（往 schema 加 httpUrl/wsEndpoint 等不该被任何测试漏过）。
// 剥注释后断言不出现 transport token（注释合法地提到 "transport"，故须剥注释，与 G4 同法）。
// 证非空：往任一 schema 加 `httpUrl: z.string()` 字段即变红。
test('G10 clause-2: the control protocol contract type hardcodes no transport', () => {
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

test('G11 phase-2 provisioning uses target adapters instead of hard-coded aissh servers', () => {
  const architecture = read('docs/architecture.md')
  const protocol = read('docs/protocol.md')
  const runtime = read('docs/runtime.md')

  expect(architecture).toMatch(/Provisioning Target Adapter/)
  for (const maturity of ['aissh production', 'docker preview', 'local dev'])
    expect(architecture).toMatch(new RegExp(maturity.replace(' ', '\\s+'), 'i'))

  for (const field of ['hostBrowserBaseUrl', 'hostControlBaseUrl', 'adapterRuntimeControlBaseUrl']) {
    expect(protocol).toContain(field)
    expect(runtime).toContain(field)
  }
})

test('G7 remote aissh target cannot use loopback callback URLs', () => {
  const protocol = read('docs/protocol.md')
  const testing = read('docs/testing.md')

  expect(protocol).toMatch(/remote\s+aissh\s+target/i)
  expect(protocol).toMatch(/localhost/i)
  expect(protocol).toMatch(/127\.0\.0\.1/)
  expect(protocol).toMatch(/::1/)
  expect(protocol).toMatch(/adapter runtime callback url/i)
  expect(testing).toMatch(/remote\s+aissh\s+target/i)
  expect(testing).toMatch(/loopback/i)
  expect(testing).toMatch(/callback/i)
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
