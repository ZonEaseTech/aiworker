import { copyFile, mkdir } from 'node:fs/promises'

const oxaniumFontFileNames = [
  'oxanium-latin-ext-wght-normal.woff2',
  'oxanium-latin-wght-normal.woff2',
]

const sourceDir = new URL('../node_modules/@zonease/aiworker-ui/node_modules/@fontsource-variable/oxanium/files/', import.meta.url)
const targetDir = new URL('../dist/web/files/', import.meta.url)

await mkdir(targetDir, { recursive: true })

await Promise.all(
  oxaniumFontFileNames.map(fontFileName =>
    copyFile(new URL(fontFileName, sourceDir), new URL(fontFileName, targetDir)),
  ),
)
