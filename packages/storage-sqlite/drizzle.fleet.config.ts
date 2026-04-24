import { defineConfig } from 'drizzle-kit'

/**
 * Migration generator config. `out` stays relative to this package so
 * `drizzle-kit generate` can be invoked from `packages/storage-sqlite/`.
 * `dbCredentials.url` targets the host `apps/api/data/` folder so a dev
 * run picks up whatever the API wrote during its last `bun dev`.
 */
export default defineConfig({
  schema: './src/fleet/schema.ts',
  out: './drizzle/fleet',
  dialect: 'sqlite',
  dbCredentials: {
    url: '../../apps/api/data/fleet.db',
  },
})
