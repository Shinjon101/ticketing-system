vi.mock("@/users/user.repository", () => ({
  userRepository: {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("@/auth/auth.repository", () => ({
  authRepository: {
    findByHash: vi.fn(),
    create: vi.fn(),
    revokeById: vi.fn(),
  },
}));

vi.mock("@/auth/token.service", () => ({
  signAccessToken: vi.fn().mockReturnValue("mock-access-token"),
  generateRefreshToken: vi.fn().mockReturnValue({
    raw: "mock-raw-refresh-token",
    hash: "mock-hashed-refresh-token",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  }),
  hashRefreshToken: vi.fn((raw: string) => `hashed:${raw}`),
}));

import { authService } from "@/auth/auth.service";
import { userRepository } from "@/users/user.repository";
import { authRepository } from "@/auth/auth.repository";
import { HttpError } from "@ticketing/common";

const mockUser = {
  id: "user-uuid-123",
  email: "test@example.com",
  passwordHash: "$2b$12$mockhashedpassword123456789012345678901234567",
  role: "user" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("auth.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("register", () => {
    it("creates a user and returns tokens on success", async () => {
      vi.mocked(userRepository.findByEmail).mockResolvedValue(undefined);
      vi.mocked(userRepository.create).mockResolvedValue(mockUser);
      vi.mocked(authRepository.create).mockResolvedValue({
        id: "token-uuid",
        userId: mockUser.id,
        tokenHash: "mock-hashed-refresh-token",
        revoked: false,
        expiresAt: new Date(),
        createdAt: new Date(),
      });

      const result = await authService.register({
        email: "test@example.com",
        password: "Password123!",
      });

      expect(result.user.id).toBe(mockUser.id);
      expect(result.user.email).toBe(mockUser.email);
      expect(result.user.role).toBe("user");

      expect(result.tokens.accessToken).toBe("mock-access-token");
      expect(result.tokens.refreshToken).toBe("mock-raw-refresh-token");

      expect(userRepository.findByEmail).toHaveBeenCalledWith(
        "test@example.com",
      );
      expect(userRepository.create).toHaveBeenCalledOnce();

      const createCall = vi.mocked(userRepository.create).mock.calls[0]![0];
      expect(createCall).not.toHaveProperty("password");
      expect(createCall).toHaveProperty("passwordHash");
    });

    it("throws 409 when email is already in use", async () => {
      vi.mocked(userRepository.findByEmail).mockResolvedValue(mockUser);

      await expect(
        authService.register({
          email: "test@example.com",
          password: "Password123!",
        }),
      ).rejects.toThrow(HttpError);

      await expect(
        authService.register({
          email: "test@example.com",
          password: "Password123!",
        }),
      ).rejects.toMatchObject({ statusCode: 409 });

      expect(userRepository.create).not.toHaveBeenCalled();
    });
  });

  describe("login", () => {
    it("returns tokens on valid creds", async () => {
      const bcrypt = await import("bcryptjs");
      const realHash = await bcrypt.hash("Password123!", 1);

      vi.mocked(userRepository.findByEmail).mockResolvedValue({
        ...mockUser,
        passwordHash: realHash,
      });
      vi.mocked(authRepository.create).mockResolvedValue({
        id: "token-uuid",
        userId: mockUser.id,
        tokenHash: "mock-hashed-refresh-token",
        revoked: false,
        expiresAt: new Date(),
        createdAt: new Date(),
      });

      const result = await authService.login({
        email: "test@example.com",
        password: "Password123!",
      });

      expect(result.user.email).toBe(mockUser.email);
      expect(result.tokens.accessToken).toBe("mock-access-token");
    });

    it("throws 401 on wrong password", async () => {
      const bcrypt = await import("bcryptjs");
      const realHash = await bcrypt.hash("CorrectPassword", 1);

      vi.mocked(userRepository.findByEmail).mockResolvedValue({
        ...mockUser,
        passwordHash: realHash,
      });

      await expect(
        authService.login({
          email: "test@example.com",
          password: "WrongPassword",
        }),
      ).rejects.toMatchObject({ statusCode: 401 });
    });

    it("throws 401 when user does not exist", async () => {
      vi.mocked(userRepository.findByEmail).mockResolvedValue(undefined);

      await expect(
        authService.login({
          email: "nobody@example.com",
          password: "anypassword",
        }),
      ).rejects.toMatchObject({ statusCode: 401 });
    });

    it("returns the same error message for wrong user and wrong password", async () => {
      const bcrypt = await import("bcryptjs");
      const realHash = await bcrypt.hash("CorrectPassword", 1);

      vi.mocked(userRepository.findByEmail).mockResolvedValue({
        ...mockUser,
        passwordHash: realHash,
      });

      const wrongPasswordError = await authService
        .login({ email: "test@example.com", password: "WrongPassword" })
        .catch((e) => e);

      vi.mocked(userRepository.findByEmail).mockResolvedValue(undefined);

      const noUserError = await authService
        .login({ email: "nobody@example.com", password: "any" })
        .catch((e) => e);

      expect(wrongPasswordError.message).toBe(noUserError.message);
      expect(wrongPasswordError.statusCode).toBe(noUserError.statusCode);
    });
  });

  describe("refresh", () => {
    const rawToken = "valid-raw-refresh-token";

    it("issues new tokens and revokes the old refresh token", async () => {
      const storedToken = {
        id: "stored-token-id",
        userId: mockUser.id,
        tokenHash: `hashed:${rawToken}`,
        revoked: false,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        createdAt: new Date(),
      };

      vi.mocked(authRepository.findByHash).mockResolvedValue(storedToken);
      vi.mocked(userRepository.findById).mockResolvedValue(mockUser);
      vi.mocked(authRepository.create).mockResolvedValue({
        ...storedToken,
        id: "new-token-id",
      });

      const tokens = await authService.refresh(rawToken);

      expect(tokens.accessToken).toBe("mock-access-token");
      expect(tokens.refreshToken).toBe("mock-raw-refresh-token");

      expect(authRepository.revokeById).toHaveBeenCalledWith(storedToken.id);

      expect(authRepository.create).toHaveBeenCalledOnce();
    });

    it("throws 401 when refresh token is not found", async () => {
      vi.mocked(authRepository.findByHash).mockResolvedValue(undefined);

      await expect(authService.refresh(rawToken)).rejects.toMatchObject({
        statusCode: 401,
      });

      expect(authRepository.revokeById).not.toHaveBeenCalled();
      expect(authRepository.create).not.toHaveBeenCalled();
    });

    it("throws 401 when user no longer exists", async () => {
      vi.mocked(authRepository.findByHash).mockResolvedValue({
        id: "stored-token-id",
        userId: "deleted-user-id",
        tokenHash: "some-hash",
        revoked: false,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        createdAt: new Date(),
      });
      vi.mocked(userRepository.findById).mockResolvedValue(undefined);

      await expect(authService.refresh(rawToken)).rejects.toMatchObject({
        statusCode: 401,
      });
    });
  });

  describe("logout", () => {
    it("revokes the refresh token on valid logout", async () => {
      const storedToken = {
        id: "stored-token-id",
        userId: mockUser.id,
        tokenHash: "some-hash",
        revoked: false,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        createdAt: new Date(),
      };

      vi.mocked(authRepository.findByHash).mockResolvedValue(storedToken);

      await authService.logout("raw-token");

      expect(authRepository.revokeById).toHaveBeenCalledWith(storedToken.id);
    });

    it("does not throw when token is not found (already logged out)", async () => {
      vi.mocked(authRepository.findByHash).mockResolvedValue(undefined);

      await expect(
        authService.logout("already-invalid-token"),
      ).resolves.toBeUndefined();
      expect(authRepository.revokeById).not.toHaveBeenCalled();
    });
  });
});
