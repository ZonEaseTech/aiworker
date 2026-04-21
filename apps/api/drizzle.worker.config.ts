import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/worker/schema.ts',
  out: './drizzle/worker',
  dialect: 'sqlite',
  dbCredentials: {
    url: './data/worker.db',
  },
})
