import type { Request, Response, RequestHandler } from "express";
import { asyncHandler } from "@ticketing/common";
import { paymentService } from "./payment.service";

export const createOrderHandler: RequestHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { bookingId } = req.body as { bookingId: string };
    const result = await paymentService.createOrder(bookingId, req.user.sub);
    res.status(201).json(result);
  },
);

export const verifyPaymentHandler: RequestHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { bookingId, razorpayOrderId, razorpayPaymentId, razorpaySignature } =
      req.body as {
        bookingId: string;
        razorpayOrderId: string;
        razorpayPaymentId: string;
        razorpaySignature: string;
      };
    const result = await paymentService.verifyPayment(
      bookingId,
      req.user.sub,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    );
    res.status(200).json(result);
  },
);

export const webhookHandler: RequestHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const signature = req.headers["x-razorpay-signature"] as string;
    // rawBody is attached by the raw body parser middleware in app.ts
    const rawBody = (req as Request & { rawBody: string }).rawBody;
    await paymentService.handleWebhook(rawBody, signature);
    // Razorpay expects a 200 response to acknowledge receipt
    res.status(200).json({ received: true });
  },
);
