vi.mock("@/auth/auth.service", () => ({
  authService: {
    register: vi.fn(),
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock("@/auth/token.service", () => ({
  verifyAccessToken: vi.fn(),
  signAccessToken: vi.fn(),
  generateRefreshToken: vi.fn(),
  hashRefreshToken: vi.fn(),
}));

import request from "supertest";
import type { Request, Response } from "express";
import { createApp } from "@/app";
import { authService } from "@/auth/auth.service";
import { verifyAccessToken } from "@/auth/token.service";
import logger from "@/config/logger";
import {
  ConflictError,
  createErrorHandler,
  UnauthorizedError,
} from "@ticketing/common";

const app = createApp();

const mockAuthResult = {
  user: {
    id: "user-uuid-1",
    email: "test@example.com",
    role: "user" as const,
  },
  tokens: {
    accessToken: "mock.access.token",
    refreshToken: "mock-raw-refresh-token",
    refreshTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  },
};

const mockJwtPayload = {
  sub: "user-uuid-1",
  email: "test@example.com",
  role: "user" as const,
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 900,
};

describe("POST /auth/register", () => {
  it("returns 201 with user + accessToken, sets httpOnly refresh cookie", async () => {
    vi.mocked(authService.register).mockResolvedValue(mockAuthResult);

    const res = await request(app)
      .post("/auth/register")
      .send({ email: "test@example.com", password: "Password123!" });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe("test@example.com");
    expect(res.body.accessToken).toBe("mock.access.token");

    expect(res.body).not.toHaveProperty("refreshToken");

    const cookie: string = res.headers["set-cookie"]?.[0] ?? "";

    expect(cookie).toMatch(/refresh_token=/);
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it("returns 422 when password is too short", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ email: "test@example.com", password: "short" });

    expect(res.status).toBe(422);
  });

  it("returns 409 when email is already taken", async () => {
    vi.mocked(authService.register).mockRejectedValue(
      new ConflictError("Email already in use"),
    );

    const res = await request(app)
      .post("/auth/register")
      .send({ email: "existing@example.com", password: "Password123!" });

    expect(res.status).toBe(409);
    expect(res.body.detail).toMatch(/email already in use/i);
  });
});

describe("POST /auth/login", () => {
  it("returns 200 with user + accessToken and sets cookie", async () => {
    vi.mocked(authService.login).mockResolvedValue(mockAuthResult);

    const res = await request(app)
      .post("/auth/login")
      .send({ email: "test@example.com", password: "Password123!" });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("test@example.com");
    expect(res.body.accessToken).toBeDefined();
    expect(res.body).not.toHaveProperty("refreshToken");

    const cookie: string = res.headers["set-cookie"]?.[0] ?? "";
    expect(cookie).toMatch(/refresh_token=/);
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it("returns 422 when body is empty", async () => {
    const res = await request(app).post("/auth/login").send({});

    expect(res.status).toBe(422);
    expect(authService.login).not.toHaveBeenCalled();
  });

  it("returns 401 on bad credentials", async () => {
    vi.mocked(authService.login).mockRejectedValue(
      new UnauthorizedError("Invalid credentials"),
    );

    const res = await request(app)
      .post("/auth/login")
      .send({ email: "test@example.com", password: "wrong" });

    expect(res.status).toBe(401);
  });
});

describe("POST /auth/refresh", () => {
  it("returns 200 with new accessToken when cookie is present", async () => {
    vi.mocked(authService.refresh).mockResolvedValue(mockAuthResult.tokens);

    const res = await request(app)
      .post("/auth/refresh")
      .set("Cookie", "refresh_token=valid-raw-token");

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBe("mock.access.token");
  });

  it("returns 401 when no refresh cookie is present", async () => {
    const res = await request(app).post("/auth/refresh");

    expect(res.status).toBe(401);
    expect(authService.refresh).not.toHaveBeenCalled();
  });

  it("returns 401 when token is expired / invalid", async () => {
    vi.mocked(authService.refresh).mockRejectedValue(
      new UnauthorizedError("Invalid or expired refresh token"),
    );

    const res = await request(app)
      .post("/auth/refresh")
      .set("Cookie", "refresh_token=expired-token");

    expect(res.status).toBe(401);
  });
});

describe("GET /auth/me", () => {
  it("returns 200 with user profile when token is valid", async () => {
    vi.mocked(verifyAccessToken).mockReturnValue(mockJwtPayload);

    const { userRepository } = await import("@/users/user.repository");

    vi.spyOn(userRepository, "findById").mockResolvedValue({
      id: "user-uuid-1",
      email: "test@example.com",
      role: "user",
      passwordHash: "hashed",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await request(app)
      .get("/auth/me")
      .set("Authorization", "Bearer valid.token.here");

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("test@example.com");

    expect(res.body.user).not.toHaveProperty("passwordHash");
  });

  it("returns 401 when Authorization header is missing", async () => {
    const res = await request(app).get("/auth/me");

    expect(res.status).toBe(401);
  });

  it("returns 401 when token is malformed", async () => {
    vi.mocked(verifyAccessToken).mockImplementation(() => {
      throw new Error("invalid token");
    });

    const res = await request(app)
      .get("/auth/me")
      .set("Authorization", "Bearer bad.token");

    expect(res.status).toBe(401);
  });

  it("returns 401 when Authorization header format is wrong", async () => {
    const res = await request(app)
      .get("/auth/me")
      .set("Authorization", "Basic somebase64string");

    expect(res.status).toBe(401);
  });
});

describe("error responses", () => {
  it("serialises an AppError as problem+json", async () => {
    vi.mocked(authService.register).mockRejectedValueOnce(
      new ConflictError("Email already in use"),
    );

    const res = await request(app)
      .post("/auth/register")
      .send({ email: "existing@example.com", password: "Password123!" });

    expect(res.headers["content-type"]).toMatch(/application\/problem\+json/);
    expect(res.body).toEqual({
      type: "about:blank",
      title: "Conflict",
      status: 409,
      detail: "Email already in use",
      code: "CONFLICT",
    });
  });

  it("returns 422 with field-level errors when validation fails", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ email: "test@example.com", password: "short" });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("VALIDATION_FAILED");
    expect(res.body.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "password" })]),
    );
  });

  it("returns 400 for malformed JSON without echoing the body", async () => {
    const warnSpy = vi.spyOn(logger, "warn");

    const res = await request(app)
      .post("/auth/login")
      .set("Content-Type", "application/json")
      .send('{"email": "test@example.com", "password": hunter2}');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("MALFORMED_JSON");
    expect(JSON.stringify(res.body)).not.toMatch(/hunter2/);
    expect(JSON.stringify(warnSpy.mock.calls)).not.toMatch(/hunter2/);
    expect(authService.login).not.toHaveBeenCalled();
  });

  it("returns 413 when the body exceeds the size limit", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ email: "test@example.com", password: "x".repeat(200_000) });

    expect(res.status).toBe(413);
    expect(res.body.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("treats an unrecognised exposed error as a 500", async () => {
    vi.mocked(authService.login).mockRejectedValueOnce(
      Object.assign(new Error("redirect"), { expose: true, status: 302 }),
    );

    const res = await request(app)
      .post("/auth/login")
      .send({ email: "test@example.com", password: "Password123!" });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe("INTERNAL_ERROR");
  });

  it("logs the path without the query string", async () => {
    const warnSpy = vi.spyOn(logger, "warn");

    await request(app).get("/auth/does-not-exist?token=secret-value");

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/auth/does-not-exist" }),
      expect.any(String),
    );
    expect(JSON.stringify(warnSpy.mock.calls)).not.toMatch(/secret-value/);
  });

  it("logs and delegates when headers were already sent", () => {
    const errorSpy = vi.spyOn(logger, "error");
    const next = vi.fn();
    const err = new Error("stream broke");

    createErrorHandler(logger)(
      err,
      { method: "GET", originalUrl: "/auth/me?token=secret-value" } as Request,
      { headersSent: true } as Response,
      next,
    );

    expect(next).toHaveBeenCalledWith(err);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/auth/me", err }),
      expect.any(String),
    );
  });

  it("returns a generic 500 without leaking the underlying error", async () => {
    vi.mocked(authService.login).mockRejectedValueOnce(
      new Error("connection to db-host:5432 refused"),
    );

    const res = await request(app)
      .post("/auth/login")
      .send({ email: "test@example.com", password: "Password123!" });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(res.body)).not.toMatch(/db-host/);
  });

  it("returns 404 for unknown routes", async () => {
    const res = await request(app).get("/auth/does-not-exist");

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("ROUTE_NOT_FOUND");
  });
});
