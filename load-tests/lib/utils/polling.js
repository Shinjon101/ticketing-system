import { sleep } from "k6";
import {
  BOOKING_POLL_TIMEOUT_MS,
  BOOKING_POLL_INTERVAL_MS,
} from "../../config.js";

export const pollUntil = (
  fetchFn,
  isDone,
  timeoutMs = BOOKING_POLL_TIMEOUT_MS,
  intervalMs = BOOKING_POLL_INTERVAL_MS,
) => {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const result = fetchFn();

    if (result !== null && isDone(result)) {
      return { result, timedOut: false };
    }

    sleep(intervalMs / 1000);
  }

  return { result: null, timedOut: true };
};

const TERMINAL_STATES = new Set(["confirmed", "failed", "cancelled"]);

export function isBookingTerminal(booking) {
  return TERMINAL_STATES.has(booking?.status);
}

export function isSeatHeldOrTerminal(booking) {
  return booking?.status === "seat_held" || isBookingTerminal(booking);
}
