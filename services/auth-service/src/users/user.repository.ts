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
};
