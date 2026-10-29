import { EachMessagePayload, Kafka, type Consumer } from "kafkajs";
import { type Logger } from "pino";
import z from "zod";
import { TOPIC_SCHEMAS } from "./scehmas";
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

export interface ConsumerFactoryConfig {
  brokers: string[];
  clientId: string;
  groupId: string;
  logger: Logger;
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
  const { brokers, clientId, groupId, logger } = config;

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
    rawValue: string,
    error: Error,
    retryCount: number,
  ): Promise<void> => {
    const dlqTopic = toDlqTopic(topic);

    try {
      const dlq = await getDlqProducer();

      await dlq.publish(dlqTopic as Topic, {
        originalTopic: topic,
        originalValue: rawValue,
        error: error.message,
        errorStack: error.stack,
        failedAt: new Date().toISOString(),
        retryCount,
      });

      log.error(
        { err: error, reason, dlqTopic, retryCount },
        "Message sent to DLQ",
      );
    } catch (dlqError) {
      log.error(
        {
          err: dlqError,
          reason,
          dlqTopic,
          originalError: error.message,
          valueBytes: rawValue.length,
        },
        "Failed to send message to DLQ: message may be lost",
      );
    }
  };

  const processMessage = async (
    payload: EachMessagePayload,
    handlers: TopicHandlerMap,
  ): Promise<void> => {
    const { topic, partition, message } = payload;
    const log = logger.child({ topic, partition, offset: message.offset });

    if (!message.value) {
      log.warn("Received message with empty value, skipping");
      return;
    }

    const rawValue = message.value.toString();

    const retryCount = message.headers?.["retry-count"]
      ? parseInt(message.headers["retry-count"].toString(), 10)
      : 0;

    let parsedPayload: unknown;

    try {
      parsedPayload = JSON.parse(rawValue);
    } catch {
      await sendToDlq(
        log,
        "invalid_json",
        topic as Topic,
        rawValue,
        new Error("Invalid JSON"),
        retryCount,
      );
      return;
    }

    const schema = TOPIC_SCHEMAS[topic as Topic] as z.ZodType | undefined;

    if (!schema) {
      await sendToDlq(
        log,
        "no_schema",
        topic as Topic,
        rawValue,
        new Error(`No schema registered for topic: ${topic}`),
        retryCount,
      );
      return;
    }

    let validatedPayload: unknown;

    try {
      validatedPayload = schema.parse(parsedPayload);
    } catch (validationError) {
      await sendToDlq(
        log.child(correlationFields(parsedPayload)),
        "validation_failed",
        topic as Topic,
        rawValue,
        toError(validationError),
        retryCount,
      );
      return;
    }

    const messageLog = log.child(correlationFields(validatedPayload));

    const handler = handlers[topic as Topic];
    if (!handler) {
      messageLog.warn("No handler registered for topic, skipping message");
      return;
    }

    const startedAt = Date.now();

    try {
      await (handler as MessageHandler<unknown>)(validatedPayload, {
        topic,
        partition,
        offset: message.offset,
      });

      messageLog.debug(
        { durationMs: Date.now() - startedAt },
        "Message processed",
      );
    } catch (handlerError) {
      await sendToDlq(
        messageLog,
        "handler_failed",
        topic as Topic,
        rawValue,
        toError(handlerError),
        retryCount + 1,
      );
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
        await processMessage(payload, handlers);
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
