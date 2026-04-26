import { asyncHandler } from "@ticketing/common";
import { RequestHandler } from "express";
import { authService } from "./auth.service";

const REFRESH_TOKEN_COOKIE = "refresh_token";

const getRefreshCookieOptions = (expiresAt: Date) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production", // HTTPS only in production
  sameSite: "strict" as const, // CSRF protection
  expires: expiresAt,
});

const CLEAR_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
};

export const registerHandler: RequestHandler = asyncHandler(
  async (req, res) => {
    const { user, tokens } = await authService.register(req.body);

    res.cookie(
      REFRESH_TOKEN_COOKIE,
      tokens.refreshToken,
      getRefreshCookieOptions(tokens.refreshTokenExpiresAt),
    );

    res.status(201).json({
      user,
      accessToken: tokens.accessToken,
    });
  },
);

export const loginHandler: RequestHandler = asyncHandler(async (req, res) => {
  const { user, tokens } = await authService.login(req.body);

  res.cookie(
    REFRESH_TOKEN_COOKIE,
    tokens.refreshToken,
    getRefreshCookieOptions(tokens.refreshTokenExpiresAt),
  );

  res.status(200).json({
    user,
    accessToken: tokens.accessToken,
  });
});

export const refreshHandler: RequestHandler = asyncHandler(async (req, res) => {
  const rawRefreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE] as
    | string
    | undefined;

  if (!rawRefreshToken) {
    res.status(401).json({ error: "Refresh token not found" });
    return;
  }

  const tokens = await authService.refresh(rawRefreshToken);

  res.cookie(
    REFRESH_TOKEN_COOKIE,
    tokens.refreshToken,
    getRefreshCookieOptions(tokens.refreshTokenExpiresAt),
  );

  res.status(200).json({
    accessToken: tokens.accessToken,
  });
});

export const logoutHandler: RequestHandler = asyncHandler(async (req, res) => {
  const rawRefreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE] as
    | string
    | undefined;

  if (rawRefreshToken) {
    await authService.logout(rawRefreshToken);
  }

  res.clearCookie(REFRESH_TOKEN_COOKIE, CLEAR_COOKIE_OPTIONS);
  res.status(200).json({ message: "Logged out successfully" });
});
