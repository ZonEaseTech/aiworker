# 拆发版门 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把单条 `release:check` 拆成 worker 门 + phase2 门，release.yml 改成两个互不依赖的 job（host 门红不连累 worker），并补 PR 阶段的 typecheck + test:contracts 门。

**Architecture:** 纯 CI/发版配置改动，零运行时代码。`release:check` 变 worker-only 聚合器，新增 `release:check:phase2` 聚合 host 门；release.yml 拆 `release-worker` / `release-host` 两 job 无 `needs`；lint.yml 加 `checks` job。自锁契约（`scripts/check-doc-contract.ts` + `docs/testing.md`）同步成双门形态，`bun run docs:check` 是主验证门。

**Tech Stack:** bun workspaces、GitHub Actions、bun `--filter`、项目自研 doc-contract 校验器。

**Spec:** `docs/superpowers/specs/2026-06-10-release-gate-split-design.md`

---

## 文件结构（改动面）

- `package.json` — 新增 `test:host` / `test:worker` / `build:host`；重写 `release:check`（worker-only）；新增 `release:check:phase2`。
- `docs/testing.md` — 「## Current Release Gates」段从一个 fence 改两个 fence（worker + phase2）；「## Release Exit Criteria」措辞更新。
- `scripts/check-doc-contract.ts` — `expectedReleaseGateCommands` 缩成 worker 门；新增 `expectedPhase2GateCommands` + `release:check:phase2` 等值校验；`requireIncludes('docs/testing.md', …)` 同步双 fence 字符串；release.yml 结构断言补双 job/无 needs/phase2 门/第二 publish。
- `.github/workflows/release.yml` — 拆 `release-worker` + `release-host` 两 job。
- `.github/workflows/lint.yml` — 新增 `checks` job。

---

## Task 1: 新增分组脚本 test:host / test:worker / build:host

**Files:**
- Modify: `package.json`（scripts 段）

- [ ] **Step 1: 在 package.json scripts 加三个脚本**

在 `package.json` 的 `scripts` 中，紧邻现有 `"test": "bun run --filter '*' test",` 之后加入：

```jsonc
"test:host": "bun run --filter '@zonease/aiworker-host-*' test",
"test:worker": "bun run --filter '!@zonease/aiworker-host-*' test",
```

在现有 `"build": "...",` 之后加入：

```jsonc
"build:host": "bun run --filter '@zonease/aiworker-host-web' build && bun run --filter '@zonease/aiworker-host-cli' build:bundle",
```

- [ ] **Step 2: 验证 test:host 只跑 host 包**

Run: `bun run test:host 2>&1 | tail -20`
Expected: 只调度 `@zonease/aiworker-host-cli` / `@zonease/aiworker-host-web`（含已知 host-lifecycle tmux flake，首跑红可隔离重跑判 flake，不阻断本步——本步只验证 filter 圈定范围正确）。

- [ ] **Step 3: 验证 test:worker 排除 host 包（R1：bun 负向 filter）**

Run: `bun run test:worker 2>&1 | tail -30`
Expected: 调度列表**不含**任何 `@zonease/aiworker-host-*`。
**若 bun 负向 filter `'!…'` 不生效**（调度里仍出现 host 包，或报 filter 语法错）：回退为显式枚举——把 `test:worker` 改为列出所有非 host 工作区包：`bun run --filter '@zonease/aiworker-worker-*' --filter '@zonease/aiworker-soul-*' --filter '@zonease/aiworker-engine-*' --filter '@zonease/aiworker-storage-sqlite' --filter '@zonease/aiworker-fs-layout' --filter '@zonease/aiworker-cli-doctor' --filter '@zonease/aiworker-ui' --filter '@zonease/aiworker-freeform' test`，先 `bun pm ls --all` 核对真实包名再定稿。

- [ ] **Step 4: 验证 build:host 产出 host dist**

Run: `bun run build:host 2>&1 | tail -10 && ls apps/host-cli/dist apps/host-web/dist 2>&1 | head`
Expected: 退出 0，host-cli/host-web 的 dist 存在。

- [ ] **Step 5: docs:check 仍绿（新增脚本未进任何门，不破契约）**

Run: `bun run docs:check`
Expected: exit 0。

- [ ] **Step 6: Commit**

```bash
git add package.json
git commit -m "build(release): 新增 test:worker/test:host/build:host 分组脚本"
```

---

## Task 2: 原子拆门——package.json + testing.md + check-doc-contract.ts

