import { verifyAccessToken } from "@/auth/token.service";
import { HttpError } from "@ticketing/common";
import { NextFunction, Request, Response } from "express";

export const autheticate = (
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
      throw new HttpError(
        401,
        "Authorization header format must be: Bearer <token>",
      );
    }

    const token = parts[1];
    const payload = verifyAccessToken(token);

    req.user = payload;
    next();
  } catch (err) {
    if (err instanceof HttpError) {
      next(err);
    } else {
      next(new HttpError(401, "Invalid or expired token"));
    }
  }
};
