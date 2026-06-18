import antfu from '@antfu/eslint-config'

const retiredAiworkerSurfaces = [
  '@zonease/aiworker-host-cli',
  '@zonease/aiworker-host-cli/**',
  '@zonease/aiworker-worker-runtime',
  '@zonease/aiworker-worker-runtime/**',
  '@zonease/aiworker-worker-daemon',
  '@zonease/aiworker-worker-daemon/**',
  '@zonease/aiworker-worker-web',
  '@zonease/aiworker-worker-web/**',
  '@zonease/aiworker-engine-bridge',
  '@zonease/aiworker-engine-bridge/**',
  '@zonease/aiworker-engine-projection',
  '@zonease/aiworker-engine-projection/**',
  '@zonease/aiworker-worker-control-protocol',
  '@zonease/aiworker-worker-control-protocol/**',
  '@zonease/aiworker-storage-sqlite',
  '@zonease/aiworker-storage-sqlite/**',
  '@zonease/aiworker-ui',
  '@zonease/aiworker-ui/**',
]

export default antfu({
  typescript: true,
  react: false,
  ignores: ['dist', '**/dist/**', '**/dist-server/**', 'node_modules', '.agents', '.omx', '.serena', 'docs'],
}, {
  files: ['**/*.{ts,tsx}'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: retiredAiworkerSurfaces.map(group => ({
        group: [group],
        message: 'Retired AIWorker Worker runtime/Web/daemon surfaces must not be reintroduced; AIWorker is a thin Paseo workspace distribution layer.',
      })),
    }],
  },
}, {
  files: ['souls/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        ...retiredAiworkerSurfaces.map(group => ({
          group: [group],
          message: 'Soul packages may only use @zonease/aiworker-soul-sdk; they project workspace files for Paseo.',
        })),
        {
          group: ['@zonease/aiworker-control', '@zonease/aiworker-control/**'],
          message: 'Soul packages must not depend on AIWorker assignment/provisioning code; use @zonease/aiworker-soul-sdk.',
        },
      ],
    }],
  },
}, {
  files: ['apps/aiworker-cli/**/*.ts'],
  rules: {
    'antfu/no-top-level-await': 'off',
  },
})
