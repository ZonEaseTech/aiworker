import antfu from '@antfu/eslint-config'

export default antfu({
  typescript: true,
  react: true,
  ignores: ['dist', 'node_modules', '.agents', '.serena', 'docs', '**/routeTree.gen.ts', '**/drizzle/**'],
}, {
  // PLAN-015 §S1：`@aiworker/core` 必须保持 transport-agnostic。
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
})
