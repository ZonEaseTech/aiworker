import type { ExecutorConfig, WorkerConfig } from '@zonease/aiworker-shared'

/**
 * Enumerate every secret inside a `WorkerConfig` as a (path, value) pair.
 * The `path` is the key under which the value is stored in `worker_secrets`;
 * `redactSecrets` and `hydrateSecrets` use the same scheme.
 *
 * After FEAT-014 the executor is `ExecutorProfile`-shaped — secrets always
 * live under `executor.overrides.{apiKey|token}` regardless of which engine /
 * variant is selected (variants in `DEFAULT_PROFILES` deliberately store
 * empty placeholders for those fields).
 */
export function enumerateSecretPaths(config: WorkerConfig): Array<{ path: string, value: string }> {
  const out: Array<{ path: string, value: string }> = []

  config.brains.forEach((brain, i) => {
    if (brain.type === 'cloud-gateway')
      out.push({ path: `brains.${i}.config.token`, value: brain.config.token })
  })

  enumerateExecutorSecretPaths(config.executor, 'executor', out)
  const controlExecutor = config.orchestrator?.decisionPipeline?.executor
  if (controlExecutor)
    enumerateExecutorSecretPaths(controlExecutor, 'orchestrator.decisionPipeline.executor', out)

  config.channels.forEach((binding) => {
    const c = binding.credentials
    switch (c.channel) {
      case 'line':
        out.push(
          { path: 'channels.line.credentials.channelSecret', value: c.channelSecret },
          { path: 'channels.line.credentials.channelAccessToken', value: c.channelAccessToken },
        )
        break
      case 'telegram':
        out.push({ path: 'channels.telegram.credentials.botToken', value: c.botToken })
        if (c.webhookSecretToken)
          out.push({ path: 'channels.telegram.credentials.webhookSecretToken', value: c.webhookSecretToken })
        break
      case 'lark':
        out.push(
          { path: 'channels.lark.credentials.appSecret', value: c.appSecret },
          { path: 'channels.lark.credentials.encryptKey', value: c.encryptKey },
          { path: 'channels.lark.credentials.verificationToken', value: c.verificationToken },
        )
        break
      case 'whatsapp':
        out.push(
          { path: 'channels.whatsapp.credentials.accessToken', value: c.accessToken },
          { path: 'channels.whatsapp.credentials.appSecret', value: c.appSecret },
          { path: 'channels.whatsapp.credentials.verifyToken', value: c.verifyToken },
        )
        break
      case 'web':
        if (c.inboundToken && c.inboundToken.length > 0)
          out.push({ path: 'channels.web.credentials.inboundToken', value: c.inboundToken })
        break
    }
  })

  return out
}

/**
 * Deep-clone a config with every secret value replaced by the empty string.
 * The redacted form is what goes into `worker_configs.configJson` and what
 * the dashboard returns on read (so secrets never leave the vault).
 */
export function redactSecrets(config: WorkerConfig): WorkerConfig {
  const c = structuredClone(config)
  c.brains = c.brains.map((b) => {
    if (b.type === 'cloud-gateway')
      return { ...b, config: { ...b.config, token: '' } }
    return b
  })
  redactExecutorSecrets(c)
  c.channels = c.channels.map((cb) => {
    const creds = cb.credentials
    switch (creds.channel) {
      case 'line':
        return { ...cb, credentials: { ...creds, channelSecret: '', channelAccessToken: '' } }
      case 'telegram':
        return {
          ...cb,
          credentials: {
            ...creds,
            botToken: '',
            webhookSecretToken: creds.webhookSecretToken === undefined ? undefined : '',
          },
        }
      case 'lark':
        return {
          ...cb,
          credentials: { ...creds, appSecret: '', encryptKey: '', verificationToken: '' },
        }
      case 'whatsapp':
        return {
          ...cb,
          credentials: { ...creds, accessToken: '', appSecret: '', verifyToken: '' },
        }
      case 'web':
        return {
          ...cb,
          credentials: {
            ...creds,
            inboundToken: creds.inboundToken === undefined ? undefined : '',
          },
        }
      default:
        return cb
    }
  })
  return c
}

/**
 * Merge a redacted config with secrets from the vault, producing the complete
 * `WorkerConfig` used to spawn a worker container.
 */
