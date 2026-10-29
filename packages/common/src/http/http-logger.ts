import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { LevelWithSilent, Logger } from "pino";
import { pinoHttp, type HttpLogger } from "pino-http";
import { pathWithoutQuery } from "./request-path";

const REQUEST_ID_HEADER = "x-request-id";
const VALID_REQUEST_ID = /^[\w-]{1,128}$/;
const QUIET_PATHS = new Set(["/health", "/metrics"]);

interface SerializedRequest {
  id: unknown;
  method: string;
  url: string;
}

interface SerializedResponse {
  statusCode: number;
}

const requestIdFor = (req: Request, res: Response): string => {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id =
    typeof incoming === "string" && VALID_REQUEST_ID.test(incoming)
      ? incoming
      : randomUUID();

  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
};

const levelFor = (
  req: Request,
  res: Response,
  err?: Error,
): LevelWithSilent => {
  if (err || res.err || res.statusCode >= 500) return "error";
  if (res.statusCode >= 400) return "warn";
  if (QUIET_PATHS.has(pathWithoutQuery(req.originalUrl))) return "silent";
  return "info";
};

const problemFor = (_req: Request, res: Response): object => {
  const { problem } = res.locals;
  return problem
    ? { problem: { code: problem.code, detail: problem.detail } }
    : {};
};

export const createHttpLogger = (
  logger: Logger,
): HttpLogger<Request, Response> =>
  pinoHttp<Request, Response>({
    logger,
    genReqId: requestIdFor,
    customLogLevel: levelFor,
    customProps: problemFor,
    serializers: {
      req: (req: SerializedRequest) => ({
        id: req.id,
        method: req.method,
        path: pathWithoutQuery(req.url),
      }),
      res: (res: SerializedResponse) => ({ statusCode: res.statusCode }),
    },
  });
