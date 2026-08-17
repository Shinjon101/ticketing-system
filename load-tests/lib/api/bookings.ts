import http from "k6/http";
import { check } from "k6";
import { authHeaders, bookingHeaders } from "../../config/headers.ts";
import { BASE_URL } from "../../config/config.ts";

export interface Booking {
  id: string;
  status: string;
  seatIds: string[] | null;
  seatNumbers: string[] | null;
  amount: number;
  eventId: string;
  userId: string;
}

export function createBooking(
  token: string,
  eventId: string,
  idempotencyKey: string,
  quantity = 1,
): { booking: Booking } | null {
  const res = http.post(
    `${BASE_URL}/bookings`,
    JSON.stringify({ eventId, quantity }),
    { headers: bookingHeaders(token, idempotencyKey) },
  );

  const ok = check(res, {
    "createBooking: 202 Accepted": (r) => r.status === 202,
  });

  return ok ? (res.json() as unknown as { booking: Booking }) : null;
}

export function getBooking(token: string, bookingId: string): Booking | null {
  const res = http.get(`${BASE_URL}/bookings/${bookingId}`, {
    headers: authHeaders(token),
  });

  const ok = check(res, {
    "getBooking: 200 OK": (r) => r.status === 200,
  });

  return ok ? (res.json() as unknown as { booking: Booking }).booking : null;
}
