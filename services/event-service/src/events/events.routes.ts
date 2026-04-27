import { Router } from "express";
import {
  createHandler,
  getAllHandler,
  getByIdHandler,
  updateHandler,
} from "./events.controller";
import { validateRequest } from "@ticketing/common";
import {
  createEventSchema,
  eventIdParamSchema,
  updateEventSchema,
} from "./events.schema";
import { authenticate, requireRole } from "@/middleware/authenticate";

export const eventRouter: Router = Router();

eventRouter.get("/", getAllHandler);

eventRouter.get(
  "/",
  validateRequest({ params: eventIdParamSchema }),
  getByIdHandler,
);

//Admin only

eventRouter.post(
  "/",
  authenticate,
  requireRole("admin"),
  validateRequest({ body: createEventSchema }),
  createHandler,
);

eventRouter.patch(
  "/:id",
  authenticate,
  requireRole("admin"),
  validateRequest({
    params: eventIdParamSchema,
    body: updateEventSchema,
  }),
  updateHandler,
);
