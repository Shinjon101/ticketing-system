import { env } from "@/config/env";
import { UnauthorizedError } from "@ticketing/common";
import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

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
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    next(new UnauthorizedError("Authorization header missing"));
    return;
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    next(new UnauthorizedError("Format: Authorization: Bearer <token>"));
    return;
  }

  const token = parts[1]!;

  try {
    req.user = jwt.verify(token, publicKey, {
      algorithms: ["RS256"],
    }) as AccessTokenPayload;
  } catch (err) {
    next(new UnauthorizedError("Invalid or expired token", { cause: err }));
    return;
  }

  next();
};
