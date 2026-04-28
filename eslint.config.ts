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
  // 共享请放 apps/web/src/shared/。pattern 仅锁定 alias `@/worker/*` 与 web src
  // 内部相对路径，不通配 `**/worker/*`（会误伤 node_modules 里碰巧叫 worker 的
  // 路径）。
  files: ['apps/web/src/fleet/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: ['@/worker', '@/worker/**'], message: 'fleet 视角不得引用 worker 视角；共享请放 @/shared/。' },
      ],
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
        { group: ['@/fleet', '@/fleet/**'], message: 'worker 视角不得引用 fleet 视角；共享请放 @/shared/。' },
        { group: ['@zonease/aiworker-gateway-proto', '@zonease/aiworker-gateway-proto/**'], message: 'worker UI 不得接 gateway WS/proto；请使用 /api/worker/* REST/SSE。' },
      ],
    }],
  },
}, {
  // PLAN-022 / FEAT-033：shared 不得反向依赖任一视角的 features/routes/lib/api。
  // shared 是双视角通用底座，反向依赖会让其中一边私有耦合泄漏到另一边。
  // pattern 同样只锁定 alias 形态——shared 里相对路径根本到不了 fleet/worker
  // （目录结构隔了），无须再加 `**/...` 通配。
  files: ['apps/web/src/shared/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: ['@/fleet', '@/fleet/features/**', '@/fleet/routes/**', '@/fleet/lib/**', '@/fleet/api'], message: 'shared 不得反向依赖 fleet 视角的 features/routes/lib/api。' },
        { group: ['@/worker', '@/worker/features/**', '@/worker/routes/**', '@/worker/lib/**', '@/worker/api'], message: 'shared 不得反向依赖 worker 视角的 features/routes/lib/api。' },
      ],
    }],
  },
})
