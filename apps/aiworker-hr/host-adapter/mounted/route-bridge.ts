export const hrMountedRouteBase = '/hr'

export function normalizeHrChildRoute(path: string | null | undefined): string {
  if (!path)
    return hrMountedRouteBase
  const value = path.startsWith('/') ? path : `/${path}`
  const pathname = value.split(/[?#]/, 1)[0] || hrMountedRouteBase
  if (pathname === hrMountedRouteBase || pathname.startsWith(`${hrMountedRouteBase}/`))
    return value
  return hrMountedRouteBase
}

export function hrChildRouteBridgeScript(appId: string, surfaceId: string): string {
  return `;(() => {
  const appId = ${jsonScriptValue(appId)};
  const surfaceId = ${jsonScriptValue(surfaceId)};
  const routeBase = ${jsonScriptValue(hrMountedRouteBase)};
  const normalizeHrChildRoute = (path) => {
    if (!path)
      return routeBase;
    const value = path.startsWith('/') ? path : '/' + path;
    const pathname = value.split(/[?#]/, 1)[0] || routeBase;
    if (pathname === routeBase || pathname.startsWith(routeBase + '/'))
      return value;
    return routeBase;
  };
  const actionRoutes = {
    'new-profile': '/hr/profiles/new',
  };
  const assignRoute = (route) => {
    window.__AIWORKER_HR_CHILD_ROUTE__ = route;
    document.documentElement.setAttribute('data-hr-child-route', route);
    document.querySelectorAll('[data-hr-child-route]').forEach((element) => {
      element.setAttribute('data-hr-child-route', route);
    });
  };
  const resolveRoute = (element) => {
    if (!element || !(element instanceof Element))
      return routeBase;
    const path = element.getAttribute('data-hr-route-path');
    if (path)
      return normalizeHrChildRoute(path);
    const action = element.getAttribute('data-hr-route-action');
    if (action && action in actionRoutes)
      return normalizeHrChildRoute(actionRoutes[action]);
    return routeBase;
  };
  const applyRoute = (path) => {
    assignRoute(normalizeHrChildRoute(path));
  };
  applyRoute(window.location.pathname + window.location.search + window.location.hash);
  window.addEventListener('popstate', () => {
    applyRoute(window.location.pathname + window.location.search + window.location.hash);
  });
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element))
      return;
    const routeElement = target.closest('[data-hr-route-path],[data-hr-route-action]');
    if (!routeElement)
      return;
    const nextRoute = resolveRoute(routeElement);
    event.preventDefault();
    history.pushState(history.state ?? null, '', nextRoute);
    window.dispatchEvent(new PopStateEvent('popstate', { state: history.state ?? null }));
    applyRoute(nextRoute);
  }, true);
  assignRoute(normalizeHrChildRoute(window.location.pathname + window.location.search + window.location.hash));
})();`
}

function jsonScriptValue(value: string): string {
  return JSON.stringify(value).replaceAll('<', '\\u003C').replaceAll('>', '\\u003E').replaceAll('&', '\\u0026')
}
