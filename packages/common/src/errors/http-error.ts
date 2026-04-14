export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "HttpError";
  }

  static badRequest(
    message = "Bad Request",
    details?: Record<string, unknown>,
  ) {
    return new HttpError(400, message, details);
  }

  static unauthorized(message = "Unauthorized") {
    return new HttpError(401, message);
  }

  static notFound(message = "Resource not found") {
    return new HttpError(404, message);
  }

  static unprocessable(
    message = "Validation Failed",
    details?: Record<string, unknown>,
  ) {
    return new HttpError(422, message, details);
  }
}
