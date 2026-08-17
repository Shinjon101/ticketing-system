import http from "k6/http";
import { check } from "k6";
import k6crypto from "k6/crypto";
import { authHeaders } from "../../config/headers.ts";
import { BASE_URL } from "../../config/config.ts";

export interface OrderResult {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
}

export function createOrder(
  token: string,
  bookingId: string,
): OrderResult | null {
  const res = http.post(
    `${BASE_URL}/payments/orders`,
    JSON.stringify({ bookingId }),
    { headers: authHeaders(token) },
  );

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
