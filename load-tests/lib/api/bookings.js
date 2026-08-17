import http from "k6/http";
import { check } from "k6";
import { authHeaders, bookingHeaders } from "./headers.js";
import { BASE_URL } from "../../config.js";

export const createBooking = (token, eventId, idempotencyKey, quantity = 1) => {
  const res = http.post(
    `${BASE_URL}/bookings`,
    JSON.stringify({ eventId, quantity }),
    { headers: bookingHeaders(token, idempotencyKey) },
  );

  const ok = check(res, {
    "createBooking: 202 Accepted": (r) => r.status === 202,
  });

  if (!ok) {
    return null;
  }

  return JSON.parse(res.body);
};

export const getBooking = (token, bookingId) => {
  const res = http.get(`${BASE_URL}/bookings/${bookingId}`, {
    headers: authHeaders(token),
  });
  const ok = check(res, {
    "getBooking: 200 OK": (r) => r.status === 200,
  });

  if (!ok) return null;

  return JSON.parse(res.body).booking;
};
