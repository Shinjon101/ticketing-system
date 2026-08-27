import { TOTAL_SEATS } from "../config/config.ts";
import { flashSaleProfile } from "../config/profiles.ts";
import { vu } from "k6/execution";
import { createBooking, getBooking } from "../lib/api/bookings.ts";
import {
  pollTimeoutCounter,
  sagaResolutionTrend,
  seatFailedCounter,
  seatReservedCounter,
} from "../lib/utils/metrics.ts";
import { isSeatHeldOrTerminal, pollUntil } from "../lib/utils/polling.ts";
import { setupTest } from "../lib/workflows/bootstrap.ts";

const USER_POOL_SIZE = 100;
export const options = flashSaleProfile;

export function setup() {
  return setupTest({ totalSeats: TOTAL_SEATS, userPoolSize: USER_POOL_SIZE });
}

export default function (data: { eventId: string; userTokens: string[] }) {
  const vuId = vu.idInTest;
  const token = data.userTokens[vuId % data.userTokens.length];
  const idempotencyKey = crypto.randomUUID();

  const bookingRes = createBooking(token, data.eventId, idempotencyKey, 1);
  if (!bookingRes) return;

  const start = Date.now();

  const { result: booking, timedOut } = pollUntil(
    () => getBooking(token, bookingRes.booking.id),
    isSeatHeldOrTerminal,
  );

  if (timedOut) {
    pollTimeoutCounter.add(1);
    return;
  }

  sagaResolutionTrend.add(Date.now() - start);

  if (booking?.status === "seat_held") {
    seatReservedCounter.add(1);
  } else if (booking?.status === "failed") {
    seatFailedCounter.add(1);
  }
}
