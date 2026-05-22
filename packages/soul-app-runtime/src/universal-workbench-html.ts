export function renderUniversalWorkbenchHtml(options: {
  appId: string
  appName: string
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
  const styleLink = styleHref ? `<link rel="stylesheet" href="${escapeHtmlAttribute(styleHref)}">` : ''

  return [
    '<!doctype html>',
    `<html lang="en" class="${themeClass}" style="color-scheme:${theme}">`,
    `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(appName)} · Universal Workbench</title>${styleLink}<style>html,body,#root{height:100%;margin:0}body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:Canvas;color:CanvasText}.universal-workbench{display:grid;min-height:100%;place-items:center;padding:24px}.universal-workbench__panel{max-width:640px;border:1px solid color-mix(in oklab,CanvasText 16%,transparent);border-radius:8px;padding:20px}.universal-workbench__eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:.08em;opacity:.65}.universal-workbench__title{margin:8px 0 6px;font-size:24px;line-height:1.2}.universal-workbench__detail{margin:0;opacity:.72;line-height:1.5}</style></head>`,
    '<body class="h-full">',
    `<main id="root" class="universal-workbench" data-soul-app-id="${escapeHtmlAttribute(appId)}" data-surface-id="${escapeHtmlAttribute(surfaceId)}">`,
    '<section class="universal-workbench__panel" aria-labelledby="universal-workbench-title">',
    `<div class="universal-workbench__eyebrow">${escapeHtml(appName)}</div>`,
    '<h1 id="universal-workbench-title" class="universal-workbench__title">Universal Workbench</h1>',
    '<p class="universal-workbench__detail">This app-owned micro-app surface receives worker, workspace, session, and theme context from the Host mount bridge.</p>',
    '</section>',
    '</main>',
    `<script id="aiworker-micro-app-host-data" type="application/json" data-slot="micro-app-host-data">${jsonScriptPayload(hostData)}</script>`,
    `<script>${microAppBridgeScript(hostData)}</script>`,
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
