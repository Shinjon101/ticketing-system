const CORRELATION_KEYS = ["messageId", "bookingId", "eventId"] as const;

export const correlationFields = (payload: unknown): Record<string, string> => {
  if (typeof payload !== "object" || payload === null) {
    return {};
  }

  const fields: Record<string, string> = {};
  for (const key of CORRELATION_KEYS) {
    const value = (payload as Record<string, unknown>)[key];
    if (typeof value === "string") {
      fields[key] = value;
    }
  }
  return fields;
};
