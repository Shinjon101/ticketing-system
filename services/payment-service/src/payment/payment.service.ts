import { env } from "@/config/env";
import crypto from "crypto";
import { db } from "@/db";
import { BookingSeatHeld, TOPICS } from "@ticketing/kafka-client";
import Razorpay from "razorpay";
import { holdRepository } from "./hold.repository";
import { logger } from "@/config/logger";
import { HttpError } from "@ticketing/common";
import { paymentRepository } from "./payment.repository";
import { holds } from "./hold.table";
import { and, eq } from "@ticketing/db";
import { outboxRepository } from "@/outbox/outbox.repository";

const razorpay = new Razorpay({
  key_id: env.RAZORPAY_KEY_ID,
  key_secret: env.RAZORPAY_KEY_SECRET,
});

export const paymentService = {
  onSeatHeld: async (msg: BookingSeatHeld): Promise<void> => {
    const {
      messageId,
      bookingId,
      userId,
      eventId,
      seatIds,
      seatNumbers,
      amount,
      expiresAt,
    } = msg;

    await db.transaction(async (tx) => {
      await holdRepository.upsertWithTx(tx as typeof db, {
        bookingId,
        userId,
        eventId,
        seatIds,
        seatNumbers,
        amount,
        expiresAt: new Date(expiresAt),
        status: "pending",
      });

      await holdRepository.markProcessedWithTx(
        tx as typeof db,
        messageId,
        TOPICS.BOOKING_SEAT_HELD,
      );
    });

    logger.info({ bookingId, expiresAt }, "Hold recorded");
  },

  createOrder: async (bookingId: string, userId: string) => {
    const hold = await holdRepository.findByBookingId(bookingId);

    if (!hold)
      throw new HttpError(404, "No active hold found for this booking");
    if (hold.userId !== userId) throw new HttpError(403, "Forbidden");
    if (hold.status !== "pending") {
      throw new HttpError(409, `Hold is already ${hold.status}`);
    }
    if (new Date() > hold.expiresAt) {
      throw new HttpError(410, "Seat hold has expired");
    }

    if (hold.razorpayOrderId) {
      const existing = await paymentRepository.findByOrderId(
        hold.razorpayOrderId,
      );
      if (existing) {
        return {
          orderId: hold.razorpayOrderId,
          amount: hold.amount,
          currency: "INR",
          keyId: env.RAZORPAY_KEY_ID,
        };
      }
    }

    const order = await razorpay.orders.create({
      amount: hold.amount,
      currency: "INR",
      receipt: bookingId,
      notes: { bookingId, userId, eventId: hold.eventId },
    });

    await db.transaction(async (tx) => {
      await paymentRepository.createWithTx(tx as typeof db, {
        bookingId,
        razorpayOrderId: order.id,
        amount: hold.amount,
        status: "created",
      });

      await tx
        .update(holds)
        .set({ razorpayOrderId: order.id, updatedAt: new Date() })
        .where(eq(holds.bookingId, bookingId));
    });

    logger.info(
      { bookingId, orderId: order.id, amount: hold.amount },
      "Razorpay order created",
    );

    return {
      orderId: order.id,
      amount: hold.amount,
      currency: "INR",
      keyId: env.RAZORPAY_KEY_ID,
    };
  },

  verifyPayment: async (
    bookingId: string,
    userId: string,
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string,
  ) => {
    const hold = await holdRepository.findByBookingId(bookingId);
    if (!hold) throw new HttpError(404, "No hold found for this booking");
    if (hold.userId !== userId) throw new HttpError(403, "Forbidden");
    if (hold.status !== "pending")
      throw new HttpError(409, `Hold is already ${hold.status}`);

    if (new Date() > hold.expiresAt) {
      await publishPaymentFailed(bookingId, "hold_expired");
      throw new HttpError(410, "Seat hold expired — please try booking again");
    }

    const generatedSignature = crypto
      .createHmac("sha256", env.RAZORPAY_KEY_SECRET)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");

    if (generatedSignature !== razorpaySignature) {
      logger.warn(
        { bookingId, razorpayOrderId },
        "Signature verification failed",
      );
      await publishPaymentFailed(bookingId, "signature_mismatch");
      throw new HttpError(400, "Payment signature verification failed");
    }

    const completed = await completeCapturedPayment({
      bookingId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });
    if (!completed)
      throw new HttpError(409, "Payment could not be completed for this hold");

    return { status: "captured", bookingId };
  },

  handleWebhook: async (
    rawBody: string,
    razorpaySignatureHeader: string,
  ): Promise<void> => {
    const generatedSignature = crypto
      .createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    if (generatedSignature !== razorpaySignatureHeader) {
      throw new HttpError(400, "Webhook signature verification failed");
    }

    const event = JSON.parse(rawBody) as {
      event: string;
      payload: Record<string, unknown>;
    };
    const paymentEntity = (
      event.payload as { payment: { entity: { order_id: string; id: string } } }
    ).payment?.entity;

    if (!paymentEntity) return;

    const payment = await paymentRepository.findByOrderId(
      paymentEntity.order_id,
    );
    if (!payment) return;

    if (event.event === "payment.captured" && payment.status !== "captured") {
      await completeCapturedPayment({
        bookingId: payment.bookingId,
        razorpayOrderId: paymentEntity.order_id,
        razorpayPaymentId: paymentEntity.id,
        razorpaySignature: razorpaySignatureHeader,
      });
    }

    if (event.event === "payment.failed" && payment.status === "created") {
      await publishPaymentFailed(payment.bookingId, "payment_declined");
    }
  },
};

