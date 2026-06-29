export const TOPICS = {
  EVENT_CREATED: "event-created",
  EVENT_UPDATED: "event-updated",

  SEAT_RESERVE_REQUESTED: "seat-reserve-requested",

  SEAT_RESERVED: "seat-reserved",
  SEAT_FAILED: "seat-failed",

  SEAT_RELEASE: "seat-release",

  BOOKING_SEAT_HELD: "booking-seat-held",

  PAYMENT_COMPLETED: "payment-completed",
  PAYMENT_FAILED: "payment-failed",
} as const;

export type Topic = (typeof TOPICS)[keyof typeof TOPICS];

//dlq topic
export const toDlqTopic = (topic: Topic): string => `${topic}.dlq`;
