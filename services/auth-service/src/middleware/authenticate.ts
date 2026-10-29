import { verifyAccessToken } from "@/auth/token.service";
import { ForbiddenError, UnauthorizedError } from "@ticketing/common";
import { NextFunction, Request, Response } from "express";

declare global {
  namespace Express {
    interface Request {
      user: ReturnType<typeof verifyAccessToken>;
    }
  }
}

export const autheticate = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    next(new UnauthorizedError("Authorization header missing"));
    return;
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    next(
      new UnauthorizedError(
        "Authorization header format must be: Bearer <token>",
      ),
    );
    return;
  }

  const token = parts[1];

  try {
    req.user = verifyAccessToken(token);
  } catch (err) {
    next(new UnauthorizedError("Invalid or expired token", { cause: err }));
    return;
  }

  next();
};

export const requireRole = (role: "user" | "admin") => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (req.user.role !== role) {
      next(new ForbiddenError("Insufficient permissions"));
      return;
    }
    next();
  };
};
