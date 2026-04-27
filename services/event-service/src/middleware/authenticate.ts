import { env } from "@/config/env";
import { HttpError } from "@ticketing/common";
import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: "user" | "admin";
  iat: number;
  exp: number;
}

declare global {
  namespace Express {
    interface Request {
      user: AccessTokenPayload;
    }
  }
}

const publicKey = env.JWT_PUBLIC_KEY.replace(/\\n/g, "\n");

export const authenticate = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new HttpError(401, "Authorization header missing");
    }

    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      throw new HttpError(401, "Format: Authorization: Bearer <token>");
    }

    const token = parts[1]!;

    const payload = jwt.verify(token, publicKey, {
      algorithms: ["RS256"],
    }) as AccessTokenPayload;

    req.user = payload;
    next();
  } catch (err) {
    next(new HttpError(401, "Invalid or expired token"));
  }
};

export const requireRole = (role: "user" | "admin") => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (req.user.role !== role) {
      next(new HttpError(403, "Insufficient permissions"));
      return;
    }
    next();
  };
};
