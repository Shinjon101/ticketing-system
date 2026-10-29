import { authenticate } from "@/middleware/authenticate";
import { Router, type Response, Request, NextFunction } from "express";
import {
  createHandler,
  getAllHandler,
  getByIdHandler,
} from "./booking.controller";
import { validateRequest, BadRequestError } from "@ticketing/common";
import { bookingIdParamSchema, createBookingSchema } from "./booking.schema";

export const bookingRouter: Router = Router();

bookingRouter.use(authenticate);

bookingRouter.get("/", getAllHandler);

bookingRouter.get(
  "/:id",
  validateRequest({ params: bookingIdParamSchema }),
  getByIdHandler,
);

bookingRouter.post(
  "/",

  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.headers["idempotency-key"]) {
      next(new BadRequestError("Idempotency-Key header is required"));
      return;
    }
    next();
  },
  validateRequest({ body: createBookingSchema }),
  createHandler,
);
