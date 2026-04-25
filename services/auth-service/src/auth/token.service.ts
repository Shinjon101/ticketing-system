import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "crypto";
import { env } from "@/config/env";

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: "user" | "admin";
}

export interface RefreshTokenResult {
  raw: string;

  hash: string;

  expiresAt: Date;
}

export const signAccessToken = (payload: AccessTokenPayload): string => {
  return jwt.sign(payload, env.JWT_PRIVATE_KEY, {
    algorithm: "RS256",
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
};

export const verifyAccessToken = (token: string): AccessTokenPayload => {
  const decoded = jwt.verify(token, env.JWT_PUBLIC_KEY, {
    algorithms: ["RS256"],
  });

  return decoded as AccessTokenPayload;
};

export const generateRefreshToken = (): RefreshTokenResult => {
  const raw = randomBytes(64).toString("hex");
  const hash = hashRefreshToken(raw);

  const expiresAt = parseExpiryToDate(env.JWT_REFRESH_EXPIRES_IN);

  return { raw, hash, expiresAt };
};

export const hashRefreshToken = (raw: string): string => {
  return createHash("sha256").update(raw).digest("hex");
};

const parseExpiryToDate = (expiry: string): Date => {
  const unit = expiry.slice(-1);
  const value = parseInt(expiry.slice(0, -1), 10);

  const ms = (() => {
    switch (unit) {
      case "s":
        return value * 1_000;
      case "m":
        return value * 60 * 1_000;
      case "h":
        return value * 60 * 60 * 1_000;
      case "d":
        return value * 24 * 60 * 60 * 1_000;
      default:
        throw new Error(`Unknown expiry unit: ${unit}`);
    }
  })();

  return new Date(Date.now() + ms);
};
