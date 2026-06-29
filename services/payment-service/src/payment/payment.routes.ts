import { Router } from "express";
import { validateRequest } from "@ticketing/common";
import { createOrderSchema, verifyPaymentSchema } from "./payment.schema";
import {
  createOrderHandler,
  verifyPaymentHandler,
  webhookHandler,
} from "./payment.controller";
import { authenticate } from "@/middlewares/authenticate";

export const paymentRouter: Router = Router();

paymentRouter.post("/webhook", webhookHandler);

paymentRouter.use(authenticate);

paymentRouter.post(
  "/orders",
  validateRequest({ body: createOrderSchema }),
  createOrderHandler,
);

paymentRouter.post(
  "/verify",
  validateRequest({ body: verifyPaymentSchema }),
  verifyPaymentHandler,
);
