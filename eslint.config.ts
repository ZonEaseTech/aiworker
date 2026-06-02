import antfu from '@antfu/eslint-config'

const soulAppHostPrivateImportPatterns = [
  { group: ['@zonease/aiworker-cli', '@zonease/aiworker-cli/**'], message: 'Soul App code must not import Host CLI internals; use app scripts and the SDK boundary.' },
  { group: ['@zonease/aiworker-worker-runtime', '@zonease/aiworker-worker-runtime/**'], message: 'Soul App code must not import Host runtime internals; use @zonease/aiworker-soul-sdk.' },
  { group: ['@zonease/aiworker-worker-daemon', '@zonease/aiworker-worker-daemon/**'], message: 'Soul App code must not import Host daemon internals; use SDK descriptors or mounted broker routes.' },
  { group: ['@zonease/aiworker-soul-descriptor', '@zonease/aiworker-soul-descriptor/**'], message: 'Soul App code must not import Host/Soul protocol internals directly; use @zonease/aiworker-soul-sdk exports.' },
  { group: ['@zonease/aiworker-storage-sqlite', '@zonease/aiworker-storage-sqlite/**'], message: 'Soul App code must not access Host storage directly; use local runtime or brokered routes.' },
  { group: ['@zonease/aiworker-worker-web', '@zonease/aiworker-worker-web/**'], message: 'Soul App code must not import Host Web internals; declare UI through the descriptor.' },
  { group: ['@zonease/aiworker-api', '@zonease/aiworker-api/**'], message: 'Soul App code must not import the retired apps/api package; use the Soul App SDK or mounted broker routes.' },
  { group: ['@zonease/aiworker-core', '@zonease/aiworker-core/**'], message: 'Soul App code must not import retired Host core internals; use @zonease/aiworker-soul-sdk.' },
  { group: ['@zonease/aiworker-shared', '@zonease/aiworker-shared/**'], message: 'Soul App code must not import retired shared Host contracts; use @zonease/aiworker-soul-sdk exports.' },
  { group: ['@zonease/aiworker-soul-app-workbench', '@zonease/aiworker-soul-app-workbench/**'], message: 'Soul App code must not import the retired Soul App workbench package; use descriptor-owned workbench assets.' },
  { group: ['apps/api/**', 'apps/worker-cli/**', 'apps/worker-web/**', 'packages/core/**', 'packages/shared/**', 'packages/soul-app-workbench/**', 'packages/storage-sqlite/**'], message: 'Soul App code must stay inside the public SDK boundary; listed legacy paths are forbidden only as retired imports.' },
]

export default antfu({
  typescript: true,
  react: true,
  ignores: ['dist', 'node_modules', '.agents', '.serena', 'docs', '**/routeTree.gen.ts', '**/drizzle/**'],
}, {
  // FEAT-066: Soul Apps are runnable app workspaces. They may depend on the
  // public SDK, but not on Host internals or sibling app internals.
  files: ['souls/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: soulAppHostPrivateImportPatterns,
    }],
  },
}, {
  files: ['apps/worker-cli/**/*.{ts,tsx}', 'apps/worker-web/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
  ignores: ['souls/**/*'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: ['apps/aiworker-*/**', '**/apps/aiworker-*/**'], message: 'Host code must not import retired app-local Soul internals; use descriptor discovery and app-owned public scripts.' },
      ],
    }],
  },
}, {
  // REFACTOR-038：apps/worker-web 是 worker-only local studio。不要把停掉的
  // fleet/admin/shared shell 或文件路由再带回 Web。
  files: ['apps/worker-web/src/worker/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        {
          group: [
            '@/fleet',
            '@/fleet/**',
            '../fleet',
            '../fleet/**',
            '../../fleet',
            '../../fleet/**',
            '../../../fleet',
            '../../../fleet/**',
            '../../../../fleet',
            '../../../../fleet/**',
            '../../../../../fleet',
            '../../../../../fleet/**',
            '@/shared',
            '@/shared/**',
            '../shared',
            '../shared/**',
            '../../shared',
            '../../shared/**',
          ],
          message: 'Worker Web 是独立 studio，不得引用旧 fleet/shared admin shell。',
        },
        { group: ['@tanstack/react-router', '@tanstack/router-plugin', '@tanstack/*'], message: 'Worker Web 不再使用旧 routeTree/router 壳。' },
      ],
    }],
  },
}, {
  // REFACTOR: apps/cli 改名为 apps/worker-cli 后，antfu 默认对 `**/cli/**` 目录的
  // top-level await 豁免不再匹配。CLI 入口（worker-cli 的 aiworker.ts、host-cli 的
  // aiworker-host.ts）用 `process.exit(await runCli())` 是标准模式，这里恢复该豁免。
  files: ['apps/worker-cli/**/*.ts', 'apps/host-cli/**/*.ts'],
  rules: {
    'antfu/no-top-level-await': 'off',
  },
})
