import { User } from "@/db/schema";
import { userRepository } from "@/users/user.repository";
import { HttpError } from "@ticketing/common";
import brcypt from "bcrypt";
import { authRepository } from "./auth.repository";
import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
} from "./token.service";

export interface RegisterInput {
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface AuthResult {
  user: Pick<User, "id" | "email" | "role">;
  tokens: AuthTokens;
}

const BCRYPT_ROUNDS = 12;

export const authService = {
  register: async (input: RegisterInput): Promise<AuthResult> => {
    const { email, password } = input;

    const existing = await userRepository.findByEmail(email);
    if (existing) {
      throw new HttpError(409, "Email already in use");
    }

    const passwordHash = await brcypt.hash(password, BCRYPT_ROUNDS);

    const user = await userRepository.create({
      email,
      passwordHash,
      role: "user",
    });

    const tokens = await createTokenPair(user);

    return {
      user: { id: user.id, email: user.email, role: user.role },
      tokens,
    };
  },

  login: async (input: LoginInput): Promise<AuthResult> => {
    const { email, password } = input;

    const user = await userRepository.findByEmail(email);
    // Dummy hash: used when user is not found to prevent timing attacks.
    // bcrypt.compare will always fail against this, but it takes the same time.
    const DUMMY_HASH =
      "$2b$12$invalidhashfordummycomparison1234567890123456789012";

    const passwordToCheck = user?.passwordHash ?? DUMMY_HASH;
    const isValid = await brcypt.compare(password, passwordToCheck);

    if (!user || !isValid) {
      throw new HttpError(401, "Invalid credentials");
    }

    const tokens = await createTokenPair(user);

    return {
      user: { id: user.id, email: user.email, role: user.role },
      tokens,
    };
  },

  refresh: async (rawRefreshToken: string): Promise<AuthTokens> => {
    const hash = hashRefreshToken(rawRefreshToken);
    const storedToken = await authRepository.findByHash(hash);

    if (!storedToken) {
      throw new HttpError(401, "Invalid or expired refresh token");
    }

    const user = await userRepository.findById(storedToken.userId);

    if (!user) {
      throw new HttpError(401, "User not found");
    }

    await authRepository.revokeById(storedToken.id);

    return createTokenPair(user);
  },

  logout: async (rawRefreshToken: string): Promise<void> => {
    const hash = hashRefreshToken(rawRefreshToken);
    const storedToken = await authRepository.findByHash(hash);

    if (!storedToken) {
      return;
    }

    await authRepository.revokeById(storedToken.id);
  },
};

const createTokenPair = async (user: User): Promise<AuthTokens> => {
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });

  const { raw, hash, expiresAt } = generateRefreshToken();

  await authRepository.create({
    userId: user.id,
    tokenHash: hash,
    expiresAt,
  });

  return {
    accessToken,
    refreshToken: raw,
    refreshTokenExpiresAt: expiresAt,
  };
};
