import { Counter, Trend } from "k6/metrics";

export const seatReservedCounter = new Counter("k6_seat_reserved_total");
export const seatFailedCounter = new Counter("k6_seat_failed_total");
export const pollTimeoutCounter = new Counter("k6_poll_timeout_total");

export const sagaResolutionTrend = new Trend("saga_resolution_duration_ms");