> 这三处由自锁契约绑定，必须同一 commit 落地。验证门 = `bun run docs:check`。

**Files:**
- Modify: `package.json`（release:check 重写 + 新增 release:check:phase2）
- Modify: `docs/testing.md`（Current Release Gates 双 fence + Release Exit Criteria）
- Modify: `scripts/check-doc-contract.ts`（worker 数组缩减 + phase2 数组与校验 + requireIncludes 同步）

- [ ] **Step 1: 重写 package.json 的 release:check 为 worker-only，并新增 release:check:phase2**

把 `"release:check": "..."` 整行替换为下面两行（worker 门去掉 `test:browser:phase2`/`smoke:host-dist-release`/尾部 `bun run check`，`bun run test`→`bun run test:worker`）：

```jsonc
"release:check": "bun run docs:check && bun run test:contracts && bun run test:protocol && bun run test:cli && bun run test:browser:freeform && bun run typecheck && bun run lint && bun run build && bun run smoke:dist-release && bun run smoke:standalone-release && bun run smoke:standalone-runtime && bun run smoke:npm-package && bun run test:worker",
"release:check:phase2": "bun run build:host && bun run test:browser:phase2 && bun run smoke:host-dist-release && bun run test:host",
```

- [ ] **Step 2: 重写 docs/testing.md「## Current Release Gates」段为双 fence**

把 `docs/testing.md` 从 `## Current Release Gates`（约 219 行）到该段结尾 `must stay in sync with the commands above.`（约 243 行）整段替换为：

````markdown
## Current Release Gates

Release confidence is split into two independent gates so a Phase 2 (Host) flake
cannot block a worker release.

Worker v1 release confidence is built from these gates:

```text
bun run docs:check
bun run test:contracts
bun run test:protocol
bun run test:cli
bun run test:browser:freeform
bun run typecheck
bun run lint
bun run build
bun run smoke:dist-release
bun run smoke:standalone-release
bun run smoke:standalone-runtime
bun run smoke:npm-package
bun run test:worker
```

Phase 2 (Host) release confidence is built from these gates:

```text
bun run build:host
bun run test:browser:phase2
bun run smoke:host-dist-release
bun run test:host
```

`bun run release:check` is the aggregator for the worker gate list, and
`bun run release:check:phase2` is the aggregator for the Phase 2 gate list. Each
must stay in sync with the commands above.
````

- [ ] **Step 3: 更新 docs/testing.md「## Release Exit Criteria」首句**

把 `` `bun run release:check` must exactly aggregate the Current Release Gates. `` 替换为：

```markdown
`bun run release:check` must exactly aggregate the worker gate list and
`bun run release:check:phase2` must exactly aggregate the Phase 2 gate list.
```

- [ ] **Step 4: check-doc-contract.ts —— 缩 worker 期望数组**

把 `expectedReleaseGateCommands`（约 595-612 行）整个数组替换为 worker-only：

```ts
const expectedReleaseGateCommands = [
  'bun run docs:check',
  'bun run test:contracts',
  'bun run test:protocol',
  'bun run test:cli',
  'bun run test:browser:freeform',
  'bun run typecheck',
  'bun run lint',
  'bun run build',
  'bun run smoke:dist-release',
  'bun run smoke:standalone-release',
  'bun run smoke:standalone-runtime',
  'bun run smoke:npm-package',
  'bun run test:worker',
]
```

- [ ] **Step 5: check-doc-contract.ts —— 新增 phase2 门等值校验**

紧接 `releaseCheckCommands` 那段校验（约 629-635 行）之后插入：

```ts
const expectedPhase2GateCommands = [
  'bun run build:host',
  'bun run test:browser:phase2',
  'bun run smoke:host-dist-release',
  'bun run test:host',
]
const phase2CheckCommands = packageJson.scripts?.['release:check:phase2']?.split(' && ') ?? []
if (JSON.stringify(phase2CheckCommands) !== JSON.stringify(expectedPhase2GateCommands)) {
  issues.push({
    file: 'package.json',
    message: `release:check:phase2 must list exactly: ${expectedPhase2GateCommands.join(', ')}`,
  })
}
for (const command of expectedPhase2GateCommands) {
  const scriptName = command.match(/^bun run ([\w:-]+)$/)?.[1]
  if (scriptName && !packageJson.scripts?.[scriptName])
    issues.push({ file: 'package.json', message: `Phase 2 release gate references missing root script: ${scriptName}` })
}
```

- [ ] **Step 6: check-doc-contract.ts —— 同步 requireIncludes('docs/testing.md', …) 字符串**

