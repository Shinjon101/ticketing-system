import logger from "@/config/logger";
import { HttpError } from "@ticketing/common";
import type {
  ErrorRequestHandler,
  NextFunction,
  Request,
  Response,
} from "express";

export const errorHandler: ErrorRequestHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  logger.error({ err }, "Unhandled error occurred");
  if (err instanceof HttpError) {
    if (err.statusCode >= 500) {
      logger.error(
        { err, path: req.path, method: req.method },
        "Internal Server Error",
      );
    } else {
      logger.warn(
        {
          statusCode: err.statusCode,
          message: err.message,
          path: req.path,
        },
        "Operational error occurred",
      );
    }

    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.details && { details: err.details }),
    });
    return;
  }

  logger.error({ err, path: req.path, method: req.method }, "Unhandled error");

  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
};
