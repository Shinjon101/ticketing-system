import { db } from "@/db";
import { NewRefreshToken, RefreshToken, refreshTokens } from "./auth.table";
import { and, eq, gt, lt } from "@ticketing/db";

export const authRepository = {
  findByHash: async (hash: string): Promise<RefreshToken | undefined> => {
    const result = await db
      .select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.tokenHash, hash),
          eq(refreshTokens.revoked, false),
          gt(refreshTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);

    return result[0];
  },

  create: async (data: NewRefreshToken): Promise<RefreshToken> => {
    const [token] = await db.insert(refreshTokens).values(data).returning();
    return token!;
  },

  revokeById: async (id: string): Promise<void> => {
    await db
      .update(refreshTokens)
      .set({ revoked: true })
      .where(eq(refreshTokens.id, id));
  },

  revokeAllForUser: async (userId: string): Promise<void> => {
    await db
      .update(refreshTokens)
      .set({ revoked: true })
      .where(
        and(eq(refreshTokens.userId, userId), eq(refreshTokens.revoked, false)),
      );
  },

  deleteExpired: async (before: Date): Promise<void> => {
    await db.delete(refreshTokens).where(lt(refreshTokens.expiresAt, before));
  },
};
