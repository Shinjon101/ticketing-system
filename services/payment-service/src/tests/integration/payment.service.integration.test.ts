import crypto from "crypto";
import { randomUUID } from "crypto";
import { eq } from "@ticketing/db";
import { connectDB, db } from "@/db";
import { holds } from "@/payment/hold.table";
import { payments } from "@/payment/payment.table";
import { outboxEvents } from "@/outbox/outbox.table";
import { processedEvents } from "@/outbox/processed-events.table";
import { holdRepository } from "@/payment/hold.repository";
import { paymentRepository } from "@/payment/payment.repository";
import { paymentService } from "@/payment/payment.service";
import { TOPICS } from "@ticketing/kafka-client";

const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET!;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET!;

beforeAll(() => connectDB());
afterEach(async () => {
  await db.delete(payments);
  await db.delete(holds);
  await db.delete(outboxEvents);
  await db.delete(processedEvents);
});

const seedHoldAndPayment = async (
  opts: {
    holdStatus?: "pending" | "completed" | "failed";
    paymentStatus?: "created" | "captured" | "failed";
    expiresAt?: Date;
  } = {},
) => {
  const bookingId = randomUUID();
  const userId = randomUUID();
  const razorpayOrderId = `order_${randomUUID()}`;

  await db.transaction((tx) =>
    holdRepository.upsertWithTx(tx as typeof db, {
      bookingId,
      userId,
      eventId: randomUUID(),
      seatIds: ["seat-1"],
      seatNumbers: ["Seat 1"],
      amount: 5000,
      razorpayOrderId,
      expiresAt: opts.expiresAt ?? new Date(Date.now() + 60_000),
      status: opts.holdStatus ?? "pending",
    }),
  );
  await db.transaction((tx) =>
    paymentRepository.createWithTx(tx as typeof db, {
      bookingId,
      razorpayOrderId,
      amount: 5000,
      status: opts.paymentStatus ?? "created",
    }),
  );

  return { bookingId, userId, razorpayOrderId };
};

const webhookPayload = (event: string, orderId: string, paymentId: string) =>
  JSON.stringify({
    event,
    payload: { payment: { entity: { id: paymentId, order_id: orderId } } },
  });

const sign = (body: string, secret: string) =>
  crypto.createHmac("sha256", secret).update(body).digest("hex");

describe("handleWebhook — signature correctness against real HMAC", () => {
  it("rejects a tampered payload without mutating any state", async () => {
    const { razorpayOrderId } = await seedHoldAndPayment();
    const rawBody = webhookPayload(
      "payment.captured",
      razorpayOrderId,
      "pay_1",
    );
    const signature = sign(rawBody, WEBHOOK_SECRET);
    const tampered = rawBody.replace("payment.captured", "payment.failed");

    await expect(
      paymentService.handleWebhook(tampered, signature),
    ).rejects.toMatchObject({ statusCode: 400 });

    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.razorpayOrderId, razorpayOrderId));
    expect(payment.status).toBe("created"); // untouched
  });

  it("a valid captured webhook completes the hold and queues PAYMENT_COMPLETED exactly once", async () => {
    const { bookingId, razorpayOrderId } = await seedHoldAndPayment();
    const rawBody = webhookPayload(
      "payment.captured",
      razorpayOrderId,
      "pay_1",
    );

    await paymentService.handleWebhook(rawBody, sign(rawBody, WEBHOOK_SECRET));

    const [hold] = await db
      .select()
      .from(holds)
      .where(eq(holds.bookingId, bookingId));
    expect(hold.status).toBe("completed");

    const completedRows = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.topic, TOPICS.PAYMENT_COMPLETED));
    expect(completedRows).toHaveLength(1);
  });

  it("concurrent duplicate webhook deliveries complete the hold only once (compare-and-swap)", async () => {
    const { bookingId, razorpayOrderId } = await seedHoldAndPayment();
    const rawBody = webhookPayload(
      "payment.captured",
      razorpayOrderId,
      "pay_1",
    );
    const signature = sign(rawBody, WEBHOOK_SECRET);

    // Simulates Razorpay's documented at-least-once webhook redelivery.
    await Promise.all([
      paymentService.handleWebhook(rawBody, signature),
      paymentService.handleWebhook(rawBody, signature),
    ]);

    const completedRows = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.topic, TOPICS.PAYMENT_COMPLETED));
    expect(completedRows).toHaveLength(1); // the WHERE status='pending' guard wins the race exactly once

    const [hold] = await db
      .select()
      .from(holds)
      .where(eq(holds.bookingId, bookingId));
    expect(hold.status).toBe("completed");
  });

  it("defense in depth: a late 'payment.failed' webhook cannot revert an already-captured payment", async () => {
    const { bookingId, razorpayOrderId } = await seedHoldAndPayment();
    const capturedBody = webhookPayload(
      "payment.captured",
      razorpayOrderId,
      "pay_1",
    );
    await paymentService.handleWebhook(
      capturedBody,
      sign(capturedBody, WEBHOOK_SECRET),
    );

    // A stale/out-of-order "failed" webhook for the same order arrives after capture.
    const failedBody = webhookPayload(
      "payment.failed",
      razorpayOrderId,
      "pay_1",
    );
    await paymentService.handleWebhook(
      failedBody,
      sign(failedBody, WEBHOOK_SECRET),
    );

    const [hold] = await db
      .select()
      .from(holds)
      .where(eq(holds.bookingId, bookingId));
    expect(hold.status).toBe("completed"); // not reverted

    const failedRows = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.topic, TOPICS.PAYMENT_FAILED));
    expect(failedRows).toHaveLength(0); // no compensation for an already-settled payment
  });
});

describe("verifyPayment — signature validity is necessary but not sufficient", () => {
  it("accepts a correctly signed payment and completes the hold", async () => {
    const { bookingId, userId, razorpayOrderId } = await seedHoldAndPayment();
    const paymentId = "pay_test_1";
    const signature = sign(`${razorpayOrderId}|${paymentId}`, KEY_SECRET);

    const result = await paymentService.verifyPayment(
      bookingId,
      userId,
      razorpayOrderId,
      paymentId,
      signature,
    );
    expect(result.status).toBe("captured");

    const [hold] = await db
      .select()
      .from(holds)
      .where(eq(holds.bookingId, bookingId));
    expect(hold.status).toBe("completed");
  });

  it("rejects a forged signature and queues a compensating PAYMENT_FAILED", async () => {
    const { bookingId, userId, razorpayOrderId } = await seedHoldAndPayment();

    await expect(
      paymentService.verifyPayment(
        bookingId,
        userId,
        razorpayOrderId,
        "pay_test_1",
        "forged-signature",
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    const [hold] = await db
      .select()
      .from(holds)
      .where(eq(holds.bookingId, bookingId));
    expect(hold.status).toBe("failed");
  });

  it("rejects an expired hold even with a genuinely correct signature — proves status is checked independently of signature validity", async () => {
    const { bookingId, userId, razorpayOrderId } = await seedHoldAndPayment({
      expiresAt: new Date(Date.now() - 1000),
    });
    const paymentId = "pay_test_1";
    const signature = sign(`${razorpayOrderId}|${paymentId}`, KEY_SECRET); // genuinely valid

    await expect(
      paymentService.verifyPayment(
        bookingId,
        userId,
        razorpayOrderId,
        paymentId,
        signature,
      ),
    ).rejects.toMatchObject({ statusCode: 410 });

    const failedRows = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.topic, TOPICS.PAYMENT_FAILED));
    expect(failedRows).toHaveLength(1);
  });
});