在 `requireIncludes('docs/testing.md', [...])`（461-566 行）中：

1. 删除字符串 `'Current release confidence is built from these gates:'`（约 472 行）。
2. 把第 473 行那段 16-gate 块字符串替换为 worker 块字符串：
   ```ts
   'bun run docs:check\nbun run test:contracts\nbun run test:protocol\nbun run test:cli\nbun run test:browser:freeform\nbun run typecheck\nbun run lint\nbun run build\nbun run smoke:dist-release\nbun run smoke:standalone-release\nbun run smoke:standalone-runtime\nbun run smoke:npm-package\nbun run test:worker',
   ```
3. 新增三条字符串（与 Step 2 文案逐字一致）：
   ```ts
   'Worker v1 release confidence is built from these gates:',
   'Phase 2 (Host) release confidence is built from these gates:',
   'bun run build:host\nbun run test:browser:phase2\nbun run smoke:host-dist-release\nbun run test:host',
   ```
4. 把 `'`bun run release:check` is the aggregator for this current release gate list.'`（474 行）替换为：
   ```ts
   '`bun run release:check` is the aggregator for the worker gate list, and',
   ```
5. 把 `'`bun run release:check` must exactly aggregate the Current Release Gates.'`（475 行）替换为：
   ```ts
   '`bun run release:check` must exactly aggregate the worker gate list and',
   ```

> 注意：`documentedReleaseGateCommands()`（1047 行）读「## Current Release Gates」后**第一个** fence——即 worker fence——无需改它；它返回 worker 列表，与缩减后的 `expectedReleaseGateCommands` 比对。phase2 门由 Step 5 静态数组对 package.json 校验 + Step 6.3 的 doc 块字符串锁定，无需第二解析器。

- [ ] **Step 7: 运行 docs:check（主验证门）**

Run: `bun run docs:check`
Expected: exit 0。若红，按报错指向逐条核对 Step 2/4/5/6 的字符串是否与 testing.md 逐字一致（含 `\n`、反引号、句末）。

- [ ] **Step 8: 静态核对 worker 门不含 host 项**

Run: `node -e "const p=require('./package.json');const c=p.scripts['release:check'];console.log(['test:browser:phase2','smoke:host-dist-release','test:host',' check'].filter(x=>c.includes(x)))"`
Expected: `[]`（worker 门内无任何 host/phase2 项、无冗余 `check`）。

- [ ] **Step 9: Commit**

```bash
git add package.json docs/testing.md scripts/check-doc-contract.ts
git commit -m "build(release): 拆 release:check 为 worker 门 + release:check:phase2 双门"
```

---

## Task 3: release.yml 拆两个互不依赖的 job + 契约结构断言

**Files:**
- Modify: `.github/workflows/release.yml`
- Modify: `scripts/check-doc-contract.ts`（748-776 结构断言）

- [ ] **Step 1: 重写 release.yml 的 jobs 为 release-worker + release-host**

把 `release.yml` 现有单 `release:` job 替换为下面两个 job（保持 `name/on/permissions` 头不变）。`release-host` **无 `needs`**，与 worker 并行、各自成败：