export function hydrateSecrets(config: WorkerConfig, secrets: Map<string, string>): WorkerConfig {
  const c = structuredClone(config)
  c.brains = c.brains.map((b, i) => {
    if (b.type === 'cloud-gateway')
      return { ...b, config: { ...b.config, token: secrets.get(`brains.${i}.config.token`) ?? '' } }
    return b
  })
  hydrateExecutorSecrets(c, secrets)
  c.channels = c.channels.map((cb) => {
    const creds = cb.credentials
    switch (creds.channel) {
      case 'line':
        return {
          ...cb,
          credentials: {
            ...creds,
            channelSecret: secrets.get('channels.line.credentials.channelSecret') ?? '',
            channelAccessToken: secrets.get('channels.line.credentials.channelAccessToken') ?? '',
          },
        }
      case 'telegram': {
        const webhook = secrets.get('channels.telegram.credentials.webhookSecretToken')
        return {
          ...cb,
          credentials: {
            ...creds,
            botToken: secrets.get('channels.telegram.credentials.botToken') ?? '',
            webhookSecretToken: webhook ?? creds.webhookSecretToken,
          },
        }
      }
      case 'lark':
        return {
          ...cb,
          credentials: {
            ...creds,
            appSecret: secrets.get('channels.lark.credentials.appSecret') ?? '',
            encryptKey: secrets.get('channels.lark.credentials.encryptKey') ?? '',
            verificationToken: secrets.get('channels.lark.credentials.verificationToken') ?? '',
          },
        }
      case 'whatsapp':
        return {
          ...cb,
          credentials: {
            ...creds,
            accessToken: secrets.get('channels.whatsapp.credentials.accessToken') ?? '',
            appSecret: secrets.get('channels.whatsapp.credentials.appSecret') ?? '',
            verifyToken: secrets.get('channels.whatsapp.credentials.verifyToken') ?? '',
          },
        }
      case 'web': {
        const inbound = secrets.get('channels.web.credentials.inboundToken')
        return {
          ...cb,
          credentials: {
            ...creds,
            inboundToken: inbound ?? creds.inboundToken,
          },
        }
      }
      default:
        return cb
    }
  })
  return c
}

function enumerateExecutorSecretPaths(
  profile: ExecutorConfig,
  basePath: string,
  out: Array<{ path: string, value: string }>,
): void {
  const overrides = (profile.overrides ?? {}) as Record<string, unknown>
  if (profile.engine === 'http' && typeof overrides.apiKey === 'string')
    out.push({ path: `${basePath}.overrides.apiKey`, value: overrides.apiKey })
  else if (profile.engine === 'mcp' && typeof overrides.token === 'string')
    out.push({ path: `${basePath}.overrides.token`, value: overrides.token })

  profile.fallbacks?.forEach((entry, i) => {
    enumerateExecutorSecretPaths(entry.executor, `${basePath}.fallbacks.${i}.executor`, out)
  })
}

function redactExecutorSecrets(c: WorkerConfig): void {
  c.executor = redactExecutorProfile(c.executor)
  const decisionPipeline = c.orchestrator?.decisionPipeline
  const controlExecutor = decisionPipeline?.executor
  if (controlExecutor) {
    c.orchestrator = {
      ...c.orchestrator,
      decisionPipeline: {
        ...decisionPipeline,
        executor: redactExecutorProfile(controlExecutor),
      },
    }
  }
}

function redactExecutorProfile(profile: ExecutorConfig): ExecutorConfig {
  const overrides = { ...((profile.overrides as Record<string, unknown> | undefined) ?? {}) }
  if (profile.engine === 'http' && typeof overrides.apiKey === 'string')
    overrides.apiKey = ''
  if (profile.engine === 'mcp' && typeof overrides.token === 'string')
    overrides.token = ''
  return {
    ...profile,
    overrides,
    ...(profile.fallbacks === undefined
      ? {}
      : {
          fallbacks: profile.fallbacks.map(entry => ({
            ...entry,
            executor: redactExecutorProfile(entry.executor),
          })),
        }),
  }
}

function hydrateExecutorSecrets(c: WorkerConfig, secrets: Map<string, string>): void {
  c.executor = hydrateExecutorProfile(c.executor, secrets, 'executor')
  const decisionPipeline = c.orchestrator?.decisionPipeline
  const controlExecutor = decisionPipeline?.executor
  if (controlExecutor) {
    c.orchestrator = {
      ...c.orchestrator,
      decisionPipeline: {
        ...decisionPipeline,
        executor: hydrateExecutorProfile(controlExecutor, secrets, 'orchestrator.decisionPipeline.executor'),
      },
    }
  }
}

function hydrateExecutorProfile(profile: ExecutorConfig, secrets: Map<string, string>, basePath: string): ExecutorConfig {
  const overrides = { ...((profile.overrides as Record<string, unknown> | undefined) ?? {}) }
  if (profile.engine === 'http') {
    const v = secrets.get(`${basePath}.overrides.apiKey`)
    if (v !== undefined)
      overrides.apiKey = v
  }
  else if (profile.engine === 'mcp') {
    const v = secrets.get(`${basePath}.overrides.token`)
    if (v !== undefined)
      overrides.token = v
  }
  return {
    ...profile,
    overrides,
    ...(profile.fallbacks === undefined
      ? {}
      : {
          fallbacks: profile.fallbacks.map((entry, i) => ({
            ...entry,
            executor: hydrateExecutorProfile(entry.executor, secrets, `${basePath}.fallbacks.${i}.executor`),
          })),
        }),
  }
}
