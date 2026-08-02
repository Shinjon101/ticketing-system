import { Router } from "express";
import { getProfileHandler, updateRoleHandler } from "./user.controller";
import { autheticate, requireRole } from "@/middleware/authenticate";
import { validateRequest } from "@ticketing/common";
import { updateRoleSchema, userIdParamSchema } from "@/auth/auth.schema";

export const userRouter: Router = Router();

userRouter.get("/me", autheticate, getProfileHandler);

userRouter.patch(
  "/:id/role",
  autheticate,
  requireRole("admin"),
  validateRequest({ params: userIdParamSchema, body: updateRoleSchema }),
  updateRoleHandler,
);
