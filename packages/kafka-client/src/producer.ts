import { Kafka, type ProducerConfig } from "kafkajs";
import { type Logger } from "pino";
import { type Topic } from "./topics";

export interface ProducerFactoryConfig {
  brokers: string[];
  clientId: string;
  logger: Logger;
  producerConfig?: ProducerConfig;
}

export interface KafkaProducer {
  publish: <T extends Record<string, unknown>>(
    topic: Topic,
    message: T,
    key?: string,
  ) => Promise<void>;

  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

export function createProducer(config: ProducerFactoryConfig): KafkaProducer {
  const { brokers, clientId, logger, producerConfig = {} } = config;

  const kafka = new Kafka({
    clientId,
    brokers,
    retry: {
      retries: 8,
      initialRetryTime: 100,
    },
  });

  const producer = kafka.producer({
    idempotent: true,
    ...producerConfig,
  });

  const publish = async <T extends Record<string, unknown>>(
    topic: Topic,
    message: T,
    key?: string,
  ): Promise<void> => {
    const value = JSON.stringify(message);

    await producer.send({
      topic,
      messages: [
        {
          key: key ?? null,
          value,
          headers: {
            "content-type": "application/json",
            "source-service": clientId,
          },
        },
      ],
    });

    logger.info(
      {
        topic,
        key: key ?? "none",
        messageId: (message as { messageId?: string }).messageId,
      },
      "Message published",
    );
  };

  const connect = async (): Promise<void> => {
    await producer.connect();
    logger.info({ brokers, clientId }, "Producer connected");
  };

  const disconnect = async (): Promise<void> => {
    await producer.disconnect();
    logger.info({ brokers, clientId }, "Producer disconnected");
  };

  return {
    publish,
    connect,
    disconnect,
  };
}
