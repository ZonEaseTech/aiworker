import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/worker/schema.ts',
  out: './drizzle/worker',
  dialect: 'sqlite',
  dbCredentials: {
    url: '../../apps/api/data/worker.db',
  },
})
