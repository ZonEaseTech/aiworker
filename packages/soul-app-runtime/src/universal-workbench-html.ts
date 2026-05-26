export function renderUniversalWorkbenchHtml(options: {
  appId: string
  appName: string
  clientHref?: string
  routePrefix?: string
  sessionId?: string | null
  styleHref?: string
  surfaceId?: string
  theme?: 'dark' | 'light'
  workerId?: string | null
  workspaceId?: string | null
}): string {
  const {
    appId,
    appName,
    clientHref,
    routePrefix = `/api/local/apps/${appId}`,
    sessionId = null,
    styleHref,
    surfaceId = 'universal-workbench',
    theme = 'light',
    workerId = null,
    workspaceId = null,
  } = options
  const hostData = {
    appId,
    routePrefix,
    sessionId,
    surfaceId,
    theme,
    workerId,
    workspaceId,
  }
  const themeClass = theme === 'dark' ? 'dark h-full' : 'h-full'
  const bodyClass = theme === 'dark' ? 'dark h-full' : 'h-full'
  const styleLink = styleHref ? `<link rel="stylesheet" href="${escapeHtmlAttribute(styleHref)}">` : ''
  const scriptHref = clientHref ?? `${routePrefix}/assets/universal-workbench-client.js`

  return [
    '<!doctype html>',
    `<html lang="en" class="${themeClass}" style="color-scheme:${theme}">`,
    `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(appName)} · Universal Workbench</title>${styleLink}<style>html,body,#root{height:100%;margin:0}body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:Canvas;color:CanvasText}</style></head>`,
    `<body class="${bodyClass}">`,
    `<main id="root" class="h-full min-h-0" data-soul-app-id="${escapeHtmlAttribute(appId)}" data-surface-id="${escapeHtmlAttribute(surfaceId)}"></main>`,
    `<script id="aiworker-micro-app-host-data" type="application/json" data-slot="micro-app-host-data">${jsonScriptPayload(hostData)}</script>`,
    `<script>${microAppBridgeScript(hostData)}</script>`,
    `<script src="${escapeHtmlAttribute(scriptHref)}"></script>`,
    '</body>',
    '</html>',
  ].join('')
}

function microAppBridgeScript(defaultHostData: Record<string, unknown>): string {
  return `;(() => {
  const defaultHostData = ${jsonScriptPayload(defaultHostData)};
  const hostDataElement = document.getElementById('aiworker-micro-app-host-data');
  const setHostData = (value) => {
    const data = value && typeof value === 'object' ? { ...defaultHostData, ...value } : defaultHostData;
    window.__AIWORKER_MICRO_APP_HOST_DATA__ = data;
    if (hostDataElement)
      hostDataElement.textContent = JSON.stringify(data);
    return data;
  };
  let receivedHostData = false;
  const receiveHostData = (data) => {
    receivedHostData = true;
    setHostData(data);
  };
  let attempts = 0;
  const bind = () => {
    const api = window.microApp;
    if (!api) {
      attempts += 1;
      if (attempts <= 30) {
        window.setTimeout(bind, 16);
        return;
      }
      setHostData(defaultHostData);
      return;
    }
    if (typeof api.addDataListener === 'function')
      api.addDataListener(receiveHostData, true);
    if (typeof api.getData === 'function') {
      const current = api.getData();
      if (current && typeof current === 'object' && Object.keys(current).length > 0)
        receiveHostData(current);
    }
    if (!receivedHostData)
      setHostData(defaultHostData);
    if (typeof api.dispatch === 'function')
      api.dispatch({ type: "ready" });
  };
  bind();
})();`
}

function jsonScriptPayload(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c')
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value).replaceAll('"', '&quot;')
}
