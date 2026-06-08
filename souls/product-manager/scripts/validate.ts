import process from 'node:process'
import { validateSoul } from '@zonease/aiworker-soul-sdk'

const result = await validateSoul(process.cwd())
process.stdout.write(`${JSON.stringify({
  discovery: result.discovery,
  issues: result.issues,
  status: result.status,
})}\n`)

if (result.status !== 'valid')
  process.exit(1)
