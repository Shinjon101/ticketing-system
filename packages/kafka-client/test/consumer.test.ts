import { beforeEach, describe, expect, it, vi } from "vitest";
import pino from "pino";

interface SentRecord {
  topic: string;
  messages: Array<{ key: string | null; value: string }>;
}

const broker = vi.hoisted(() => ({
  eachMessage: undefined as undefined | ((payload: unknown) => Promise<void>),
  sent: [] as SentRecord[],
  failSend: false,
}));

vi.mock("kafkajs", () => ({
  Kafka: class {
    consumer() {
      return {
        connect: async () => {},
        subscribe: async () => {},
        run: async ({
          eachMessage,
        }: {
          eachMessage: (payload: unknown) => Promise<void>;
        }) => {
          broker.eachMessage = eachMessage;
        },
        disconnect: async () => {},
      };
    }
    producer() {
      return {
        connect: async () => {},
        disconnect: async () => {},
        send: async (record: SentRecord) => {
          if (broker.failSend) throw new Error("broker unavailable");
          broker.sent.push(record);
        },
      };
    }
  },
}));

import { createConsumer } from "../src/consumer";
import { DlqMessageSchema } from "../src/scehmas";
import { TOPICS } from "../src/topics";

const bookingId = "11111111-1111-4111-8111-111111111111";
const seatReserved = JSON.stringify({
  messageId: "22222222-2222-4222-8222-222222222222",
  bookingId,
  seatIds: ["seat-1"],
  seatNumbers: ["A1"],
  reservedAt: new Date().toISOString(),
});

const logLines: Array<Record<string, unknown>> = [];
const logger = pino(
  { level: "debug" },
  { write: (line: string) => void logLines.push(JSON.parse(line)) },
);

const handler = vi.fn<(message: unknown) => Promise<void>>();

const deliver = async (value: string) => {
  const heartbeat = vi.fn(async () => {});
  await broker.eachMessage!({
    topic: TOPICS.SEAT_RESERVED,
    partition: 0,
    message: {
      offset: "41",
      key: Buffer.from(bookingId),
      value: Buffer.from(value),
      headers: {},
    },
    heartbeat,
    pause: () => () => {},
  });
  return { heartbeat };
};

const dlqMessages = () =>
  broker.sent.map((record) => ({
    topic: record.topic,
    key: record.messages[0]?.key,
    message: DlqMessageSchema.parse(
      JSON.parse(record.messages[0]?.value ?? ""),
    ),
  }));

beforeEach(async () => {
  broker.sent = [];
  broker.failSend = false;
  logLines.length = 0;
  handler.mockReset();

  const consumer = createConsumer({
    brokers: ["localhost:9092"],
    clientId: "test",
    groupId: "test-group",
    logger,
    retry: { attempts: 3, baseDelayMs: 0 },
  });
  await consumer.subscribe({ [TOPICS.SEAT_RESERVED]: handler });
});

describe("handler retries", () => {
  it("retries a failing handler and stops once it succeeds", async () => {
    handler
      .mockRejectedValueOnce(new Error("deadlock detected"))
      .mockRejectedValueOnce(new Error("deadlock detected"))
      .mockResolvedValueOnce();

    const { heartbeat } = await deliver(seatReserved);

    expect(handler).toHaveBeenCalledTimes(3);
    expect(heartbeat).toHaveBeenCalledTimes(2);
    expect(broker.sent).toHaveLength(0);
  });

  it("sends the message to the DLQ with its key after the last attempt", async () => {
    handler.mockRejectedValue(new Error("deadlock detected"));

    await deliver(seatReserved);

    expect(handler).toHaveBeenCalledTimes(3);
    expect(dlqMessages()).toEqual([
      {
        topic: "seat-reserved.dlq",
        key: bookingId,
        message: expect.objectContaining({
          originalTopic: TOPICS.SEAT_RESERVED,
          originalKey: bookingId,
          originalValue: seatReserved,
          error: "deadlock detected",
          attempts: 3,
        }),
      },
    ]);
    expect(
      logLines.filter((line) => line.msg === "Message sent to DLQ"),
    ).toEqual([expect.objectContaining({ level: 50, bookingId })]);
  });

  it("does not retry a message that is not valid JSON", async () => {
    await deliver("{not json");

    expect(handler).not.toHaveBeenCalled();
    expect(dlqMessages()[0]?.message).toMatchObject({
      error: "Invalid JSON",
      attempts: 1,
    });
  });

  it("throws when the DLQ publish fails so Kafka redelivers the message", async () => {
    handler.mockRejectedValue(new Error("deadlock detected"));
    broker.failSend = true;

    await expect(deliver(seatReserved)).rejects.toThrow("broker unavailable");
  });

  it("refuses a retry setting that would never call the handler", () => {
    expect(() =>
      createConsumer({
        brokers: ["localhost:9092"],
        clientId: "test",
        groupId: "test-group",
        logger,
        retry: { attempts: 0, baseDelayMs: 0 },
      }),
    ).toThrow("retry.attempts must be at least 1");
  });
});
