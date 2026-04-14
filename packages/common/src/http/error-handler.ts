import type {
  ErrorRequestHandler,
  NextFunction,
  Request,
  Response,
} from "express";
import { HttpError } from "../errors/http-error";
import type { Logger } from "pino";

export const createErrorHandler: ErrorRequestHandler = (logger: Logger) => {
  return (err: Error, req: Request, res: Response, _next: NextFunction) => {
    const correlationId =
      req.headers["x-correlation-id"] || crypto.randomUUID();

    const logData = {
      correlationId,
      path: req.path,
      method: req.method,
    };

    if (err instanceof HttpError) {
      logger.warn({ ...logData, statusCode: err.statusCode }, err.message);
      res.status(err.statusCode).json({
        error: err.message,
        correlationId,
        ...(err.details && { details: err.details }),
      });
      return;
    }

    logger.error({ ...logData, err }, "Unhandled error");

    res.status(500).json({
      error: "Internal server error",
      correlationId,
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    });
  };
};
