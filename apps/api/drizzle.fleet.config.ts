import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/fleet/schema.ts',
  out: './drizzle/fleet',
  dialect: 'sqlite',
  dbCredentials: {
    url: './data/fleet.db',
  },
})
