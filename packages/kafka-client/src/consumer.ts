import { EachMessagePayload, Kafka, type Consumer } from "kafkajs";
import { type Logger } from "pino";
import z from "zod";
import { TOPIC_SCHEMAS, type DlqMessage } from "./scehmas";
import { toDlqTopic, Topic } from "./topics";
import { createProducer, KafkaProducer } from "./producer";
import { correlationFields } from "./correlation";

type DlqReason =
  | "invalid_json"
  | "no_schema"
  | "validation_failed"
  | "handler_failed";

const toError = (err: unknown): Error =>
  err instanceof Error ? err : new Error(String(err));

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
}

const DEFAULT_RETRY: RetryOptions = { attempts: 3, baseDelayMs: 200 };

// "error" means processing threw (e.g. the DLQ was unreachable), so the offset
// stays uncommitted and Kafka will redeliver the message.
export type ConsumedMessageOutcome = "processed" | "dlq" | "skipped" | "error";

export interface ConsumedMessageObservation {
  topic: string;
  // Measured from the record's produce timestamp, so it covers time in Kafka
  // plus time queued behind earlier messages. Null if the record has none.
  waitSeconds: number | null;
  processingSeconds: number;
  attempts: number;
  outcome: ConsumedMessageOutcome;
}

interface ProcessResult {
  outcome: Exclude<ConsumedMessageOutcome, "error">;
  attempts: number;
}

export interface ConsumerFactoryConfig {
  brokers: string[];
  clientId: string;
  groupId: string;
  logger: Logger;
  retry?: RetryOptions;
  onMessageObserved?: (observation: ConsumedMessageObservation) => void;
}

export type MessageHandler<T> = (
  message: T,
  meta: { topic: string; partition: number; offset: string },
) => Promise<void>;

type TopicHandlerMap = {
  [K in Topic]?: MessageHandler<z.infer<(typeof TOPIC_SCHEMAS)[K]>>;
};

export interface KafkaConsumer {
  subscribe: (handlers: TopicHandlerMap) => Promise<void>;
  disconnect: () => Promise<void>;
}

