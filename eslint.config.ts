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
  // PLAN-022 / FEAT-033：apps/web 双视角物理隔离。fleet 视角不得引用 worker 视角；
  // 共享请放 apps/web/src/shared/。pattern 锁定 alias 与从 fleet 子树回到
  // `src/worker` 的相对路径，不通配 `**/worker/*`（会误伤 node_modules 里
  // 碰巧叫 worker 的路径）。
  files: ['apps/web/src/fleet/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        {
          group: [
            '@/worker',
            '@/worker/**',
            '../worker',
            '../worker/**',
            '../../worker',
            '../../worker/**',
            '../../../worker',
            '../../../worker/**',
            '../../../../worker',
            '../../../../worker/**',
            '../../../../../worker',
            '../../../../../worker/**',
          ],
          message: 'fleet 视角不得引用 worker 视角；共享请放 @/shared/。',
        },
      ],
    }],
  },
}, {
  // PLAN-022 / FEAT-034：fleet 视角的数据通道**只**许走 gateway WS 协议
  // (`@/fleet/lib/gateway-client`) 与 fleet api 包装层 (`@/fleet/api`)。任何
  // 直接 fetch worker REST `/api/worker/*` 的代码都属于回退耦合——配置 / secrets
  // / cron / approvals 是 worker 自管面，fleet UI 只做「跳转到 worker.baseUrl
  // + /admin/」按钮，不内嵌。
  files: [
    'apps/web/src/fleet/api.ts',
    'apps/web/src/fleet/features/**/*.{ts,tsx}',
    'apps/web/src/fleet/routes/**/*.{ts,tsx}',
  ],
  rules: {
    'no-restricted-syntax': ['error', {
      selector: 'CallExpression[callee.name="fetch"] > Literal[value=/^\\/api\\/worker\\//]',
      message: 'fleet 视角禁止直接 fetch worker REST `/api/worker/*`；走 gateway WS 协议或在 worker bundle 内实现。',
    }, {
      selector: 'CallExpression[callee.name="fetch"] > TemplateLiteral',
      message: 'fleet 视角禁止裸 fetch；统一走 @/fleet/api 经 gateway-client。如果是 health / openapi 类需求请明确说明。',
    }],
  },
}, {
  // PLAN-022 / FEAT-033 / FEAT-035：worker 视角不得引用 fleet 视角或
  // gateway WS 协议；共享请放 @/shared/，worker 自管数据通道只走
  // `/api/worker/*` REST/SSE。
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
          ],
          message: 'worker 视角不得引用 fleet 视角；共享请放 @/shared/。',
        },
        { group: ['@zonease/aiworker-gateway-proto', '@zonease/aiworker-gateway-proto/**'], message: 'worker UI 不得接 gateway WS/proto；请使用 /api/worker/* REST/SSE。' },
      ],
    }],
  },
}, {
  // PLAN-022 / FEAT-033：shared 不得反向依赖任一视角的 features/routes/lib/api。
  // shared 是双视角通用底座，反向依赖会让其中一边私有耦合泄漏到另一边。
  // 同时拦 alias 与从 shared 子树回到 fleet/worker 的相对路径。
  files: ['apps/web/src/shared/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        {
          group: [
            '@/fleet',
            '@/fleet/features/**',
            '@/fleet/routes/**',
            '@/fleet/lib/**',
            '@/fleet/api',
            '../fleet',
            '../fleet/**',
            '../../fleet',
            '../../fleet/**',
            '../../../fleet',
            '../../../fleet/**',
            '../../../../fleet',
            '../../../../fleet/**',
          ],
          message: 'shared 不得反向依赖 fleet 视角的 features/routes/lib/api。',
        },
        {
          group: [
            '@/worker',
            '@/worker/features/**',
            '@/worker/routes/**',
            '@/worker/lib/**',
            '@/worker/api',
            '../worker',
            '../worker/**',
            '../../worker',
            '../../worker/**',
            '../../../worker',
            '../../../worker/**',
            '../../../../worker',
            '../../../../worker/**',
          ],
          message: 'shared 不得反向依赖 worker 视角的 features/routes/lib/api。',
        },
      ],
    }],
  },
})
