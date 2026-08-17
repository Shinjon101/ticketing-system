import http from "k6/http";
import { check } from "k6";
import crypto from "k6/crypto";
import { uuidv4 } from "https://jslib.k6.io/uuid/4.4.2/index.js";
import { authHeaders } from "../../config/headers.js";
import { BASE_URL } from "../../config/config.js";

export const createOrder = (token, bookingId) => {
  const res = http.post(
    `${BASE_URL}/payments/orders`,
    JSON.stringify({ bookingId }),
    { headers: authHeaders(token) },
  );
  const ok = check(res, {
    "createOrder: 201 Created": (r) => r.status === 201,
  });

  if (!ok) return null;

  return JSON.parse(res.body);
};

export const verifyPayment = (token, bookingId, razorpayOrderId, keySecret) => {
  const razorpayPaymentId = `pay_${uuidv4().replace(/-/g, "").substring(0, 14)}`;

  const signatureInput = `${razorpayOrderId}|${razorpayPaymentId}`;
  const razorpaySignature = crypto.hmac(
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

  const ok = check(res, {
    "verifyPayment: 200 OK": (r) => r.status === 200,
  });

  return ok;
};
