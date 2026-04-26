import { Router } from "express";
import { getProfileHandler } from "./user.controller";
import { autheticate } from "@/middleware/authenticate";

export const userRouter: Router = Router();

userRouter.get("/me", autheticate, getProfileHandler);
