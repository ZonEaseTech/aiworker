export const soulWorkbenchPackage = {
  name: '@zonease/aiworker-soul-workbench',
  // Owns the interactive SDK common workbench micro-app (方案 C, docs/soul-authoring.md).
  // The built bundle lives at dist/web/workbench; soul-app-sdk copies it for the
  // sdk-common fallback. Modules are filled out across the workbench sub-projects.
  owns: [
    'common-workbench-micro-app',
    'configuration-ui',
    'skills-mcp-ui',
    'artifact-primitives',
    'chat-surface',
    'mounted-client-helpers',
  ],
} as const
