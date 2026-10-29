export interface AppErrorOptions {
  code?: string;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export abstract class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  protected constructor(
    statusCode: number,
    defaultCode: string,
    message: string,
    options: AppErrorOptions = {},
  ) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = options.code ?? defaultCode;
    this.details = options.details;
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad request", options?: AppErrorOptions) {
    super(400, "BAD_REQUEST", message, options);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized", options?: AppErrorOptions) {
    super(401, "UNAUTHORIZED", message, options);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden", options?: AppErrorOptions) {
    super(403, "FORBIDDEN", message, options);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found", options?: AppErrorOptions) {
    super(404, "NOT_FOUND", message, options);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict", options?: AppErrorOptions) {
    super(409, "CONFLICT", message, options);
  }
}

export class GoneError extends AppError {
  constructor(message = "Gone", options?: AppErrorOptions) {
    super(410, "GONE", message, options);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed", options?: AppErrorOptions) {
    super(422, "VALIDATION_FAILED", message, options);
  }
}
