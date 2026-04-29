import type { Request, Response, RequestHandler } from "express";
import { asyncHandler } from "@ticketing/common";
import { bookingService } from "./booking.service";
import type { CreateBookingInput } from "./booking.schema";

export const getAllHandler: RequestHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const bookings = await bookingService.getByUserId(req.user.sub);
    res.status(200).json({ bookings });
  },
);

export const getByIdHandler: RequestHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const booking = await bookingService.getById(
      String(req.params.id),
      req.user.sub,
    );
    res.status(200).json({ booking });
  },
);

export const createHandler: RequestHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const input = req.body as CreateBookingInput;

    const idempotencyKey = req.headers["idempotency-key"] as string;

    const booking = await bookingService.create({
      userId: req.user.sub,
      eventId: input.eventId,
      idempotencyKey,
    });

    res.status(202).json({ booking });
  },
);
