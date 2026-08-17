import http from "k6/http";
import { check } from "k6";
import { publicHeaders } from "../../config/headers.ts";
import { BASE_URL } from "../../config/config.ts";

export function getAvailableSeats(eventId: string): number | null {
  const res = http.get(`${BASE_URL}/inventory/seats/${eventId}/available`, {
    headers: publicHeaders(),
  });

  const ok = check(res, {
    "getAvailableSeats: 200 OK": (r) => r.status === 200,
  });

  return ok ? (res.json() as { available: number }).available : null;
}
