import http from "k6/http";
import { check } from "k6";
import { BASE_URL, EVENT_PRICE } from "../../config/config";
import { authHeaders } from "../../config/headers";

export const createEvent = (adminToken, totalSeats) => {
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
        "Ensure ADMIN_EMAIL/ADMIN_PASSWORD are set and the account has role='admin'.",
    );
  }

  return JSON.parse(res.body).event;
};

export const activateEvent = (adminToken, eventId) => {
  const res = http.patch(
    `${BASE_URL}/events/${eventId}`,
    JSON.stringify({ status: "active" }),
    { headers: authHeaders(adminToken) },
  );

  const ok = check(res, { "activateEvent: 200 OK": (r) => r.status === 200 });
  if (!ok) {
    throw new Error(`activateEvent() failed: HTTP ${res.status} — ${res.body}`);
  }

  return JSON.parse(res.body).event;
};

export const createAndActivateEvent = (adminToken, totalSeats) => {
  const event = createEvent(adminToken, totalSeats);
  return activateEvent(adminToken, event.id);
};
