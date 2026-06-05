import process from 'node:process'
import { buildSoul } from '@zonease/aiworker-soul-sdk'

const result = await buildSoul(process.cwd())
process.stdout.write(`${JSON.stringify({
  descriptor: result.outputPath,
  generatedSections: result.discovery.generatedSections,
  status: result.status,
})}\n`)
