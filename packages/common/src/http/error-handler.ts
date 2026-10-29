import { STATUS_CODES } from "node:http";
import type { ErrorRequestHandler, RequestHandler } from "express";
import type { Logger } from "pino";
import { AppError, NotFoundError } from "../errors/app-error";
import { requestPath } from "./request-path";

interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  [extension: string]: unknown;
}

interface KnownClientError {
  status: number;
  code: string;
  detail: string;
}

const BODY_PARSER_ERRORS: Record<string, KnownClientError> = {
  "entity.parse.failed": {
    status: 400,
    code: "MALFORMED_JSON",
    detail: "Request body is not valid JSON",
  },
  "entity.too.large": {
    status: 413,
    code: "PAYLOAD_TOO_LARGE",
    detail: "Request body is too large",
  },
  "encoding.unsupported": {
    status: 415,
    code: "UNSUPPORTED_ENCODING",
    detail: "Unsupported content encoding",
  },
  "charset.unsupported": {
    status: 415,
    code: "UNSUPPORTED_CHARSET",
    detail: "Unsupported charset",
  },
};

const knownBodyParserError = (err: unknown): KnownClientError | undefined => {
  if (
    err instanceof Error &&
    "type" in err &&
    typeof err.type === "string" &&
    Object.hasOwn(BODY_PARSER_ERRORS, err.type)
  ) {
    return BODY_PARSER_ERRORS[err.type];
  }
  return undefined;
};

const titleFor = (status: number): string => STATUS_CODES[status] ?? "Error";

const toProblem = (err: unknown): ProblemDetails => {
  if (err instanceof AppError) {
    return {
      ...err.details,
      type: "about:blank",
      title: titleFor(err.statusCode),
      status: err.statusCode,
      detail: err.message,
      code: err.code,
    };
  }

  const clientError = knownBodyParserError(err);
  if (clientError) {
    return {
      type: "about:blank",
      title: titleFor(clientError.status),
      ...clientError,
    };
  }

  return {
    type: "about:blank",
    title: titleFor(500),
    status: 500,
    detail: "An unexpected error occurred",
    code: "INTERNAL_ERROR",
  };
};

export const createErrorHandler =
  (logger: Logger): ErrorRequestHandler =>
  (err: unknown, req, res, next) => {
    const path = requestPath(req);

    if (res.headersSent) {
      logger.error(
        { method: req.method, path, err },
        "Request failed after response headers were sent",
      );
      next(err);
      return;
    }

    const problem = toProblem(err);
    const context = {
      method: req.method,
      path,
      status: problem.status,
      code: problem.code,
    };

    if (problem.status >= 500) {
      logger.error({ ...context, err }, "Request failed");
    } else {
      logger.warn(context, problem.detail);
    }

    res.status(problem.status).type("application/problem+json").json(problem);
  };

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(
    new NotFoundError(`Route ${req.method} ${requestPath(req)} not found`, {
      code: "ROUTE_NOT_FOUND",
    }),
  );
};
