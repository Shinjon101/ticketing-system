import { STATUS_CODES } from "node:http";
import type { ErrorRequestHandler, RequestHandler } from "express";
import { AppError, NotFoundError } from "../errors/app-error";
import { pathWithoutQuery } from "./request-path";

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  [extension: string]: unknown;
}

declare global {
  namespace Express {
    interface Locals {
      problem?: ProblemDetails;
    }
  }
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

const toError = (err: unknown): Error =>
  err instanceof Error ? err : new Error(String(err));

export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  _req,
  res,
  next,
) => {
  if (res.headersSent) {
    res.err = toError(err);
    next(err);
    return;
  }

  const problem = toProblem(err);
  res.locals.problem = problem;

  if (problem.status >= 500) {
    res.err = toError(err);
  }

  res.status(problem.status).type("application/problem+json").json(problem);
};

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(
    new NotFoundError(
      `Route ${req.method} ${pathWithoutQuery(req.originalUrl)} not found`,
      { code: "ROUTE_NOT_FOUND" },
    ),
  );
};
