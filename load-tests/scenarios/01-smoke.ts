import { smokeProfile } from "../config/profiles.ts";
import { setupTest } from "../lib/workflows/bootstrap.ts";
import { createBooking, getBooking } from "../lib/api/bookings.ts";
import { fail } from "k6";

import { pollUntil } from "../lib/utils/polling.ts";
import { createOrder, verifyPayment } from "../lib/api/payments.ts";
import { RAZORPAY_KEY_SECRET } from "../config/config.ts";

export const options = smokeProfile;

export function setup() {
  return setupTest({ totalSeats: 10, userPoolSize: 1 });
}

export default function (data: { eventId: string; userTokens: string[] }) {
  const token = data.userTokens[0];
  const idempotencyKey = crypto.randomUUID();

  const bookingRes = createBooking(token, data.eventId, idempotencyKey, 1);
  if (!bookingRes) fail("Booking creation failed - API returned null");

  const bookingId = bookingRes.booking.id;

  const pollResult = pollUntil(
    () => getBooking(token, bookingId),
    (booking) => booking?.status === "seat_held",
    10_000, // 10 second timeout for the smoke test
    1_000, // 1 second interval
  );

  if (pollResult.timedOut) {
    fail(
      `Kafka Pipeline Delay: Booking ${bookingId} never reached 'seat_held' status.`,
    );
  }

  const order = createOrder(token, bookingId);
  if (!order) fail(`Failed to create payment order for booking ${bookingId}`);

  const isPaid = verifyPayment(
    token,
    bookingId,
    order.orderId,
    RAZORPAY_KEY_SECRET,
  );
  if (!isPaid) fail(`Payment verification failed for order ${order.orderId}`);
}
