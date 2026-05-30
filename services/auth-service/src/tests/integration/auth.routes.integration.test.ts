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
import { createApp } from "@/app";
import { authService } from "@/auth/auth.service";
import { verifyAccessToken } from "@/auth/token.service";
import { HttpError } from "@ticketing/common";
import { email } from "zod";

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
      new HttpError(409, "Email already in use"),
    );

    const res = await request(app)
      .post("/auth/register")
      .send({ email: "existing@example.com", password: "Password123!" });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/email already in use/i);
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
      new HttpError(401, "Invalid credentials"),
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
      new HttpError(401, "Invalid or expired refresh token"),
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

describe("404 catch-all", () => {
  it("returns 404 for unknown routes", async () => {
    const res = await request(app).get("/auth/does-not-exist");
    expect(res.status).toBe(404);
  });
});
