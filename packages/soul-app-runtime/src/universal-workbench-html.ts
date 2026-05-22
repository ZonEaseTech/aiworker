export function renderUniversalWorkbenchHtml(options: {
  appId: string
  appName: string
  theme?: 'dark' | 'light'
}): string {
  const { appId: _appId, appName, theme = 'dark' } = options
  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="${theme}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${appName} · Universal Workbench</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body, #root { height: 100%; }
    body { font-family: system-ui, -apple-system, sans-serif; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module">
    import { createRoot } from 'react-dom/client'
    import { UniversalWorkbenchApp } from '@zonease/aiworker-soul-app-workbench'

    const hostData = window.microApp?.getData?.() ?? {}
    const { workerId, workspaceId, sessionId, theme: hostTheme } = hostData

    if (hostTheme) {
      document.documentElement.setAttribute('data-theme', hostTheme)
    }

    window.microApp?.dispatch?.({ type: 'ready' })

    window.microApp?.addDataListener?.((data) => {
      renderApp(data)
    })

    function renderApp(data) {
      const root = document.getElementById('root')
      if (!root) return
      const reactRoot = createRoot(root)
      reactRoot.render(
        // UniversalWorkbenchApp rendered with host data
        // Actual implementation will fetch session list via /api/sessions
        // and manage state internally with React hooks
      )
    }

    renderApp(hostData)
  </script>
</body>
</html>`
}
