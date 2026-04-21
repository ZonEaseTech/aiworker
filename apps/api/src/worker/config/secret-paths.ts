import type { WorkerConfig } from '@aiworker/shared'

/**
 * Enumerate every secret inside a `WorkerConfig` as a (path, value) pair.
 * The `path` is the key under which the value is stored in `worker_secrets`;
 * `redactSecrets` and `hydrateSecrets` use the same scheme.
 */
export function enumerateSecretPaths(config: WorkerConfig): Array<{ path: string, value: string }> {
  const out: Array<{ path: string, value: string }> = []

  config.brains.forEach((brain, i) => {
    if (brain.type === 'cloud-gateway')
      out.push({ path: `brains.${i}.config.token`, value: brain.config.token })
  })

  if (config.executor.type === 'http')
    out.push({ path: 'executor.apiKey', value: config.executor.apiKey })
  else if (config.executor.type === 'mcp')
    out.push({ path: 'executor.token', value: config.executor.token })

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
  if (c.executor.type === 'http')
    c.executor = { ...c.executor, apiKey: '' }
  else if (c.executor.type === 'mcp')
    c.executor = { ...c.executor, token: '' }
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
        return cb
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
  if (c.executor.type === 'http')
    c.executor = { ...c.executor, apiKey: secrets.get('executor.apiKey') ?? '' }
  else if (c.executor.type === 'mcp')
    c.executor = { ...c.executor, token: secrets.get('executor.token') ?? '' }
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
      case 'web':
        return cb
      default:
        return cb
    }
  })
  return c
}
