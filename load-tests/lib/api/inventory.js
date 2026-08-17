import http from "k6/http";
import { check } from "k6";
import { publicHeaders } from "../../config/headers.js";
import { BASE_URL } from "../../config/config.js";

export function getAvailableSeats(eventId) {
  const res = http.get(`${BASE_URL}/inventory/seats/${eventId}/available`, {
    headers: publicHeaders(),
  });

  const ok = check(res, {
    "getAvailableSeats: 200 OK": (r) => r.status === 200,
  });

  if (!ok) return null;

  return JSON.parse(res.body).available;
}
