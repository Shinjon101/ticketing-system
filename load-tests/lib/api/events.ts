import http from "k6/http";
import { check } from "k6";
import { BASE_URL, EVENT_PRICE } from "../../config/config.ts";
import { authHeaders } from "../../config/headers.ts";

export interface Event {
  id: string;
  title: string;
  venue: string;
  totalSeats: number;
  price: number;
  status: string;
  saleStartsAt: string | null;
  eventDate: string;
}

export function createEvent(adminToken: string, totalSeats: number): Event {
  const eventDate = new Date(
    Date.now() + 365 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const saleStartsAt = new Date(Date.now() - 60_000).toISOString();

  const res = http.post(
    `${BASE_URL}/events`,
    JSON.stringify({
      title: `k6 Load Test [${new Date().toISOString()}]`,
      venue: "Load Test Arena",
      eventDate,
      totalSeats,
      price: EVENT_PRICE,
      saleStartsAt,
    }),
    { headers: authHeaders(adminToken) },
  );

  const ok = check(res, {
    "createEvent: 201 Created": (r) => r.status === 201,
  });

  if (!ok) {
    throw new Error(
      `createEvent() failed: HTTP ${res.status} — ${res.body}. ` +
        "Ensure the account has role='admin'.",
    );
  }

  return (res.json() as unknown as { event: Event }).event;
}

export function activateEvent(adminToken: string, eventId: string): Event {
  const res = http.patch(
    `${BASE_URL}/events/${eventId}`,
    JSON.stringify({ status: "active" }),
    { headers: authHeaders(adminToken) },
  );

  const ok = check(res, {
    "activateEvent: 200 OK": (r) => r.status === 200,
  });

  if (!ok) {
    throw new Error(`activateEvent() failed: HTTP ${res.status} — ${res.body}`);
  }

  return (res.json() as unknown as { event: Event }).event;
}

export function createAndActivateEvent(
  adminToken: string,
  totalSeats: number,
): Event {
  const event = createEvent(adminToken, totalSeats);
  return activateEvent(adminToken, event.id);
}
