import antfu from '@antfu/eslint-config'

export default antfu({
  typescript: true,
  react: true,
  ignores: ['dist', 'node_modules', '.agents', '.serena', 'docs', '**/routeTree.gen.ts', '**/drizzle/**'],
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
  // fleet/admin/shared shell、gateway proto 或文件路由再带回 Web。
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
        { group: ['@zonease/aiworker-gateway-proto', '@zonease/aiworker-gateway-proto/**'], message: 'worker UI 不得接 gateway WS/proto；请使用 /api/worker/* REST/SSE。' },
        { group: ['@tanstack/react-router', '@tanstack/router-plugin', '@tanstack/*'], message: 'Worker Web 不再使用旧 routeTree/router 壳。' },
      ],
    }],
  },
})
