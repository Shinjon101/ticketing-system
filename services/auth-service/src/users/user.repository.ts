import { db } from "@/db";
import { NewUser, User, users } from "@/db/schema";
import { eq } from "@ticketing/db";

export const userRepository = {
  findByEmail: async (email: string): Promise<User | undefined> => {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    return result[0];
  },

  findById: async (id: string): Promise<User | undefined> => {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return result[0];
  },

  create: async (data: NewUser): Promise<User> => {
    const [user] = await db
      .insert(users)
      .values({
        ...data,
        email: data.email.toLowerCase(),
      })
      .returning();

    return user!;
  },

  updateRole: async (
    id: string,
    role: "user" | "admin",
  ): Promise<User | undefined> => {
    const [updated] = await db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return updated;
  },
};
