import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
  verifyAccessToken,
} from "@/auth/token.service";

describe("token.service", () => {
  describe("signAccessToken / verifyAccessToken", () => {
    const payload = {
      sub: "user-123",
      email: "test@example.com",
      role: "user" as const,
    };

    it("signs and verifies it succesfully", () => {
      const token = signAccessToken(payload);

      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(0);

      expect(token.split(".")).toHaveLength(3);
    });

    it("decoded payload contains the original fields", () => {
      const token = signAccessToken(payload);
      const decoded = verifyAccessToken(token);

      expect(decoded.sub).toBe(payload.sub);
      expect(decoded.email).toBe(payload.email);
      expect(decoded.role).toBe(payload.role);
    });

    it("throws on a tampered token", () => {
      const token = signAccessToken(payload);

      const [header, , signature] = token.split(".");
      const tamperedPayload = Buffer.from(
        JSON.stringify({ sub: "mr-evil", role: "admin" }),
      ).toString("base64url");

      const tampered = `${header}.${tamperedPayload}.${signature}`;

      expect(() => verifyAccessToken(tampered)).toThrow();
    });

    it("throws on an expired token", async () => {
      const { default: jwt } = await import("jsonwebtoken");
      const { env } = await import("@/config/env");
      const privateKey = env.JWT_PRIVATE_KEY.replace(/\\n/g, "\n");

      //Calculate a time in the past  (10 seconds ago)
      const pastTimeInSeconds = Math.floor(Date.now() / 1000) - 10;
      const expiredPayload = { ...payload, exp: pastTimeInSeconds };

      const expiredToken = jwt.sign(expiredPayload, privateKey, {
        algorithm: "RS256",
      });

      expect(() => verifyAccessToken(expiredToken)).toThrow();
    });

    it("throws on a completely invalid string", () => {
      expect(() => verifyAccessToken("not.a.jwt")).toThrow();
      expect(() => verifyAccessToken("")).toThrow();
    });
  });

  describe("generateRefreshToken", () => {
    it("returns raw, hash, and expiresAt", () => {
      const result = generateRefreshToken();

      expect(result).toHaveProperty("raw");
      expect(result).toHaveProperty("hash");
      expect(result).toHaveProperty("expiresAt");
    });

    it("raw and hash are different strings", () => {
      const { raw, hash } = generateRefreshToken();
      expect(raw).not.toBe(hash);
    });

    it("generates unique tokens on each call", () => {
      const first = generateRefreshToken();
      const second = generateRefreshToken();

      expect(first.raw).not.toBe(second.raw);
      expect(first.hash).not.toBe(second.hash);
    });
  });

  describe("hashRefreshToken", () => {
    it("same input always produces same hash (deterministic)", () => {
      const raw = "some-raw-token-value";
      expect(hashRefreshToken(raw)).toBe(hashRefreshToken(raw));
    });

    it("different inputs produce different hashes", () => {
      expect(hashRefreshToken("token-a")).not.toBe(hashRefreshToken("token-b"));
    });
  });
});