```yaml
jobs:
  release-worker:
    runs-on: ubuntu-latest
    env:
      NODE_OPTIONS: --max-old-space-size=1024
      HUSKY: 0
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: '24'
          registry-url: https://registry.npmjs.org
      - uses: oven-sh/setup-bun@v2
      - name: Install dependencies
        run: bun install --frozen-lockfile
      - name: Install Playwright browser
        run: bunx playwright install --with-deps chromium
      - name: Assert git tag matches worker-cli version
        run: |
          set -euo pipefail
          tag_version="${GITHUB_REF_NAME#v}"
          worker_version="$(node -p "require('./apps/worker-cli/package.json').version")"
          if [[ "$tag_version" != "$worker_version" ]]; then
            echo "git tag/worker-cli version mismatch — tag=$tag_version worker-cli=$worker_version" >&2
            exit 1
          fi
          echo "git tag matches worker-cli version: $tag_version"
      - name: Release check
        run: bun run release:check
      - name: Compile single-file binaries
        run: |
          set -euo pipefail
          bun build --compile --target=bun-linux-x64    --outfile=aiworker-linux-x64    apps/worker-cli/src/aiworker.ts
          bun build --compile --target=bun-linux-arm64  --outfile=aiworker-linux-arm64  apps/worker-cli/src/aiworker.ts
          bun build --compile --target=bun-darwin-x64   --outfile=aiworker-darwin-x64   apps/worker-cli/src/aiworker.ts
          bun build --compile --target=bun-darwin-arm64 --outfile=aiworker-darwin-arm64 apps/worker-cli/src/aiworker.ts
      - name: Package binary release bundles
        run: bun apps/worker-cli/scripts/package-release-bundles.ts
      - name: Smoke release artifacts
        run: bun apps/worker-cli/scripts/smoke-release-artifacts.ts
      - name: Derive npm dist-tag from git tag
        id: channel
        run: |
          set -euo pipefail
          tag="${GITHUB_REF_NAME}"
          if [[ "$tag" == *-* ]]; then
            channel="$(printf '%s' "$tag" | sed -E 's/^v[0-9]+\.[0-9]+\.[0-9]+-([A-Za-z]+).*/\1/')"
          else
            channel="latest"
          fi
          if [[ -z "$channel" ]]; then
            echo "could not derive npm dist-tag from git tag: $tag" >&2
            exit 1
          fi
          echo "channel=$channel" >> "$GITHUB_OUTPUT"
          echo "npm dist-tag for $tag => $channel"
      - name: Publish to npm
        working-directory: apps/worker-cli/dist
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: npm publish --provenance --access public --tag "${{ steps.channel.outputs.channel }}"
      - name: Attach binaries to GitHub Release
        uses: softprops/action-gh-release@v3
        with:
          fail_on_unmatched_files: true
          prerelease: ${{ contains(github.ref_name, '-') }}
          files: |
            aiworker-linux-x64.tar.gz
            aiworker-linux-arm64.tar.gz
            aiworker-darwin-x64.tar.gz
            aiworker-darwin-arm64.tar.gz
            aiworker-linux-x64.tar.gz.sha256
            aiworker-linux-arm64.tar.gz.sha256
            aiworker-darwin-x64.tar.gz.sha256
            aiworker-darwin-arm64.tar.gz.sha256

  release-host:
    runs-on: ubuntu-latest
    env:
      NODE_OPTIONS: --max-old-space-size=1024
      HUSKY: 0
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: '24'
          registry-url: https://registry.npmjs.org
      - uses: oven-sh/setup-bun@v2
      - name: Install dependencies
        run: bun install --frozen-lockfile
      - name: Install Playwright browser
        run: bunx playwright install --with-deps chromium
      - name: Assert git tag matches host-cli version
        run: |
          set -euo pipefail
          tag_version="${GITHUB_REF_NAME#v}"
          host_version="$(node -p "require('./apps/host-cli/package.json').version")"
          if [[ "$tag_version" != "$host_version" ]]; then
            echo "git tag/host-cli version mismatch — tag=$tag_version host-cli=$host_version" >&2
            exit 1
          fi
          echo "git tag matches host-cli version: $tag_version"
      - name: Phase 2 release check
        run: bun run release:check:phase2
      - name: Derive npm dist-tag from git tag
        id: channel
        run: |
          set -euo pipefail
          tag="${GITHUB_REF_NAME}"
          if [[ "$tag" == *-* ]]; then
            channel="$(printf '%s' "$tag" | sed -E 's/^v[0-9]+\.[0-9]+\.[0-9]+-([A-Za-z]+).*/\1/')"
          else
            channel="latest"
          fi
          if [[ -z "$channel" ]]; then
            echo "could not derive npm dist-tag from git tag: $tag" >&2
            exit 1
          fi
          echo "channel=$channel" >> "$GITHUB_OUTPUT"
      - name: Publish Host CLI to npm
        working-directory: apps/host-cli/dist
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: npm publish --provenance --access public --tag "${{ steps.channel.outputs.channel }}"
```

- [ ] **Step 2: 更新 check-doc-contract.ts 的 release.yml 结构断言**

在 release.yml 结构断言块（约 764-776 行）之后插入补充断言（worker 顺序断言保持不变，仍校验 worker job 内 release:check→compile→package→smoke→publish→attach 顺序）：

```ts
if (!releaseWorkflow.includes('bun run release:check:phase2'))
  issues.push({ file: '.github/workflows/release.yml', message: 'release must run release:check:phase2 in a host job' })
if (!releaseWorkflow.includes('release-worker:') || !releaseWorkflow.includes('release-host:'))
  issues.push({ file: '.github/workflows/release.yml', message: 'release must declare independent release-worker and release-host jobs' })
if (releaseWorkflow.includes('needs:'))
  issues.push({ file: '.github/workflows/release.yml', message: 'release-worker and release-host must be independent — no needs coupling so a host flake cannot block worker publish' })
if ((releaseWorkflow.match(/npm publish --provenance --access public/g) ?? []).length < 2)
  issues.push({ file: '.github/workflows/release.yml', message: 'release must publish both worker-cli and host-cli' })
```