export function createConsumer(config: ConsumerFactoryConfig): KafkaConsumer {
  const { brokers, clientId, groupId, logger, onMessageObserved } = config;
  const retry = config.retry ?? DEFAULT_RETRY;

  if (retry.attempts < 1) {
    throw new Error("retry.attempts must be at least 1");
  }

  const kafka = new Kafka({
    clientId,
    brokers,
    retry: {
      initialRetryTime: 100,
      retries: 8,
    },
  });

  const consumer: Consumer = kafka.consumer({
    groupId,
    sessionTimeout: 30_000,
    heartbeatInterval: 3_000,
  });

  let dlqProducer: KafkaProducer | null = null;

  const getDlqProducer = async (): Promise<KafkaProducer> => {
    if (!dlqProducer) {
      dlqProducer = createProducer({
        brokers,
        clientId: `${clientId}-dlq-producer`,
        logger,
      });
      await dlqProducer.connect();
    }
    return dlqProducer;
  };

  const sendToDlq = async (
    log: Logger,
    reason: DlqReason,
    topic: Topic,
    key: string | null,
    rawValue: string,
    error: Error,
    attempts: number,
  ): Promise<void> => {
    const dlqTopic = toDlqTopic(topic);
    const dlqMessage: DlqMessage = {
      originalTopic: topic,
      originalKey: key,
      originalValue: rawValue,
      error: error.message,
      errorStack: error.stack,
      attempts,
      failedAt: new Date().toISOString(),
    };

    try {
      const dlq = await getDlqProducer();
      await dlq.publish(dlqTopic as Topic, dlqMessage, key ?? undefined);
    } catch (dlqError) {
      log.error(
        { err: dlqError, reason, dlqTopic, originalError: error.message },
        "Failed to send message to DLQ: leaving it uncommitted for redelivery",
      );
      throw dlqError;
    }

    log.error(
      { err: error, reason, dlqTopic, attempts },
      "Message sent to DLQ",
    );
  };

  const processMessage = async (
    payload: EachMessagePayload,
    handlers: TopicHandlerMap,
  ): Promise<ProcessResult> => {
    const { topic, partition, message } = payload;
    const log = logger.child({ topic, partition, offset: message.offset });

    if (!message.value) {
      log.warn("Received message with empty value, skipping");
      return { outcome: "skipped", attempts: 0 };
    }

    const rawValue = message.value.toString();
    const key = message.key?.toString() ?? null;

    let parsedPayload: unknown;

    try {
      parsedPayload = JSON.parse(rawValue);
    } catch {
      await sendToDlq(
        log,
        "invalid_json",
        topic as Topic,
        key,
        rawValue,
        new Error("Invalid JSON"),
        1,
      );
      return { outcome: "dlq", attempts: 0 };
    }

    const schema = TOPIC_SCHEMAS[topic as Topic] as z.ZodType | undefined;

    if (!schema) {
      await sendToDlq(
        log,
        "no_schema",
        topic as Topic,
        key,
        rawValue,
        new Error(`No schema registered for topic: ${topic}`),
        1,
      );
      return { outcome: "dlq", attempts: 0 };
    }

    let validatedPayload: unknown;

    try {
      validatedPayload = schema.parse(parsedPayload);
    } catch (validationError) {
      await sendToDlq(
        log.child(correlationFields(parsedPayload)),
        "validation_failed",
        topic as Topic,
        key,
        rawValue,
        toError(validationError),
        1,
      );
      return { outcome: "dlq", attempts: 0 };
    }

    const messageLog = log.child(correlationFields(validatedPayload));

    const handler = handlers[topic as Topic];
    if (!handler) {
      messageLog.warn("No handler registered for topic, skipping message");
      return { outcome: "skipped", attempts: 0 };
    }

    const meta = { topic, partition, offset: message.offset };

    for (let attempt = 1; attempt <= retry.attempts; attempt += 1) {
      const startedAt = Date.now();

      try {
        await (handler as MessageHandler<unknown>)(validatedPayload, meta);
        messageLog.debug(
          { durationMs: Date.now() - startedAt, attempt },
          "Message processed",
        );
        return { outcome: "processed", attempts: attempt };
      } catch (handlerError) {
        const error = toError(handlerError);

        if (attempt === retry.attempts) {
          await sendToDlq(
            messageLog,
            "handler_failed",
            topic as Topic,
            key,
            rawValue,
            error,
            attempt,
          );
          return { outcome: "dlq", attempts: attempt };
        }

        const delayMs = retry.baseDelayMs * 2 ** (attempt - 1);
        messageLog.warn(
          { err: error, attempt, delayMs },
          "Handler failed, retrying",
        );
        await payload.heartbeat();
        await sleep(delayMs);
      }
    }

    // Unreachable: retry.attempts >= 1, and the last attempt either returns
    // or sends to the DLQ. Kept so the return type holds.
    return { outcome: "dlq", attempts: retry.attempts };
  };

  // Observation must never affect consumption, so a throwing observer is
  // logged and swallowed rather than allowed to fail the message.
  const observe = (
    payload: EachMessagePayload,
    startedAt: number,
    result: ProcessResult | null,
  ): void => {
    if (!onMessageObserved) return;

    const producedAt = Number(payload.message.timestamp);
    const hasTimestamp = Number.isFinite(producedAt) && producedAt > 0;

    try {
      onMessageObserved({
        topic: payload.topic,
        // Clamped: producer and consumer clocks can disagree slightly.
        waitSeconds: hasTimestamp
          ? Math.max(0, (startedAt - producedAt) / 1000)
          : null,
        processingSeconds: (Date.now() - startedAt) / 1000,
        attempts: result?.attempts ?? 0,
        outcome: result?.outcome ?? "error",
      });
    } catch (err) {
      logger.warn({ err, topic: payload.topic }, "Message observer threw");
    }
  };

  const subscribe = async (handlers: TopicHandlerMap): Promise<void> => {
    const topics = Object.keys(handlers) as Topic[];

    await consumer.connect();
    logger.info(
      { brokers, clientId, groupId, topics },
      "Consumer connected and subscribing to topics",
    );

    for (const topic of topics) {
      await consumer.subscribe({ topic, fromBeginning: false });
    }

    await consumer.run({
      eachMessage: async (payload) => {
        const startedAt = Date.now();
        let result: ProcessResult | null = null;

        try {
          result = await processMessage(payload, handlers);
        } finally {
          observe(payload, startedAt, result);
        }
      },
    });
  };

  const disconnect = async (): Promise<void> => {
    await consumer.disconnect();
    if (dlqProducer) {
      await dlqProducer.disconnect();
    }
    logger.info("Kafka consumer disconnected");
  };

  return {
    subscribe,
    disconnect,
  };
}
