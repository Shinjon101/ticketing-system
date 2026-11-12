import http from "k6/http";
import { check, sleep } from "k6";
import k6crypto from "k6/crypto";
import { authHeaders } from "../../config/headers.ts";
import { BASE_URL } from "../../config/config.ts";

export interface OrderResult {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
}

// Payment learns about a held seat from booking-seat-held, which lands after
// the booking itself reads seat_held (booking's outbox poll, then Kafka).
// Until then it answers 404 "No active hold", so a client that moves on the
// moment it sees seat_held has to retry briefly.
const HOLD_NOT_READY = "No active hold";

export function createOrder(
  token: string,
  bookingId: string,
  attempts = 5,
  retryDelaySeconds = 0.3,
): OrderResult | null {
  const post = () =>
    http.post(`${BASE_URL}/payments/orders`, JSON.stringify({ bookingId }), {
      headers: authHeaders(token),
      // The not-ready 404 is expected, so it shouldn't count as a failed request.
      responseCallback: http.expectedStatuses(201, 404),
    });

  const holdNotReady = (r: ReturnType<typeof post>) =>
    r.status === 404 &&
    typeof r.body === "string" &&
    r.body.includes(HOLD_NOT_READY);

  let res = post();
  for (let attempt = 1; attempt < attempts && holdNotReady(res); attempt++) {
    sleep(retryDelaySeconds);
    res = post();
  }

  const ok = check(res, {
    "createOrder: 201 Created": (r) => r.status === 201,
  });

  return ok ? (res.json() as unknown as OrderResult) : null;
}

export function verifyPayment(
  token: string,
  bookingId: string,
  razorpayOrderId: string,
  keySecret: string,
): boolean {
  const razorpayPaymentId = `pay_${crypto.randomUUID().replace(/-/g, "").substring(0, 14)}`;
  const signatureInput = `${razorpayOrderId}|${razorpayPaymentId}`;
  const razorpaySignature = k6crypto.hmac(
    "sha256",
    keySecret,
    signatureInput,
    "hex",
  );

  const res = http.post(
    `${BASE_URL}/payments/verify`,
    JSON.stringify({
      bookingId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    }),
    { headers: authHeaders(token) },
  );

  return check(res, {
    "verifyPayment: 200 OK": (r) => r.status === 200,
  });
}