- [ ] **Step 3: 运行 docs:check**

Run: `bun run docs:check`
Expected: exit 0。

- [ ] **Step 4: 校验 release.yml 为合法 YAML 且双 job 无 needs**

Run: `node -e "const y=require('fs').readFileSync('.github/workflows/release.yml','utf8');console.log('has release-worker:',y.includes('release-worker:'),'has release-host:',y.includes('release-host:'),'has needs:',y.includes('needs:'),'publish count:',(y.match(/npm publish --provenance/g)||[]).length)"`
Expected: `has release-worker: true has release-host: true has needs: false publish count: 2`。

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/release.yml scripts/check-doc-contract.ts
git commit -m "ci(release): 拆 release-worker/release-host 两 job,host 门红不连累 worker"
```

---

## Task 4: lint.yml 补 PR 确定性门（typecheck + test:contracts）

**Files:**
- Modify: `.github/workflows/lint.yml`

- [ ] **Step 1: 在 lint.yml 新增 checks job**

在 `lint.yml` 的 `jobs:` 下、`lint:` job 之后追加：

```yaml
  checks:
    runs-on: ubuntu-latest
    env:
      NODE_OPTIONS: --max-old-space-size=1024
      HUSKY: 0
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: '24'
      - uses: oven-sh/setup-bun@v2
      - name: Install dependencies
        run: bun install --frozen-lockfile
      - name: Typecheck
        run: bun run typecheck
      - name: Contract tests
        run: bun run test:contracts
```

- [ ] **Step 2: 运行 docs:check（确认 lint.yml node24 断言仍满足）**

Run: `bun run docs:check`
Expected: exit 0。

- [ ] **Step 3: 校验 lint.yml 合法 YAML 且含新 job**

Run: `node -e "const y=require('fs').readFileSync('.github/workflows/lint.yml','utf8');console.log('has checks job:',y.includes('checks:'),'runs typecheck:',y.includes('bun run typecheck'),'runs contracts:',y.includes('bun run test:contracts'))"`
Expected: 三个都 `true`。

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/lint.yml
git commit -m "ci(pr): PR/push 补 typecheck + test:contracts 确定性门"
```

---

## Task 5: 全量本地验收（DoD）

> 不改代码，只跑验收。worker 门很长（build + 多 smoke + browser），用后台跑。

- [ ] **Step 1: PR 门两件事（确定性，应稳过）**

Run: `bun run typecheck && bun run test:contracts`
Expected: exit 0。

- [ ] **Step 2: docs:check（三处锁定已同步）**

Run: `bun run docs:check`
Expected: exit 0。

- [ ] **Step 3: worker 门全量（后台，长）**

Run: `bun run release:check`（后台运行，完成后看退出码）
Expected: exit 0。worker 门内全确定性、无 host flaky 成员。

- [ ] **Step 4: phase2 门（host，可能 flake）**

Run: `bun run release:check:phase2`
Expected: exit 0。host 三 spec / tmux 首跑若 flake，隔离重跑判 flake（既有惯例），非真回归不阻断。

- [ ] **Step 5: 终检 git diff 面**

Run: `git diff --name-only main...HEAD`
Expected: 只含 `package.json`、`docs/testing.md`、`scripts/check-doc-contract.ts`、`.github/workflows/release.yml`、`.github/workflows/lint.yml`、`docs/superpowers/specs/...`、`docs/superpowers/plans/...`——**无任何 worker/host 运行时源码文件**。

---

## Self-Review 记录

- **Spec 覆盖**：3.1→Task1+2；3.2→Task3；3.3→Task4；3.4→Task2(契约/doc)+Task3(release.yml 断言)；DoD 1-6→Task5 + 各 task 的 docs:check 步。无遗漏。
- **类型/命名一致**：`test:worker`/`test:host`/`build:host`/`release:check:phase2`/`expectedPhase2GateCommands` 全程同名。
- **占位符**：无 TBD；R1 给了明确回退路径（枚举）而非占位。
- **原子性**：Task2 三文件同 commit（自锁契约要求），Task3 release.yml 与其结构断言同 commit。每个 commit 末尾 docs:check 绿，过程不留红 main。
