import { z } from "@ticketing/common";

export const registerSchema = z.object({
  email: z.email({ error: "Valid email is required" }),
  password: z
    .string({ error: "Password is required" })
    .min(8, "Password must be atleast 8 characters")
    .max(72, "Password must be at most 72 characters"),
});

export const loginSchema = z.object({
  email: z.email({ error: "Valid email is required" }),
  password: z.string().min(1, "Password is required"),
});

export const updateRoleSchema = z.object({
  role: z.enum(["user", "admin"]),
});
export const userIdParamSchema = z.object({ id: z.uuid() });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
