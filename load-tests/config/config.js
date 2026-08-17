export const BASE_URL = __ENV.BASE_URL || "http://localhost:80";

export const TOTAL_SEATS = parseInt(__ENV.TOTAL_SEATS || "50", 10);
export const EVENT_PRICE = parseInt(__ENV.EVENT_PRICE || "50000", 10); // 500 INR in paise

export const RAZORPAY_KEY_SECRET = __ENV.RAZORPAY_KEY_SECRET || "";
export const RAZORPAY_WEBHOOK_SECRET = __ENV.RAZORPAY_WEBHOOK_SECRET || "";

export const BOOKING_POLL_TIMEOUT_MS = 60_000;
export const BOOKING_POLL_INTERVAL_MS = 1_000;
