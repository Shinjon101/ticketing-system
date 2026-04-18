import { EachMessagePayload, Kafka, Message, type Consumer } from "kafkajs";
import { type Logger } from "pino";
import z from "zod";
import { TOPIC_SCHEMAS } from "./scehmas";
import { toDlqTopic, Topic } from "./topics";
import { createProducer, KafkaProducer } from "./producer";

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
    topic: Topic,
    rawValue: string,
    error: Error,
    retryCount: number,
  ): Promise<void> => {
    try {
      const dlq = await getDlqProducer();
      const dlqTopic = toDlqTopic(topic);

      await dlq.publish(dlqTopic as Topic, {
        originalTopic: topic,
        originalValue: rawValue,
        error: error.message,
        errorStack: error.stack,
        failedAt: new Date().toISOString(),
        retryCount,
      });

      logger.warn(
        {
          topic,
          dlqTopic,
          error: error.message,
          retryCount,
        },
        "Message sent to DLQ",
      );
    } catch (dlqError) {
      logger.error(
        { topic, rawValue, dlqError },
        "Failed to send message to DLQ: message may be lost",
      );
    }
  };

  const processMessage = async (
    payload: EachMessagePayload,
    handlers: TopicHandlerMap,
  ): Promise<void> => {
    const { topic, partition, message } = payload;

    if (!message.value) {
      logger.warn(
        { topic, partition, offset: message.offset },
        "Received message with empty value, skipping",
      );
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
      logger.error({ topic, rawValue }, "Message value is not valid JSON");
      await sendToDlq(
        topic as Topic,
        rawValue,
        new Error("Invalid JSON"),
        retryCount,
      );

      return;
    }

    const schema = TOPIC_SCHEMAS[topic as Topic] as z.ZodType | undefined;

    if (!schema) {
      logger.error({ topic }, "No schema registered for topic");
      await sendToDlq(
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
      logger.error(
        { topic, rawValue, validationError, parsedPayload },
        "Message value failed validation",
      );
      await sendToDlq(
        topic as Topic,
        rawValue,
        validationError instanceof Error
          ? validationError
          : new Error(String(validationError)),
        retryCount,
      );
      return;
    }

    const handler = handlers[topic as Topic];
    if (!handler) {
      logger.warn(
        { topic },
        "No handler registered for topic, skipping message",
      );
      return;
    }

    logger.info(
      {
        topic,
        partition,
        offset: message.offset,
        messageId: (validatedPayload as { messageId?: string }).messageId,
      },
      "Processing message",
    );

    try {
      await (handler as MessageHandler<unknown>)(validatedPayload, {
        topic,
        partition,
        offset: message.offset,
      });

      logger.info(
        {
          topic,
          partition,
          offset: message.offset,
          messageId: (validatedPayload as { messageId?: string }).messageId,
        },
        "Message processed successfully",
      );
    } catch (handlerError) {
      logger.error(
        { topic, partition, offset: message.offset, handlerError },
        "Message handler threw : sending to DLQ",
      );

      await sendToDlq(
        topic as Topic,
        rawValue,
        handlerError instanceof Error
          ? handlerError
          : new Error(String(handlerError)),
        retryCount + 1,
      );
    }
  };

  const subscribe = async (handlers: TopicHandlerMap): Promise<void> => {
    const topics = Object.keys(handlers) as Topic[];

    await consumer.connect();
    logger.info(
      { brokers, clientId, groupId, topics },
      "Cosumer connected and subscribing to topics",
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
