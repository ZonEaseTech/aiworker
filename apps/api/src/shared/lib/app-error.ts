export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'AppError'
  }

  static badRequest(message: string, code = 'BAD_REQUEST') {
    return new AppError(code, 400, message)
  }

  static notFound(message: string, code = 'NOT_FOUND') {
    return new AppError(code, 404, message)
  }

  static internal(message: string, code = 'INTERNAL_ERROR') {
    return new AppError(code, 500, message)
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
      },
    }
  }
}
