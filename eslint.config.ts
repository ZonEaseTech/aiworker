import antfu from '@antfu/eslint-config'

const soulAppHostPrivateImportPatterns = [
  { group: ['@zonease/aiworker-api', '@zonease/aiworker-api/**'], message: 'Soul App code must not import Host API internals; use the Soul App SDK or mounted broker routes.' },
  { group: ['@zonease/aiworker-cli', '@zonease/aiworker-cli/**'], message: 'Soul App code must not import Host CLI internals; use app scripts and the SDK boundary.' },
  { group: ['@zonease/aiworker-core', '@zonease/aiworker-core/**'], message: 'Soul App code must not import Host core internals; use @zonease/aiworker-soul-app-sdk.' },
  { group: ['@zonease/aiworker-shared', '@zonease/aiworker-shared/**'], message: 'Soul App code must not import shared Host contracts directly; use @zonease/aiworker-soul-app-sdk exports.' },
  { group: ['@zonease/aiworker-storage-sqlite', '@zonease/aiworker-storage-sqlite/**'], message: 'Soul App code must not access Host storage directly; use local runtime or brokered routes.' },
  { group: ['@zonease/aiworker-web', '@zonease/aiworker-web/**'], message: 'Soul App code must not import Host Web internals; declare UI through the manifest.' },
  { group: ['apps/api/**', 'apps/cli/**', 'apps/web/**', 'packages/core/**', 'packages/shared/**', 'packages/storage-sqlite/**'], message: 'Soul App code must stay inside the public SDK boundary.' },
]

export default antfu({
  typescript: true,
  react: true,
  ignores: ['dist', 'node_modules', '.agents', '.serena', 'docs', '**/routeTree.gen.ts', '**/drizzle/**'],
}, {
  // FEAT-066: Soul Apps are runnable app workspaces. They may depend on the
  // public SDK, but not on Host internals or sibling app internals.
  files: ['apps/aiworker-hr/src/**/*.{ts,tsx}', 'apps/aiworker-qa/src/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: soulAppHostPrivateImportPatterns,
    }],
  },
}, {
  files: ['apps/aiworker-hr/src/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        ...soulAppHostPrivateImportPatterns,
        { group: ['@zonease/aiworker-qa', '@zonease/aiworker-qa/**', 'apps/aiworker-qa/**', '**/apps/aiworker-qa/**'], message: 'Soul Apps must not import sibling app internals.' },
      ],
    }],
  },
}, {
  files: ['apps/aiworker-qa/src/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        ...soulAppHostPrivateImportPatterns,
        { group: ['@zonease/aiworker-hr', '@zonease/aiworker-hr/**', 'apps/aiworker-hr/**', '**/apps/aiworker-hr/**'], message: 'Soul Apps must not import sibling app internals.' },
      ],
    }],
  },
}, {
  files: ['apps/api/**/*.{ts,tsx}', 'apps/cli/**/*.{ts,tsx}', 'apps/web/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
  ignores: ['apps/aiworker-hr/**/*', 'apps/aiworker-qa/**/*'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: ['apps/aiworker-hr/src/**', '**/apps/aiworker-hr/src/**', 'apps/aiworker-qa/src/**', '**/apps/aiworker-qa/src/**'], message: 'Host code must not import Soul App internals; use manifest discovery and app-owned public scripts.' },
      ],
    }],
  },
}, {
  // PLAN-015 §S1：`@zonease/aiworker-core` 必须保持 transport-agnostic。
  // 任何对 Hono / Scalar / apps/* 的引用都视为越界，CI 跑 lint 时即拦下回退。
  files: ['packages/core/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: ['hono', 'hono/*'], message: 'packages/core 不应引入 Hono；请在 apps/api 的路由层处理 transport 细节。' },
        { group: ['@hono/*'], message: 'packages/core 不应引入 @hono/*；请在 apps/api 的路由层处理 transport 细节。' },
        { group: ['@scalar/*'], message: 'packages/core 不应引入 @scalar/*；OpenAPI 文档面属于 apps/api。' },
        { group: ['apps/*', '**/apps/*'], message: 'packages/core 严禁反向依赖 apps/*；公共面通过 packages/core/src/index.ts 暴露。' },
      ],
    }],
  },
}, {
  // REFACTOR-038：apps/web 是 worker-only local studio。不要把停掉的
  // fleet/admin/shared shell 或文件路由再带回 Web。
  files: ['apps/web/src/worker/**/*.{ts,tsx}'],
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
})
