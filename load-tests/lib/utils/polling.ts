import { sleep } from "k6";
import {
  BOOKING_POLL_TIMEOUT_MS,
  BOOKING_POLL_INTERVAL_MS,
} from "../../config/config.ts";

export interface BookingLike {
  status?: string | null;
  [key: string]: unknown;
}

export const pollUntil = <T>(
  fetchFn: () => T | null,
  isDone: (value: T) => boolean,
  timeoutMs: number = BOOKING_POLL_TIMEOUT_MS,
  intervalMs: number = BOOKING_POLL_INTERVAL_MS,
): { result: T | null; timedOut: boolean } => {
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

export function isBookingTerminal(
  booking: BookingLike | null | undefined,
): boolean {
  return TERMINAL_STATES.has(booking?.status ?? "");
}

export function isSeatHeldOrTerminal(
  booking: BookingLike | null | undefined,
): boolean {
  return booking?.status === "seat_held" || isBookingTerminal(booking);
}
