/**
 * Supervisor 错误类型——独立模块,避免消费方（router/methods/workers.ts）
 * 因 `instanceof` 检查而牵连出整个 supervisor 模块的导入链。
 */

export class LaunchTimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LaunchTimeoutError'
  }
}

export class LaunchFailedError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'LaunchFailedError'
  }
}
