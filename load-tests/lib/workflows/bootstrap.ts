import { sleep } from "k6";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "../../config/config.ts";
import logger from "../../config/logger.ts";
import { login, register } from "../api/auth.ts";
import { createBooking } from "../api/bookings.ts";
import { createAndActivateEvent } from "../api/events.ts";
import { getAvailableSeats } from "../api/inventory.ts";
import { pollUntil } from "../utils/polling.ts";

export interface Config {
  totalSeats: number;
  userPoolSize: number;
}

export const setupTest = (config: Config) => {
  const { totalSeats, userPoolSize } = config;
  logger.info(`Starting Setup: ${userPoolSize} users, ${totalSeats} seats`);

  const adminToken = login(ADMIN_EMAIL, ADMIN_PASSWORD);
  logger.info("Admin Logged in");

  const event = createAndActivateEvent(adminToken, totalSeats);
  const eventId = event.id;
  logger.info(`Event created & activated:  ${eventId}`);

  logger.info("Waiting for Inventory service to seed seats via Kafka...");
  const inventorySync = pollUntil(
    () => getAvailableSeats(eventId),
    (seats) => seats === config.totalSeats,
    30_000, //30s timeout
    1_000, // 1s poll interval
  );

  if (inventorySync.timedOut) {
    throw new Error(
      `Inventory never seeded ${config.totalSeats} seats for ${eventId}`,
    );
  }

  logger.info(`Inventory seeded exactly ${config.totalSeats} seats.`);

  sleep(2);

  logger.info(`Registering pool of ${config.userPoolSize} concurrent users...`);
  const userTokens = [];
  const runId = Date.now();

  for (let i = 0; i < config.userPoolSize; i++) {
    const { accessToken } = register(
      `k6-user-${runId}-${i}@test.local`,
      "LoadTest123!",
    );
    userTokens.push(accessToken);
  }

  logger.info("Registered ${userTokens.length} test users.");

  return { eventId, userTokens };
};
