export interface DistOpenApiWorkerConfigPath {
  patch?: { requestBody?: unknown }
  put?: { requestBody?: unknown }
}

export function assertDistOpenApiFreshness(workerConfigPath?: DistOpenApiWorkerConfigPath): void {
  if (!workerConfigPath?.put?.requestBody || !workerConfigPath.patch?.requestBody) {
    throw new Error(
      'dist OpenAPI is stale: worker config PUT/PATCH request bodies are missing. '
      + 'Run bun run build before smoke:dist-release.',
    )
  }
}
