export const TOPICS = {
  EVENT_CREATED: "event-created",
  EVENT_UPDATED: "event-updated",
  SEAT_RESERVE_REQUESTED: "seat-reserve-requested",
  SEAT_RESERVED: "seat-reserved",
  SEAT_FAILED: "seat-failed",
} as const;

export type Topic = (typeof TOPICS)[keyof typeof TOPICS];

//dlq topic
export const toDlqTopic = (topic: Topic): string => `${topic}.dlq`;
