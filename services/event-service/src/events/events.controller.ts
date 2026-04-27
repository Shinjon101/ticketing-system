import { asyncHandler } from "@ticketing/common";
import { RequestHandler } from "express";
import {
  CreateEventInput,
  eventService,
  UpdateEventInput,
} from "./event.service";
import type { Request, Response } from "express";

export const getAllHandler: RequestHandler = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const events = await eventService.getAll();
    res.status(200).json({ events });
  },
);

export const getByIdHandler: RequestHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const id = String(req.params.id);
    const event = await eventService.getById(id);
    res.status(200).json({ event });
  },
);

export const createHandler: RequestHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const input: CreateEventInput = req.body;

    const event = await eventService.create({
      ...input,
      eventDate: new Date(input.eventDate),
      saleStartsAt: input.saleStartsAt
        ? new Date(input.saleStartsAt)
        : undefined,
      createdBy: req.user.sub,
    });
    res.status(201).json({ event });
  },
);

export const updateHandler: RequestHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const input: UpdateEventInput = req.body;
    const id = String(req.params.id);
    const event = await eventService.update(id, {
      ...input,
      eventDate: input.eventDate ? new Date(input.eventDate) : undefined,
      saleStartsAt: input.saleStartsAt
        ? new Date(input.saleStartsAt)
        : undefined,
    });

    res.status(200).json({ event });
  },
);

export const cancelHandler: RequestHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const id = String(req.params.id);
    await eventService.cancel(id!);
    res.status(200).json({ message: "Event cancelled" });
  },
);