async function completeCapturedPayment(params: {
  bookingId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<boolean> {
  const { bookingId, razorpayOrderId, razorpayPaymentId, razorpaySignature } =
    params;

  let completed = false;

  await db.transaction(async (tx) => {
    const result = await tx
      .update(holds)
      .set({ status: "completed", updatedAt: new Date() })
      .where(and(eq(holds.bookingId, bookingId), eq(holds.status, "pending")))
      .returning({ amount: holds.amount });

    if (result.length === 0) {
      logger.warn(
        { bookingId },
        "completeCapturedPayment: hold not pending — skipping",
      );
      return;
    }
    completed = true;
    const amount = result[0].amount;

    await paymentRepository.markCapturedWithTx(
      tx as typeof db,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    );

    await outboxRepository.createWithTx(tx as typeof db, {
      topic: TOPICS.PAYMENT_COMPLETED,
      payload: {
        messageId: crypto.randomUUID(),
        bookingId,
        razorpayPaymentId,
        razorpayOrderId,
        amount,
        paidAt: new Date().toISOString(),
      },
    });
  });

  if (completed)
    logger.info({ bookingId, razorpayPaymentId }, "Payment completed");
  return completed;
}

async function publishPaymentFailed(
  bookingId: string,
  reason:
    | "payment_declined"
    | "payment_cancelled"
    | "hold_expired"
    | "signature_mismatch",
): Promise<boolean> {
  let updated = false;

  await db.transaction(async (tx) => {
    const result = await tx
      .update(holds)
      .set({ status: "failed", updatedAt: new Date() })
      .where(and(eq(holds.bookingId, bookingId), eq(holds.status, "pending")))
      .returning({ bookingId: holds.bookingId });

    if (result.length === 0) {
      logger.warn(
        { bookingId, reason },
        "publishPaymentFailed: hold not pending — skipping",
      );
      return;
    }
    updated = true;

    await outboxRepository.createWithTx(tx as typeof db, {
      topic: TOPICS.PAYMENT_FAILED,
      payload: {
        messageId: crypto.randomUUID(),
        bookingId,
        reason,
        failedAt: new Date().toISOString(),
      },
    });
  });

  return updated;
}
