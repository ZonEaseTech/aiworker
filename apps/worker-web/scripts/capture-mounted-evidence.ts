import type { Browser, Page } from 'playwright'

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { chromium } from 'playwright'

interface CliOptions {
  allowMissingMounted: boolean
  label: string
  out: string
  url: string
}

const viewports = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'narrow', width: 390, height: 900 },
] as const

const options = parseArgs(process.argv.slice(2))
await mkdir(options.out, { recursive: true })

let browser: Browser | null = null
try {
  browser = await chromium.launch({ args: ['--no-sandbox'], headless: true })
  const missingMountedViewports: string[] = []
  for (const viewport of viewports) {
    const page = await browser.newPage({
      colorScheme: viewport.name === 'desktop' ? 'light' : 'dark',
      viewport,
    })
    try {
      const consoleMessages: Array<{ text: string, type: string }> = []
      page.on('console', message => consoleMessages.push({ type: message.type(), text: message.text() }))
      await page.goto(options.url, { waitUntil: 'networkidle' })
      await page.locator('micro-app').first().waitFor({ timeout: 15_000 }).catch(() => undefined)
      const diagnostics = await collectDiagnostics(page)
      if (!options.allowMissingMounted && diagnostics.mounted.length === 0)
        missingMountedViewports.push(viewport.name)
      const prefix = `${options.label}-${viewport.name}`
      await page.screenshot({ fullPage: true, path: path.join(options.out, `${prefix}.png`) })
      await writeFile(path.join(options.out, `${prefix}.json`), `${JSON.stringify({
        consoleMessages,
        diagnostics,
        url: page.url(),
        viewport,
      }, null, 2)}\n`)
    }
    finally {
      await page.close().catch(() => undefined)
    }
  }
  if (missingMountedViewports.length > 0) {
    throw new Error(`No mounted micro-app diagnostics found for viewport(s): ${missingMountedViewports.join(', ')}. Use --allow-missing-mounted to capture an intentionally unmounted page.`)
  }
}
finally {
  await browser?.close().catch(() => undefined)
}

function parseArgs(args: string[]): CliOptions {
  const out = readFlag(args, '--out')
  const url = readFlag(args, '--url')
  const label = readFlag(args, '--label') ?? 'mounted-surface'
  const allowMissingMounted = args.includes('--allow-missing-mounted')
  if (!out || !url) {
    printUsage()
  }
  return { allowMissingMounted, label, out, url }
}

function readFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name)
  if (index < 0)
    return undefined
  const value = args[index + 1]
  if (!value || value.startsWith('--'))
    printUsage()
  return value
}

function printUsage(): never {
  console.error('Usage: bun apps/worker-web/scripts/capture-mounted-evidence.ts --url <url> --out <dir> --label <name> [--allow-missing-mounted]')
  process.exit(2)
}

async function collectDiagnostics(page: Page) {
  return page.evaluate(() => {
    function readThemeStorage(storageName: 'localStorage' | 'sessionStorage') {
      try {
        const storage = window[storageName]
        const themeKeys: Record<string, string | null> = {}
        for (let index = 0; index < storage.length; index += 1) {
          const key = storage.key(index)
          if (key?.toLowerCase().includes('theme'))
            themeKeys[key] = storage.getItem(key)
        }
        return { error: null, keys: themeKeys }
      }
      catch (error) {
        return {
          error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
          keys: {},
        }
      }
    }

    const localStorageTheme = readThemeStorage('localStorage')
    const mounted = Array.from(document.querySelectorAll('micro-app')).map((element) => {
      const appElement = element as HTMLElement & { data?: Record<string, unknown> }
      return {
        data: appElement.data ?? null,
        name: element.getAttribute('name'),
        url: element.getAttribute('url'),
      }
    })
    const sessionStorageTheme = readThemeStorage('sessionStorage')
    return {
      bodyClass: document.body.className,
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
      dataTheme: document.querySelector('[data-testid="worker-studio-shell"]')?.getAttribute('data-theme') ?? null,
      htmlClass: document.documentElement.className,
      mounted,
      prefersDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
      sessionStorageThemeKeys: sessionStorageTheme.keys,
      localStorageThemeKeys: localStorageTheme.keys,
      ...(sessionStorageTheme.error ? { sessionStorageThemeError: sessionStorageTheme.error } : {}),
      ...(localStorageTheme.error ? { localStorageThemeError: localStorageTheme.error } : {}),
    }
  })
}
