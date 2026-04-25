import { validateRequest } from "@ticketing/common";
import { Router } from "express";
import { loginSchema, registerSchema } from "./auth.schema";
import {
  loginHandler,
  logoutHandler,
  refreshHandler,
  registerHandler,
} from "./auth.controller";

export const authRouter: Router = Router();

authRouter.post(
  "/register",
  validateRequest({ body: registerSchema }),
  registerHandler,
);

authRouter.post("/login", validateRequest({ body: loginSchema }), loginHandler);

authRouter.post("/refresh", refreshHandler);

authRouter.post("/logout", logoutHandler);
